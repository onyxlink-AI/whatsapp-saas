#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/onyxlink-backup-test.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT INT TERM
mkdir -p "$test_root/bin" "$test_root/vault" "$test_root/source/bucket-a"
printf 'archivo ficticio\n' > "$test_root/source/bucket-a/demo.txt"

cat > "$test_root/bin/supabase" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--file" ]]; then file="$2"; shift 2; else shift; fi
done
[[ -n "$file" ]]
printf '%s\n' '-- dump ficticio sin datos reales' > "$file"
FAKE

cat > "$test_root/bin/pg_dump" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--file" ]]; then
    file="$2"
    shift 2
  elif [[ "$1" == --file=* ]]; then
    file="${1#--file=}"
    shift
  else
    shift
  fi
done
[[ -n "$file" ]]
printf 'dump-binario-ficticio\n' > "$file"
FAKE

cat > "$test_root/bin/pg_restore" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == "--list" && -s "$2" ]]
FAKE

cat > "$test_root/bin/rclone" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail

map_path() {
  case "$1" in
    vaultdaily:*) printf '%s/daily/%s' "$FAKE_VAULT" "${1#vaultdaily:}" ;;
    vaultmonthly:*) printf '%s/monthly/%s' "$FAKE_VAULT" "${1#vaultmonthly:}" ;;
    supabase:*) printf '%s/%s' "$FAKE_SOURCE" "${1#supabase:}" ;;
    *) printf '%s' "$1" ;;
  esac
}

command_name="$1"
shift
case "$command_name" in
  size)
    printf '{"count":1,"bytes":16}\n'
    ;;
  copyto)
    src="$(map_path "$1")"
    dest="$(map_path "$2")"
    mkdir -p "$(dirname -- "$dest")"
    cp "$src" "$dest"
    ;;
  copy)
    src="$(map_path "$1")"
    dest="$(map_path "$2")"
    mkdir -p "$dest"
    cp -R "$src"/. "$dest"/
    ;;
  check)
    src="$(map_path "$1")"
    dest="$(map_path "$2")"
    diff -qr "$src" "$dest" >/dev/null
    ;;
  *)
    printf 'Comando rclone ficticio inesperado: %s\n' "$command_name" >&2
    exit 2
    ;;
esac
FAKE

chmod 700 "$test_root/bin/"*
export PATH="$test_root/bin:$PATH"
export FAKE_VAULT="$test_root/vault"
export FAKE_SOURCE="$test_root/source"
export BACKUP_TEMP_ROOT="$test_root/tmp"
export BACKUP_RUN_ENABLED=true
export BACKUP_CONFIRMATION=ONYXLINK_BACKUP_PRODUCTION
export BACKUP_SNAPSHOT_ID=20260810T120000Z
export BACKUP_TIER=daily
export SUPABASE_DB_URL='postgresql://fake-user:secret-value@localhost/fake'
export SUPABASE_S3_ENDPOINT='https://fake.supabase.test/storage/v1/s3'
export SUPABASE_S3_ACCESS_KEY_ID='fake-source-key'
export SUPABASE_S3_SECRET_ACCESS_KEY='fake-source-secret'
export R2_ENDPOINT='https://fake.r2.test'
export R2_ACCESS_KEY_ID='fake-r2-key'
export R2_SECRET_ACCESS_KEY='fake-r2-secret'
export R2_BUCKET='fake-backups'
export RCLONE_CRYPT_PASSWORD='fake-obscured-password'
export RCLONE_CRYPT_PASSWORD2='fake-obscured-salt'

create_output="$("$SCRIPT_DIR/create-production-backup.sh" 2>&1)"
[[ "$create_output" == *'Backup daily/20260810T120000Z completado y verificado.'* ]]
for secret in secret-value fake-source-secret fake-r2-secret; do
  [[ "$create_output" != *"$secret"* ]]
done

export BACKUP_SNAPSHOT_PATH=daily/20260810T120000Z
verify_output="$("$SCRIPT_DIR/verify-production-backup.sh" 2>&1)"
[[ "$verify_output" == *'checksum válido'* ]]

