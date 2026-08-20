#!/usr/bin/env bash
#
# Ensayo integro, con herramientas reales, de creacion + verificacion +
# restauracion de un backup usando exclusivamente infraestructura ficticia
# y local (dos contenedores Postgres desechables y dos MinIO desechables).
#
# No lee ni usa ningun secret real. No se conecta a Supabase, R2 ni Vercel
# reales. Disenado para invocarse solo desde
# .github/workflows/backup-restore-drill-fake.yml, en un runner efimero.

set -Eeuo pipefail
umask 077

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKDIR="${GITHUB_WORKSPACE:-$REPO_ROOT}/ensayo-restore"
PGCLIENT_DIR="$WORKDIR/pgclient-bin"

readonly ORIGIN_DB_PORT=55432
readonly DEST_DB_PORT=55433
readonly MINIO_ORIGIN_S3_PORT=9000
readonly MINIO_ORIGIN_CONSOLE_PORT=9001
readonly MINIO_VAULT_S3_PORT=9010
readonly MINIO_VAULT_CONSOLE_PORT=9011
readonly PG_PASSWORD="ensayo-postgres-password"
readonly MINIO_ORIGIN_USER="ensayo-source"
readonly MINIO_ORIGIN_PASS="ensayo-source-pass"
readonly MINIO_VAULT_USER="ensayo-vault"
readonly MINIO_VAULT_PASS="ensayo-vault-pass"
readonly FAKE_BUCKET_ORIGIN="ensayo-storage-origen"
readonly FAKE_BUCKET_VAULT="ensayo-backups-vault"
# Fijo y determinista a proposito (requisito: que el dia del mes no cambie
# el tier). Dia "15" nunca activa la rama mensual de create-production-backup.sh.
readonly FAKE_SNAPSHOT_ID="20990615T000000Z"
readonly FAKE_SNAPSHOT_PATH="daily/${FAKE_SNAPSHOT_ID}"

PG_IMAGE="${ENSAYO_PG_IMAGE:?falta ENSAYO_PG_IMAGE (imagen+digest de Postgres fijados en el workflow)}"
MINIO_IMAGE="${ENSAYO_MINIO_IMAGE:?falta ENSAYO_MINIO_IMAGE (imagen+digest de MinIO fijados en el workflow)}"
readonly PG_IMAGE MINIO_IMAGE

log() { printf '[ensayo] %s\n' "$*"; }
die() { printf '[ensayo][ERROR] %s\n' "$*" >&2; exit 1; }

# --- Barrera: ninguna variable que pudiera venir de produccion sobrevive. ---
clear_inherited_production_vars() {
  local var
  for var in \
    SUPABASE_ACCESS_TOKEN \
    PRODUCTION_SUPABASE_PROJECT_REF PRODUCTION_SUPABASE_DB_URL \
    PRODUCTION_SUPABASE_S3_ENDPOINT PRODUCTION_SUPABASE_S3_REGION \
    PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY \
    SUPABASE_DB_URL \
    SUPABASE_S3_ENDPOINT SUPABASE_S3_REGION SUPABASE_S3_ACCESS_KEY_ID SUPABASE_S3_SECRET_ACCESS_KEY \
    R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
    RCLONE_CRYPT_PASSWORD RCLONE_CRYPT_PASSWORD2 \
    NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
    BACKUP_ENABLED
  do
    unset "$var" 2>/dev/null || true
  done
  log "Variables que pudieran venir de produccion o de otros entornos: limpiadas"
}

# --- Barrera: cualquier endpoint usado debe ser local o el contenedor ficticio esperado. ---
assert_local_endpoint() {
  local label="$1" url="$2"
  case "$url" in
    http://127.0.0.1:"$MINIO_ORIGIN_S3_PORT"* | http://127.0.0.1:"$MINIO_VAULT_S3_PORT"*) ;;
    postgresql://*@127.0.0.1:"$ORIGIN_DB_PORT"/* | postgresql://*@127.0.0.1:"$DEST_DB_PORT"/*) ;;
    *) die "$label no apunta a un endpoint local/ficticio esperado: $url" ;;
  esac
}

cleanup() {
  log "Limpieza: solo contenedores y carpetas creados por este ensayo"
  docker rm -f ensayo-pg-origen ensayo-pg-destino ensayo-minio-origen ensayo-minio-vault >/dev/null 2>&1 || true
  rm -rf -- "$WORKDIR"
}
trap cleanup EXIT

wait_for_postgres() {
  local port="$1" label="$2" i
  for i in $(seq 1 30); do
    if PGPASSWORD="$PG_PASSWORD" "$PGCLIENT_DIR/pg_isready" -h 127.0.0.1 -p "$port" -U postgres >/dev/null 2>&1; then
      log "$label listo (puerto $port)"
      return 0
    fi
    sleep 2
  done
  die "$label no respondio tras agotar los intentos de pg_isready (60s)"
}

