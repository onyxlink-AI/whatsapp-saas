#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

[[ "${RESTORE_CONFIRMATION:-}" == "PREPARE_LOCAL_RESTORE_KIT" ]] || backup_die "Falta la confirmación cerrada de restauración local"
backup_require_command rclone
backup_require_command sha256sum
backup_require_command tar
backup_require_command pg_restore
backup_require_command node
backup_require_command realpath
backup_configure_rclone

backup_require_env BACKUP_SNAPSHOT_PATH
backup_validate_snapshot_path "$BACKUP_SNAPSHOT_PATH"
snapshot_id="${BACKUP_SNAPSHOT_PATH##*/}"
backup_validate_snapshot_id "$snapshot_id"
backup_resolve_snapshot_path "$BACKUP_SNAPSHOT_PATH"
vault_remote="$BACKUP_VAULT_REMOTE"
allowed_root="${RESTORE_ALLOWED_ROOT:-$(pwd)/restore-work}"
requested_output="${RESTORE_OUTPUT_DIR:-$allowed_root/$snapshot_id}"
output_dir="$(backup_resolve_restore_output_dir "$requested_output" "$allowed_root")"
[[ ! -e "$output_dir" ]] || backup_die "La carpeta de restauración ya existe: $output_dir"
mkdir -p "$output_dir"
chmod 700 "$output_dir"

cleanup_on_error() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    backup_secure_cleanup "$output_dir"
  fi
}
trap cleanup_on_error EXIT

remote_root="$BACKUP_REMOTE_ROOT"
rclone copyto "$vault_remote:$remote_root/COMPLETED" "$output_dir/COMPLETED"
[[ "$(tr -d '\r\n' < "$output_dir/COMPLETED")" == "$snapshot_id" ]] || backup_die "Snapshot incompleto"
rclone copyto "$vault_remote:$remote_root/manifest.json" "$output_dir/manifest.json"
rclone copyto "$vault_remote:$remote_root/database.tar.gz" "$output_dir/database.tar.gz"

expected_sha="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.database.sha256)' "$output_dir/manifest.json")"
actual_sha="$(sha256sum "$output_dir/database.tar.gz" | cut -d' ' -f1)"
[[ "$actual_sha" == "$expected_sha" ]] || backup_die "Checksum inválido durante restauración"

mkdir "$output_dir/database"
tar -xzf "$output_dir/database.tar.gz" -C "$output_dir/database"
for required_file in roles.sql schema.sql data.sql full-database.dump; do
  [[ -s "$output_dir/database/$required_file" ]] || backup_die "Falta $required_file en la copia"
done
pg_restore --list "$output_dir/database/full-database.dump" >/dev/null

# Storage is downloaded only for an explicit drill; this can be large.
if [[ "${RESTORE_INCLUDE_STORAGE:-false}" == "true" ]]; then
  mkdir "$output_dir/storage"
  rclone copy "$vault_remote:$remote_root/storage" "$output_dir/storage" --immutable --fast-list --retries 5
fi

printf 'Kit de restauración %s preparado en %s. No se ha modificado ninguna base de datos.\n' "$BACKUP_SNAPSHOT_PATH" "$output_dir"
