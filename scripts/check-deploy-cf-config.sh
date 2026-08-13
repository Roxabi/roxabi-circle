#!/usr/bin/env bash
# Validate local Cloudflare deploy profile (no secrets, no network required).
# Exit 0 = usable config · exit 1 = missing/invalid · exit 2 = usage
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLE="$ROOT/config/deploy.cf.example.toml"
LOCAL="$ROOT/config/deploy.cf.local.toml"
PRINT=0

for arg in "$@"; do
  case "$arg" in
    --print) PRINT=1 ;;
    -h|--help)
      echo "Usage: bash scripts/check-deploy-cf-config.sh [--print]"
      echo "  Requires config/deploy.cf.local.toml (copy from deploy.cf.example.toml)."
      exit 0
      ;;
  esac
done

if [[ ! -f "$EXAMPLE" ]]; then
  echo "error: missing tracked template: config/deploy.cf.example.toml" >&2
  exit 1
fi

if [[ ! -f "$LOCAL" ]]; then
  echo "error: missing local deploy profile: config/deploy.cf.local.toml" >&2
  echo "  cp config/deploy.cf.example.toml config/deploy.cf.local.toml" >&2
  echo "  # then fill cf_account_id, zone, hostnames, D1/R2 names" >&2
  echo "  See docs/deploy-cloudflare.md" >&2
  exit 1
fi

# Minimal key=value TOML parse (flat keys only — enough for this profile).
get_val() {
  local key="$1"
  # strip comments / quotes / spaces
  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$LOCAL" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  local raw="${line#*=}"
  raw="$(echo "$raw" | sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  echo "$raw"
}

require_key() {
  local key="$1"
  local val
  val="$(get_val "$key")"
  if [[ -z "$val" || "$val" == REPLACE* || "$val" == *"REPLACE"* ]]; then
    echo "error: set non-placeholder value for: $key" >&2
    FAIL=1
  fi
}

FAIL=0
require_key cf_account_id
require_key cf_account_label
require_key environment
require_key zone_name
require_key api_hostname
require_key web_hostname
require_key worker_name_api
require_key d1_database_name
require_key d1_database_id
require_key r2_bucket_name
require_key cors_origins
require_key better_auth_url

env_val="$(get_val environment)"
if [[ -n "$env_val" && "$env_val" != "staging" && "$env_val" != "production" ]]; then
  echo "error: environment must be staging|production (got: $env_val)" >&2
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "check-deploy-cf-config: FAIL — fix config/deploy.cf.local.toml" >&2
  exit 1
fi

if [[ "$PRINT" -eq 1 ]]; then
  echo "deploy.cf.local.toml (non-secret summary)"
  echo "  cf_account_id     = $(get_val cf_account_id)"
  echo "  cf_account_label  = $(get_val cf_account_label)"
  echo "  environment       = $(get_val environment)"
  echo "  zone_name         = $(get_val zone_name)"
  echo "  api_hostname      = $(get_val api_hostname)"
  echo "  web_hostname      = $(get_val web_hostname)"
  echo "  worker_name_api   = $(get_val worker_name_api)"
  echo "  d1_database_name  = $(get_val d1_database_name)"
  echo "  r2_bucket_name    = $(get_val r2_bucket_name)"
  echo "  cors_origins      = $(get_val cors_origins)"
  echo "  better_auth_url   = $(get_val better_auth_url)"
fi

echo "check-deploy-cf-config: OK"
echo "Next: wrangler whoami  # must match cf_account_id — docs/deploy-cloudflare.md §2"
exit 0