wait_for_minio() {
  local port="$1" label="$2" i
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${port}/minio/health/live" >/dev/null 2>&1; then
      log "$label listo (puerto $port)"
      return 0
    fi
    sleep 2
  done
  die "$label no respondio tras agotar los intentos de health check (60s)"
}

extract_pg_client_tools() {
  log "Extrayendo pg_dump/pg_restore/psql/pg_isready del contenedor de origen"
  mkdir -p "$PGCLIENT_DIR"
  local bin path
  for bin in pg_dump pg_restore psql pg_isready; do
    path="$(docker exec ensayo-pg-origen which "$bin")"
    docker cp "ensayo-pg-origen:${path}" "$PGCLIENT_DIR/$bin"
    chmod +x "$PGCLIENT_DIR/$bin"
  done

  log "Comprobando bibliotecas dinamicas de los binarios extraidos"
  for bin in pg_dump pg_restore psql pg_isready; do
    local missing
    missing="$(ldd "$PGCLIENT_DIR/$bin" 2>&1 | grep "not found" || true)"
    [[ -z "$missing" ]] || die "Bibliotecas dinamicas ausentes para $bin: $missing"
  done
  log "Bibliotecas dinamicas resueltas para los 4 binarios"
}

smoke_test_pg_client_tools() {
  log "Smoke test: demostrando que pg_dump/pg_restore/psql extraidos funcionan de verdad"
  local url="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${ORIGIN_DB_PORT}/postgres"
  local dump="$WORKDIR/smoke.dump"

  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$url" -c \
    "create schema ensayo_smoke; create table ensayo_smoke.t (v text); insert into ensayo_smoke.t values ('smoke-ok');"
  "$PGCLIENT_DIR/pg_dump" --format=custom --no-owner --no-acl --schema=ensayo_smoke --file="$dump" "$url"
  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$url" -c "drop schema ensayo_smoke cascade;"
  "$PGCLIENT_DIR/pg_restore" --no-owner --no-acl -d "$url" "$dump"

  local result
  result="$("$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 -tAc "select v from ensayo_smoke.t" "$url")"
  [[ "$result" == "smoke-ok" ]] || die "Smoke test fallido: se esperaba 'smoke-ok', se obtuvo '$result'"
  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$url" -c "drop schema ensayo_smoke cascade;"
  log "Smoke test superado: los binarios extraidos funcionan end-to-end"
}

seed_fake_database_rows() {
  local url="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${ORIGIN_DB_PORT}/postgres"
  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$url" -c "
    create table ensayo_backup_demo (
      id uuid primary key default gen_random_uuid(),
      etiqueta text not null
    );
    insert into ensayo_backup_demo (etiqueta) values ('ficticio-uno'), ('ficticio-dos'), ('ficticio-tres');
  "
  log "Tabla ensayo_backup_demo sembrada con 3 filas ficticias"
}

create_fake_storage_files() {
  mkdir -p "$WORKDIR/ficticios"
  printf 'contenido-ficticio-ensayo-1\n' > "$WORKDIR/ficticios/archivo-1.txt"
  printf 'contenido-ficticio-ensayo-2\n' > "$WORKDIR/ficticios/archivo-2.txt"
  printf 'contenido-ficticio-ensayo-3\n' > "$WORKDIR/ficticios/archivo-3.txt"
}

create_buckets_and_upload_fixtures() {
  # Reutiliza exactamente la misma construccion de remotos rclone que usa
  # el backup real, para que el ensayo sea fiel y no una aproximacion aparte.
  # shellcheck source=common.sh
  source "$REPO_ROOT/scripts/backup/common.sh"
  backup_configure_rclone

  rclone mkdir "supabase:${FAKE_BUCKET_ORIGIN}"
  rclone mkdir "r2raw:${FAKE_BUCKET_VAULT}"
  rclone copy "$WORKDIR/ficticios" "supabase:${FAKE_BUCKET_ORIGIN}"
  log "Buckets ficticios creados y 3 archivos ficticios subidos al origen"
}

compare_restored_rows() {
  local origin_url="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${ORIGIN_DB_PORT}/postgres"
  local dest_url="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${DEST_DB_PORT}/postgres"
  local origin_rows dest_rows dest_count
  origin_rows="$("$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 -tAc "select etiqueta from ensayo_backup_demo order by etiqueta" "$origin_url")"
  dest_rows="$("$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 -tAc "select etiqueta from ensayo_backup_demo order by etiqueta" "$dest_url")"
  [[ "$origin_rows" == "$dest_rows" ]] || die "Filas restauradas distintas del origen. Origen=[$origin_rows] Destino=[$dest_rows]"
  dest_count="$(printf '%s\n' "$dest_rows" | grep -c .)"
  [[ "$dest_count" -eq 3 ]] || die "Se esperaban exactamente 3 filas restauradas, se obtuvieron $dest_count"
  log "3/3 filas restauradas verificadas byte a byte contra el origen"
}

