#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

for command_name in rclone sha256sum tar node; do
  backup_require_command "$command_name"
done
backup_configure_rclone

backup_require_env BACKUP_SNAPSHOT_PATH
snapshot_path="$BACKUP_SNAPSHOT_PATH"
backup_validate_snapshot_path "$snapshot_path"
snapshot_id="${snapshot_path##*/}"
backup_validate_snapshot_id "$snapshot_id"
backup_resolve_snapshot_path "$snapshot_path"
vault_remote="$BACKUP_VAULT_REMOTE"

workspace="$(backup_make_workspace)"
trap 'backup_secure_cleanup "$workspace"' EXIT INT TERM
remote_root="$BACKUP_REMOTE_ROOT"

rclone copyto "$vault_remote:$remote_root/COMPLETED" "$workspace/COMPLETED"
[[ "$(tr -d '\r\n' < "$workspace/COMPLETED")" == "$snapshot_id" ]] || backup_die "Marcador de finalización inválido"
rclone copyto "$vault_remote:$remote_root/manifest.json" "$workspace/manifest.json"
rclone copyto "$vault_remote:$remote_root/database.tar.gz" "$workspace/database.tar.gz"

expected_sha="$(node -e 'const m=require(process.argv[1]); if(m.format!=="onyxlink-backup-v1") process.exit(2); process.stdout.write(m.database.sha256)' "$workspace/manifest.json")"
actual_sha="$(sha256sum "$workspace/database.tar.gz" | cut -d' ' -f1)"
[[ "$actual_sha" == "$expected_sha" ]] || backup_die "Checksum de base de datos incorrecto"
tar -tzf "$workspace/database.tar.gz" >/dev/null

if [[ "${BACKUP_VERIFY_LIVE_STORAGE:-false}" == "true" ]]; then
  rclone check supabase: "$vault_remote:$remote_root/storage" --one-way --size-only --fast-list
fi

printf 'Snapshot %s legible, completo y con checksum válido.\n' "$snapshot_path"
