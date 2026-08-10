#!/usr/bin/env bash

set -Eeuo pipefail

backup_die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

backup_require_command() {
  command -v "$1" >/dev/null 2>&1 || backup_die "Falta el comando requerido: $1"
}

backup_require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || backup_die "Falta la variable protegida: $name"
}

backup_validate_snapshot_id() {
  [[ "$1" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || backup_die "Identificador de snapshot inválido"
}

backup_validate_snapshot_path() {
  [[ "$1" =~ ^daily/[0-9]{8}T[0-9]{6}Z$ || "$1" =~ ^monthly/[0-9]{4}-[0-9]{2}/[0-9]{8}T[0-9]{6}Z$ ]] || backup_die "Ruta de snapshot inválida"
}

backup_resolve_snapshot_path() {
  local logical_path="$1"
  backup_validate_snapshot_path "$logical_path"
  if [[ "$logical_path" == daily/* ]]; then
    BACKUP_VAULT_REMOTE=vaultdaily
    BACKUP_REMOTE_ROOT="${logical_path#daily/}"
  else
    BACKUP_VAULT_REMOTE=vaultmonthly
    BACKUP_REMOTE_ROOT="${logical_path#monthly/}"
  fi
  export BACKUP_VAULT_REMOTE BACKUP_REMOTE_ROOT
}

backup_configure_rclone() {
  local required=(
    SUPABASE_S3_ENDPOINT
    SUPABASE_S3_ACCESS_KEY_ID
    SUPABASE_S3_SECRET_ACCESS_KEY
    R2_ENDPOINT
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET
    RCLONE_CRYPT_PASSWORD
    RCLONE_CRYPT_PASSWORD2
  )

  local name
  for name in "${required[@]}"; do
    backup_require_env "$name"
  done

  export RCLONE_CONFIG_SUPABASE_TYPE=s3
  export RCLONE_CONFIG_SUPABASE_PROVIDER=Other
  export RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID"
  export RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_SUPABASE_ENDPOINT="$SUPABASE_S3_ENDPOINT"
  export RCLONE_CONFIG_SUPABASE_REGION="${SUPABASE_S3_REGION:-auto}"
  export RCLONE_CONFIG_SUPABASE_ACL=private
  export RCLONE_CONFIG_SUPABASE_NO_CHECK_BUCKET=true

  export RCLONE_CONFIG_R2RAW_TYPE=s3
  export RCLONE_CONFIG_R2RAW_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2RAW_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2RAW_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2RAW_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2RAW_REGION=auto
  export RCLONE_CONFIG_R2RAW_ACL=private
  export RCLONE_CONFIG_R2RAW_NO_CHECK_BUCKET=true

  # The destination is a crypt remote: object contents, file names and directory
  # names are encrypted before leaving the ephemeral runner.
  export RCLONE_CONFIG_VAULTDAILY_TYPE=crypt
  export RCLONE_CONFIG_VAULTDAILY_REMOTE="r2raw:${R2_BUCKET}/onyxlink-production/daily"
  export RCLONE_CONFIG_VAULTDAILY_PASSWORD="$RCLONE_CRYPT_PASSWORD"
  export RCLONE_CONFIG_VAULTDAILY_PASSWORD2="$RCLONE_CRYPT_PASSWORD2"
  export RCLONE_CONFIG_VAULTDAILY_FILENAME_ENCRYPTION=standard
  export RCLONE_CONFIG_VAULTDAILY_DIRECTORY_NAME_ENCRYPTION=true

  export RCLONE_CONFIG_VAULTMONTHLY_TYPE=crypt
  export RCLONE_CONFIG_VAULTMONTHLY_REMOTE="r2raw:${R2_BUCKET}/onyxlink-production/monthly"
  export RCLONE_CONFIG_VAULTMONTHLY_PASSWORD="$RCLONE_CRYPT_PASSWORD"
  export RCLONE_CONFIG_VAULTMONTHLY_PASSWORD2="$RCLONE_CRYPT_PASSWORD2"
  export RCLONE_CONFIG_VAULTMONTHLY_FILENAME_ENCRYPTION=standard
  export RCLONE_CONFIG_VAULTMONTHLY_DIRECTORY_NAME_ENCRYPTION=true
}

backup_resolve_restore_output_dir() {
  local requested_path="$1"
  local allowed_root="$2"
  [[ -n "$requested_path" ]] || backup_die "RESTORE_OUTPUT_DIR no puede estar vacío"
  [[ -n "$allowed_root" && "$allowed_root" != "/" ]] || backup_die "RESTORE_ALLOWED_ROOT no es seguro"

  mkdir -p "$allowed_root"
  local canonical_root canonical_output
  canonical_root="$(realpath -e -- "$allowed_root")"
  canonical_output="$(realpath -m -- "$requested_path")"
  case "$canonical_output/" in
    "$canonical_root/"*) ;;
    *) backup_die "RESTORE_OUTPUT_DIR debe permanecer dentro de RESTORE_ALLOWED_ROOT" ;;
  esac
  printf '%s' "$canonical_output"
}

backup_run_sensitive() {
  local label="$1"
  local log_file="$2"
  shift 2
  if "$@" >"$log_file" 2>&1; then
    rm -f -- "$log_file"
    return 0
  fi
  # Third-party clients may include the DSN in diagnostics. Never replay their
  # raw output into GitHub Actions logs.
  backup_die "$label. Revisa la credencial directamente en el proveedor"
}

backup_make_workspace() {
  local base="${BACKUP_TEMP_ROOT:-${RUNNER_TEMP:-/tmp}}"
  mkdir -p "$base"
  mktemp -d "${base%/}/onyxlink-backup.XXXXXX"
}

backup_secure_cleanup() {
  local path="${1:-}"
  [[ -n "$path" && -d "$path" ]] || return 0
  find "$path" -type f -exec chmod 600 {} + 2>/dev/null || true
  rm -rf -- "$path"
}
