#!/usr/bin/env bash
# Fail if product-share domain tokens leak into kit packages/examples,
# if example-api route schemas use .loose() (ADR-0014 D6),
# or if example-web reads /api/me outside lib/auth.ts (M-14).
# Scans packages + the kit apps (lib/kit-apps.sh, Roxabi/roxabi-boilerplate-cf#318) only (not this script itself).
set -euo pipefail

# ZERO_EDIT_ROOT: same override as check-zero-edit-zones (dogfood product path).
ROOT="${ZERO_EDIT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
# shellcheck source=lib/kit-apps.sh
source "$(dirname "$0")/lib/kit-apps.sh"
cd "$ROOT"

kit_apps="$(kit_app_names config/kit/zero-edit-zones.json)" || {
  echo "check-banned-strings: cannot read the kit apps from config/kit/zero-edit-zones.json" >&2
  exit 1
}
TARGETS=(packages)
while IFS= read -r app; do
  TARGETS+=("apps/${app}")
done <<<"${kit_apps}"

BANNED=(
  'share/\{slug\}'
  'share_publish'
  'private_key_product'
  'apps/share-'
  'shlink'
  's\.example\.com'
  'share\.example\.com'
  'private_acl'
  'SLUG_EXISTS'
  'share-mcp'
)

# rg: 0=matches, 1=no match, 2+=error. grep: 0=matches, 1=no match, 2+=error.
# Never treat tool failure as clean.
search() {
  local pat="$1"
  shift
  local out ec
  if command -v rg >/dev/null 2>&1; then
    set +e
    out="$(rg -n --hidden \
      --glob '!**/.git/**' \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!**/.wrangler/**' \
      -i "$pat" "$@" 2>&1)"
    ec=$?
    set -e
    if [[ "$ec" -eq 0 ]]; then
      printf '%s\n' "$out"
      return 0
    fi
    if [[ "$ec" -eq 1 ]]; then
      return 1
    fi
    echo "check-banned-strings: rg failed (exit $ec) for /$pat/: $out" >&2
    return 2
  fi

  set +e
  out="$(grep -RInE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=.wrangler \
    -e "$pat" "$@" 2>&1)"
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  if [[ "$ec" -eq 1 ]]; then
    return 1
  fi
  echo "check-banned-strings: grep failed (exit $ec) for /$pat/: $out" >&2
  return 2
}

fail=0
for target in "${TARGETS[@]}"; do
  if [[ ! -d "$target" && ! -f "$target" ]]; then
    continue
  fi
  for pat in "${BANNED[@]}"; do
    set +e
    hits="$(search "$pat" "$target")"
    ec=$?
    set -e
    if [[ "$ec" -eq 2 ]]; then
      fail=1
      continue
    fi
    if [[ "$ec" -eq 0 && -n "$hits" ]]; then
      echo "$hits"
      echo "BANLIST HIT: pattern /$pat/ under $target" >&2
      fail=1
    fi
  done
done

set +e
hits="$(search "joinObjectKey\\(['\"]share" packages apps)"
ec=$?
set -e
if [[ "$ec" -eq 2 ]]; then
  fail=1
elif [[ "$ec" -eq 0 && -n "${hits:-}" ]]; then
  echo "$hits"
  echo "BANLIST HIT: R2 share/ prefix in code" >&2
  fail=1
fi

# ADR-0014 D6: .loose() is prohibited in example-api route response schemas.
# Scoped: .loose() is a legitimate Zod call elsewhere in the monorepo.
LOOSE_SCOPE="apps/example-api/src/routes"
if [[ -d "$LOOSE_SCOPE" ]]; then
  set +e
  hits="$(search "\\.loose\\(" "$LOOSE_SCOPE")"
  ec=$?
  set -e
  if [[ "$ec" -eq 2 ]]; then
    fail=1
  elif [[ "$ec" -eq 0 && -n "${hits:-}" ]]; then
    echo "$hits"
    echo "BANLIST HIT: .loose() under $LOOSE_SCOPE (ADR-0014 D6). Declare the exact fields the handler returns." >&2
    fail=1
  fi
fi

# M-14: /api/me lives only in apps/example-web/src/lib/auth.ts (fetchMe).
# Literal path — ERE-safe (no PCRE (?:)). Tests and comment-only mentions
# (// or *) are filtered so docs and the grep fallback stay quiet.
ME_SRC="apps/example-web/src"
if [[ -d "$ME_SRC" ]]; then
  set +e
  hits="$(search "/api/me" "$ME_SRC")"
  ec=$?
  set -e
  if [[ "$ec" -eq 2 ]]; then
    fail=1
  elif [[ "$ec" -eq 0 && -n "${hits:-}" ]]; then
    filtered="$(
      printf '%s\n' "$hits" | awk -F: '
        $1 == "apps/example-web/src/lib/auth.ts" { next }
        $1 ~ /\.(test|spec)\.(ts|tsx)$/ { next }
        {
          content = $0
          sub(/^[^:]+:[0-9]+:/, "", content)
          sub(/^[ \t]+/, "", content)
          if (content ~ /^\/\// || content ~ /^\*/) next
          print
        }
      '
    )"
    if [[ -n "$filtered" ]]; then
      echo "$filtered"
      echo "BANLIST HIT: /api/me under $ME_SRC outside lib/auth.ts (M-14). Use fetchMe." >&2
      fail=1
    fi
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "check-banned-strings: FAILED" >&2
  exit 1
fi

echo "check-banned-strings: OK"