export RESTORE_CONFIRMATION=PREPARE_LOCAL_RESTORE_KIT
export RESTORE_ALLOWED_ROOT="$test_root"
export RESTORE_OUTPUT_DIR="$test_root/restore"
restore_output="$("$SCRIPT_DIR/prepare-restore-kit.sh" 2>&1)"
[[ "$restore_output" == *'No se ha modificado ninguna base de datos.'* ]]
[[ -s "$test_root/restore/database/schema.sql" ]]

# A RESTORE_OUTPUT_DIR that tries to escape the intended directory must be
# rejected before mkdir/rm -rf ever touch it.
export RESTORE_OUTPUT_DIR="$test_root/restore-escape/../../../etc/onyxlink-should-not-exist"
if "$SCRIPT_DIR/prepare-restore-kit.sh" >"$test_root/traversal.log" 2>&1; then
  printf 'Una RESTORE_OUTPUT_DIR con .. no puede aceptarse.\n' >&2
  exit 1
fi
grep -q 'RESTORE_OUTPUT_DIR debe permanecer dentro' "$test_root/traversal.log"
[[ ! -e "$test_root/../../etc/onyxlink-should-not-exist" ]]

# Existing parent symlinks must not permit an escape without using '..'.
ln -s /etc "$test_root/linked-parent"
export RESTORE_OUTPUT_DIR="$test_root/linked-parent/onyxlink-should-not-exist"
if "$SCRIPT_DIR/prepare-restore-kit.sh" >"$test_root/symlink.log" 2>&1; then
  printf 'Una ruta que escapa mediante symlink no puede aceptarse.\n' >&2
  exit 1
fi
grep -q 'RESTORE_OUTPUT_DIR debe permanecer dentro' "$test_root/symlink.log"

# The first day of a month must use the independently retained monthly root.
export BACKUP_SNAPSHOT_ID=20260901T120000Z
export BACKUP_TIER=auto
monthly_output="$("$SCRIPT_DIR/create-production-backup.sh" 2>&1)"
[[ "$monthly_output" == *'Backup monthly/2026-09/20260901T120000Z completado y verificado.'* ]]
[[ -s "$test_root/vault/monthly/2026-09/20260901T120000Z/COMPLETED" ]]
export BACKUP_SNAPSHOT_PATH=monthly/2026-09/20260901T120000Z
"$SCRIPT_DIR/verify-production-backup.sh" >/dev/null

# A third-party binary may print the DSN on failure; it must never reach logs.
cat > "$test_root/bin/pg_dump" <<'FAKE'
#!/usr/bin/env bash
printf 'fallo contra %s\n' "$SUPABASE_DB_URL" >&2
exit 1
FAKE
chmod 700 "$test_root/bin/pg_dump"
export BACKUP_SNAPSHOT_ID=20261010T120000Z
export BACKUP_TIER=daily
if "$SCRIPT_DIR/create-production-backup.sh" >"$test_root/sensitive-error.log" 2>&1; then
  printf 'El pg_dump ficticio debía fallar.\n' >&2
  exit 1
fi
if grep -q 'secret-value' "$test_root/sensitive-error.log"; then
  printf 'El DSN se filtró en el log de error.\n' >&2
  exit 1
fi
grep -q 'No se pudo crear el dump forense' "$test_root/sensitive-error.log"

# Invalid paths must be rejected before any remote read.
export BACKUP_SNAPSHOT_PATH='../../production'
if "$SCRIPT_DIR/verify-production-backup.sh" >"$test_root/invalid.log" 2>&1; then
  printf 'Una ruta de snapshot inválida no puede aceptarse.\n' >&2
  exit 1
fi
grep -q 'Ruta de snapshot inválida' "$test_root/invalid.log"

unset BACKUP_RUN_ENABLED
if "$SCRIPT_DIR/create-production-backup.sh" >"$test_root/fail.log" 2>&1; then
  printf 'El backup debía fallar cerrado al estar desactivado.\n' >&2
  exit 1
fi
grep -q 'Backup desactivado' "$test_root/fail.log"

printf 'Pruebas de backup: creación, verificación, restore kit y fail-closed correctos.\n'