compare_restored_files() {
  local f orig rest
  for f in archivo-1.txt archivo-2.txt archivo-3.txt; do
    orig="$(sha256sum "$WORKDIR/ficticios/$f" | cut -d' ' -f1)"
    # El backup de Storage preserva el nombre del bucket de origen.
    rest="$(sha256sum "$WORKDIR/kit/storage/${FAKE_BUCKET_ORIGIN}/$f" | cut -d' ' -f1)"
    [[ "$orig" == "$rest" ]] || die "Checksum SHA-256 distinto en $f (origen=$orig restaurado=$rest)"
  done
  log "3/3 archivos restaurados verificados por SHA-256 contra el origen"
}

verify_completed_marker_and_dump_files() {
  local marker
  marker="$(tr -d '\r\n' < "$WORKDIR/kit/COMPLETED")"
  [[ "$marker" == "$FAKE_SNAPSHOT_ID" ]] || die "El marcador COMPLETED no coincide con el snapshot ficticio: '$marker'"
  local f
  for f in roles.sql schema.sql data.sql full-database.dump; do
    [[ -s "$WORKDIR/kit/database/$f" ]] || die "Falta o esta vacio en el restore kit: $f"
  done
  log "Marcador COMPLETED y los 4 ficheros del dump verificados"
}

verify_vault_opacity() {
  log "Comprobando opacidad del vault cifrado (vista raw, sin pasar por rclone crypt)"
  local raw_listing="$WORKDIR/vault-raw-listing.json"
  rclone lsjson "r2raw:${FAKE_BUCKET_VAULT}" --recursive > "$raw_listing"

  local forbidden_names=(
    "$FAKE_SNAPSHOT_ID" "manifest.json" "COMPLETED" "database.tar.gz"
    "$FAKE_BUCKET_ORIGIN" "archivo-1.txt" "archivo-2.txt" "archivo-3.txt"
  )
  local term
  for term in "${forbidden_names[@]}"; do
    if grep -qF -- "$term" "$raw_listing"; then
      die "Nombre en claro encontrado en el listado raw del vault: $term"
    fi
  done

  local paths p
  paths="$(node -e '
    const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const r of rows) console.log(r.Path);
  ' "$raw_listing")"
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    if [[ ! "$p" =~ ^onyxlink-production/(daily|monthly)(/.*)?$ ]]; then
      die "Ruta raw fuera de las raices esperadas onyxlink-production/daily|monthly: $p"
    fi
  done <<< "$paths"
  log "Listado raw: solo se ven las raices onyxlink-production/daily|monthly, nada mas en claro"

  local download_dir="$WORKDIR/vault-raw-download"
  mkdir -p "$download_dir"
  rclone copy "r2raw:${FAKE_BUCKET_VAULT}" "$download_dir" --fast-list

  local content_forbidden=(
    "contenido-ficticio" "ficticio-uno" "ficticio-dos" "ficticio-tres"
    "onyxlink-backup-v1" "snapshotId" "CREATE TABLE" "INSERT INTO" "-- dump"
  )
  local raw_file
  while IFS= read -r -d '' raw_file; do
    for term in "${content_forbidden[@]}"; do
      if grep -aqF -- "$term" "$raw_file"; then
        die "Contenido en claro encontrado dentro de un objeto raw del vault ($raw_file): '$term'"
      fi
    done
  done < <(find "$download_dir" -type f -print0)
  log "Contenido raw descargado inspeccionado: ningun texto plano conocido presente"
}

