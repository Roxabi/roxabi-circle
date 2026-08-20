#!/usr/bin/env bash
# Fail if any wrangler config points D1 migrations_dir at packages/*/migrations.
#
# Applied SSoT is apps/<api>/migrations (ADR-0008). packages/*/migrations are sketches.
# ROOT override: WRANGLER_MIG_ROOT (fixture trees in the self-test).
set -euo pipefail

ROOT="${WRANGLER_MIG_ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"
PACKAGES="$(cd "${ROOT}/packages" 2>/dev/null && pwd -P || true)"

if [[ ! -d "${ROOT}" ]]; then
  echo "check-wrangler-migrations-dir: missing root ${ROOT}" >&2
  exit 1
fi

if [[ -z "${PACKAGES}" || ! -d "${PACKAGES}" ]]; then
  echo "check-wrangler-migrations-dir: missing ${ROOT}/packages (nothing to police)" >&2
  exit 0
fi

mapfile -t FILES < <(
  find "${ROOT}" \
    \( -name wrangler.toml -o -name wrangler.json -o -name wrangler.jsonc \
       -o -name 'wrangler.*.toml' -o -name 'wrangler.*.json' -o -name 'wrangler.*.jsonc' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/coverage/*' \
    -not -path '*/.turbo/*' \
    | sort
)

extract_dirs() {
  local file="$1"
  # TOML: migrations_dir = "…"  | JSON(C): "migrations_dir": "…" (inline objects ok)
  grep -E 'migrations_dir[[:space:]]*=' "$file" 2>/dev/null \
    | sed -E 's/^.*migrations_dir[[:space:]]*=[[:space:]]*//; s/#.*//; s/^["'\'']//; s/["'\''].*$//; s/[[:space:]]*$//' \
    || true
  grep -E '"migrations_dir"[[:space:]]*:' "$file" 2>/dev/null \
    | sed -E 's/^.*"migrations_dir"[[:space:]]*:[[:space:]]*//; s/^["'\'']//; s/["'\''].*$//; s/[[:space:]]*$//' \
    || true
}

FAIL=0
CHECKED=0

for file in "${FILES[@]+"${FILES[@]}"}"; do
  [[ -n "${file:-}" ]] || continue
  config_dir="$(cd "$(dirname "$file")" && pwd -P)"
  case "${config_dir}" in
    "${PACKAGES}"|"${PACKAGES}"/*)
      echo "error: ${file}: wrangler config lives under packages/ (sketch SQL apply path)" >&2
      FAIL=1
      continue
      ;;
  esac
  while IFS= read -r raw; do
    [[ -n "${raw}" ]] || continue
    CHECKED=$((CHECKED + 1))
    case "${raw}" in
      /*) resolved="$(cd / && realpath -m -- "${raw}")" ;;
      *) resolved="$(cd "${config_dir}" && realpath -m -- "${raw}")" ;;
    esac
    case "${resolved}" in
      "${PACKAGES}"|"${PACKAGES}"/*)
        echo "error: ${file}: migrations_dir=${raw} resolves to ${resolved}" >&2
        echo "  packages/*/migrations are sketches — applied SSoT is apps/<api>/migrations (ADR-0008)" >&2
        FAIL=1
        ;;
    esac
  done < <(extract_dirs "$file")
done

if [[ "${FAIL}" -ne 0 ]]; then
  echo "check-wrangler-migrations-dir: FAIL" >&2
  exit 1
fi

echo "check-wrangler-migrations-dir: OK (${#FILES[@]} wrangler files, ${CHECKED} migrations_dir)"
exit 0
