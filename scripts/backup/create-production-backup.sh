#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

[[ "${BACKUP_RUN_ENABLED:-}" == "true" ]] || backup_die "Backup desactivado (BACKUP_RUN_ENABLED)"
[[ "${BACKUP_CONFIRMATION:-}" == "ONYXLINK_BACKUP_PRODUCTION" ]] || backup_die "Falta la confirmación cerrada del backup"

for command_name in supabase pg_dump rclone tar sha256sum node; do
  backup_require_command "$command_name"
done
backup_require_env SUPABASE_DB_URL
backup_configure_rclone

snapshot_id="${BACKUP_SNAPSHOT_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
backup_validate_snapshot_id "$snapshot_id"
snapshot_month="${snapshot_id:0:4}-${snapshot_id:4:2}"
if [[ "${BACKUP_TIER:-auto}" == "monthly" || ( "${BACKUP_TIER:-auto}" == "auto" && "${snapshot_id:6:2}" == "01" ) ]]; then
  snapshot_path="monthly/$snapshot_month/$snapshot_id"
else
  snapshot_path="daily/$snapshot_id"
fi
backup_validate_snapshot_path "$snapshot_path"
backup_resolve_snapshot_path "$snapshot_path"
vault_remote="$BACKUP_VAULT_REMOTE"
remote_root="$BACKUP_REMOTE_ROOT"
workspace="$(backup_make_workspace)"
database_dir="$workspace/database"
verification_dir="$workspace/verification"
mkdir -p "$database_dir" "$verification_dir"

cleanup() {
  backup_secure_cleanup "$workspace"
}
trap cleanup EXIT INT TERM

printf 'Creando snapshot cifrado %s\n' "$snapshot_id"

# Supported logical restore set recommended by Supabase.
backup_run_sensitive "No se pudo exportar roles" "$workspace/roles-dump.log" supabase db dump --db-url "$SUPABASE_DB_URL" --file "$database_dir/roles.sql" --role-only --log-level error
backup_run_sensitive "No se pudo exportar el esquema" "$workspace/schema-dump.log" supabase db dump --db-url "$SUPABASE_DB_URL" --file "$database_dir/schema.sql" --log-level error
backup_run_sensitive "No se pudieron exportar los datos" "$workspace/data-dump.log" supabase db dump --db-url "$SUPABASE_DB_URL" --file "$database_dir/data.sql" --data-only --use-copy --log-level error

# Additional forensic archive. It is not the primary restore path, but preserves
# schemas outside the normal Supabase logical export for incident analysis.
backup_run_sensitive "No se pudo crear el dump forense" "$workspace/full-dump.log" pg_dump --format=custom --no-owner --no-acl --file "$database_dir/full-database.dump" "$SUPABASE_DB_URL"

tar -czf "$workspace/database.tar.gz" -C "$database_dir" .
database_sha="$(sha256sum "$workspace/database.tar.gz" | cut -d' ' -f1)"
database_bytes="$(stat -c '%s' "$workspace/database.tar.gz")"
storage_json="$(rclone size supabase: --json --fast-list)"

node - "$workspace/manifest.json" "$snapshot_id" "$database_sha" "$database_bytes" "$storage_json" <<'NODE'
const fs = require("node:fs");
const [file, snapshotId, databaseSha256, databaseBytes, storageJson] = process.argv.slice(2);
const storage = JSON.parse(storageJson);
const manifest = {
  format: "onyxlink-backup-v1",
  snapshotId,
  createdAt: new Date().toISOString(),
  database: {
    archive: "database.tar.gz",
    sha256: databaseSha256,
    bytes: Number(databaseBytes),
  },
  storage: {
    objects: Number(storage.count ?? 0),
    bytes: Number(storage.bytes ?? 0),
  },
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
NODE

# Immutable, unique snapshot path. No delete operation is used anywhere in this
# script. An incomplete run never receives the COMPLETED marker.
rclone copyto "$workspace/database.tar.gz" "$vault_remote:$remote_root/database.tar.gz" --immutable --retries 5 --low-level-retries 10
rclone copy supabase: "$vault_remote:$remote_root/storage" --immutable --fast-list --transfers "${BACKUP_TRANSFERS:-8}" --checkers "${BACKUP_CHECKERS:-16}" --retries 5 --low-level-retries 10
rclone check supabase: "$vault_remote:$remote_root/storage" --one-way --size-only --fast-list

rclone copyto "$vault_remote:$remote_root/database.tar.gz" "$verification_dir/database.tar.gz"
downloaded_sha="$(sha256sum "$verification_dir/database.tar.gz" | cut -d' ' -f1)"
[[ "$downloaded_sha" == "$database_sha" ]] || backup_die "La verificación de descarga de la base de datos no coincide"
tar -tzf "$verification_dir/database.tar.gz" >/dev/null

rclone copyto "$workspace/manifest.json" "$vault_remote:$remote_root/manifest.json" --immutable
printf '%s\n' "$snapshot_id" > "$workspace/COMPLETED"
rclone copyto "$workspace/COMPLETED" "$vault_remote:$remote_root/COMPLETED" --immutable

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'snapshot_id=%s\n' "$snapshot_id" >> "$GITHUB_OUTPUT"
  printf 'snapshot_path=%s\n' "$snapshot_path" >> "$GITHUB_OUTPUT"
  printf 'storage_objects=%s\n' "$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.count ?? 0))' "$storage_json")" >> "$GITHUB_OUTPUT"
fi

printf 'Backup %s completado y verificado.\n' "$snapshot_path"