main() {
  clear_inherited_production_vars

  log "Fase 1/9: arrancando Postgres de origen (${PG_IMAGE})"
  docker run -d --name ensayo-pg-origen -p "${ORIGIN_DB_PORT}:5432" \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" "$PG_IMAGE" >/dev/null
  mkdir -p "$WORKDIR"
  extract_pg_client_tools
  wait_for_postgres "$ORIGIN_DB_PORT" "Postgres origen"
  smoke_test_pg_client_tools
  seed_fake_database_rows

  log "Fase 2/9: arrancando los dos MinIO ficticios (${MINIO_IMAGE})"
  docker run -d --name ensayo-minio-origen -p "${MINIO_ORIGIN_S3_PORT}:9000" -p "${MINIO_ORIGIN_CONSOLE_PORT}:9001" \
    -e "MINIO_ROOT_USER=${MINIO_ORIGIN_USER}" -e "MINIO_ROOT_PASSWORD=${MINIO_ORIGIN_PASS}" \
    "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
  docker run -d --name ensayo-minio-vault -p "${MINIO_VAULT_S3_PORT}:9000" -p "${MINIO_VAULT_CONSOLE_PORT}:9001" \
    -e "MINIO_ROOT_USER=${MINIO_VAULT_USER}" -e "MINIO_ROOT_PASSWORD=${MINIO_VAULT_PASS}" \
    "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
  wait_for_minio "$MINIO_ORIGIN_S3_PORT" "MinIO origen"
  wait_for_minio "$MINIO_VAULT_S3_PORT" "MinIO vault"

  log "Fase 3/9: creando buckets y subiendo 3 archivos ficticios"
  create_fake_storage_files

  log "Fase 4/9: preparando variables ficticias para backup_configure_rclone()"
  local supabase_db_url="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${ORIGIN_DB_PORT}/postgres"
  local supabase_s3_endpoint="http://127.0.0.1:${MINIO_ORIGIN_S3_PORT}"
  local r2_endpoint="http://127.0.0.1:${MINIO_VAULT_S3_PORT}"
  assert_local_endpoint "SUPABASE_DB_URL" "$supabase_db_url"
  assert_local_endpoint "SUPABASE_S3_ENDPOINT" "$supabase_s3_endpoint"
  assert_local_endpoint "R2_ENDPOINT" "$r2_endpoint"

  export SUPABASE_DB_URL="$supabase_db_url"
  export SUPABASE_S3_ENDPOINT="$supabase_s3_endpoint"
  export SUPABASE_S3_REGION="us-east-1"
  export SUPABASE_S3_ACCESS_KEY_ID="$MINIO_ORIGIN_USER"
  export SUPABASE_S3_SECRET_ACCESS_KEY="$MINIO_ORIGIN_PASS"
  export R2_ENDPOINT="$r2_endpoint"
  export R2_ACCESS_KEY_ID="$MINIO_VAULT_USER"
  export R2_SECRET_ACCESS_KEY="$MINIO_VAULT_PASS"
  export R2_BUCKET="$FAKE_BUCKET_VAULT"
  # Requisito: claves crypt ficticias generadas en el runner y transformadas
  # con rclone obscure. Nunca se reutiliza ninguna clave real.
  export RCLONE_CRYPT_PASSWORD
  export RCLONE_CRYPT_PASSWORD2
  RCLONE_CRYPT_PASSWORD="$(rclone obscure "$(openssl rand -base64 24)")"
  RCLONE_CRYPT_PASSWORD2="$(rclone obscure "$(openssl rand -base64 24)")"

  create_buckets_and_upload_fixtures

  log "Fase 5/9: ejecutando backup:create real"
  (cd "$REPO_ROOT" && \
    BACKUP_RUN_ENABLED=true \
    BACKUP_CONFIRMATION=ONYXLINK_BACKUP_PRODUCTION \
    BACKUP_SNAPSHOT_ID="$FAKE_SNAPSHOT_ID" \
    npm run backup:create)

  log "Fase 6/9: ejecutando backup:verify real"
  (cd "$REPO_ROOT" && BACKUP_SNAPSHOT_PATH="$FAKE_SNAPSHOT_PATH" npm run backup:verify)

  log "Fase 7/9: preparando el restore kit real (incluyendo Storage)"
  (cd "$REPO_ROOT" && \
    BACKUP_SNAPSHOT_PATH="$FAKE_SNAPSHOT_PATH" \
    RESTORE_CONFIRMATION=PREPARE_LOCAL_RESTORE_KIT \
    RESTORE_ALLOWED_ROOT="$WORKDIR" \
    RESTORE_OUTPUT_DIR="$WORKDIR/kit" \
    RESTORE_INCLUDE_STORAGE=true \
    npm run backup:restore-kit)

  log "Fase 8/9: arrancando Postgres destino (misma imagen y digest que el origen) y restaurando"
  docker run -d --name ensayo-pg-destino -p "${DEST_DB_PORT}:5432" \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" "$PG_IMAGE" >/dev/null
  wait_for_postgres "$DEST_DB_PORT" "Postgres destino"
  local dest_url="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${DEST_DB_PORT}/postgres"
  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$dest_url" -f "$WORKDIR/kit/database/roles.sql"
  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$dest_url" -f "$WORKDIR/kit/database/schema.sql"
  "$PGCLIENT_DIR/psql" -v ON_ERROR_STOP=1 "$dest_url" -f "$WORKDIR/kit/database/data.sql"

  log "Fase 9/9: comparaciones y prueba de opacidad"
  compare_restored_rows
  compare_restored_files
  verify_completed_marker_and_dump_files
  verify_vault_opacity

  log "ENSAYO COMPLETO: backup, verificacion, restauracion y opacidad confirmados con herramientas reales sobre infraestructura ficticia."
}

main "$@"
