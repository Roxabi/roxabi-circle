#!/usr/bin/env bash
# Dry-run extractability check for Chemin A kit.
#
# Modes (EXTRACT_MODE):
#   kit   (default) — banlist examples + packages; warn if product apps exist but do not fail
#   mono  — dual-mission monorepo: product apps allowed; banlist still covers packages + examples only
#   strict — legacy kit-only: fail if apps/share-* present
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${EXTRACT_MODE:-kit}"

search_q() {
  local pat="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pat" "$@"
  else
    grep -RIqE --exclude-dir=node_modules --exclude-dir=.git -e "$pat" "$@"
  fi
}

echo "== extract-dry-run: mode=${MODE} =="
echo "== extract-dry-run: tree sanity =="

required=(
  package.json
  turbo.jsonc
  biome.json
  packages/core/package.json
  packages/types/package.json
  packages/auth/package.json
  packages/db/package.json
  packages/storage/package.json
  packages/ui/package.json
  packages/email/package.json
  packages/mcp/package.json
  apps/example-api/package.json
  apps/example-web/package.json
  apps/mcp-example/package.json
  docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
)

for f in "${required[@]}"; do
  if [[ ! -e "$f" ]]; then
    echo "MISSING: $f" >&2
    exit 1
  fi
done

product_found=0
for product_app in apps/share-api apps/share-web; do
  if [[ -d "$product_app" ]]; then
    product_found=1
    if [[ "$MODE" == "strict" ]]; then
      echo "UNEXPECTED product app present (EXTRACT_MODE=strict): $product_app" >&2
      exit 1
    fi
    echo "NOTE: product app present ($product_app) — banlist still excludes product dirs; mode=${MODE}"
  fi
done

if [[ "$MODE" == "kit" && "$product_found" -eq 0 ]]; then
  echo "NOTE: no product apps (kit-only tree)"
fi

echo "== extract-dry-run: banlist (packages + example apps only) =="
# check-banned-strings.sh already targets packages + apps/example-* only
bash scripts/check-banned-strings.sh

echo "== extract-dry-run: every package imported by an example =="
search_q '@gosilex/core' apps/example-api || {
  echo "example-api must import @gosilex/core" >&2
  exit 1
}
search_q '@gosilex/auth' apps/example-api || {
  echo "example-api must import @gosilex/auth" >&2
  exit 1
}
search_q '@gosilex/db' apps/example-api || {
  echo "example-api must import @gosilex/db" >&2
  exit 1
}
search_q '@gosilex/storage' apps/example-api || {
  echo "example-api must import @gosilex/storage" >&2
  exit 1
}
search_q '@gosilex/email' apps/example-api || {
  echo "example-api must import @gosilex/email" >&2
  exit 1
}
search_q '@gosilex/mcp' apps/mcp-example || {
  echo "mcp-example must import @gosilex/mcp" >&2
  exit 1
}
search_q '@gosilex/ui' apps/example-web || {
  echo "example-web must import @gosilex/ui" >&2
  exit 1
}
search_q '@gosilex/types' apps/example-web || {
  echo "example-web must import @gosilex/types" >&2
  exit 1
}
search_q '@gosilex/i18n' apps/example-web || {
  echo "example-web must import @gosilex/i18n" >&2
  exit 1
}

echo "== extract-dry-run: no orphan workspace packages (optional hard-fail) =="
# Packages under packages/* must be referenced outside their own dir (except config tooling).
# EXTRACT_ORPHAN_FAIL=1 enables hard-fail (default on).
ORPHAN_FAIL="${EXTRACT_ORPHAN_FAIL:-1}"
orphan=0
for pkg_json in packages/*/package.json; do
  name="$(node -e "console.log(require('./$pkg_json').name||'')")"
  dir="$(dirname "$pkg_json")"
  base="$(basename "$dir")"
  if [[ "$base" == "config" || -z "$name" ]]; then
    continue
  fi
  # Count references outside this package directory
  hits=0
  if command -v rg >/dev/null 2>&1; then
    hits="$(rg -F -l --glob '!**/node_modules/**' --glob '!**/.git/**' --glob "!${dir}/**" "$name" apps packages 2>/dev/null | wc -l | tr -d ' ')"
  else
    hits="$(grep -RIl --exclude-dir=node_modules --exclude-dir=.git -F "$name" apps packages 2>/dev/null | grep -v "^${dir}/" | wc -l | tr -d ' ')"
  fi
  if [[ "${hits:-0}" -eq 0 ]]; then
    echo "ORPHAN package (no importers outside itself): $name ($dir)" >&2
    orphan=1
  fi
done
if [[ "$orphan" -eq 1 && "$ORPHAN_FAIL" == "1" ]]; then
  echo "extract-dry-run: orphan packages failed (set EXTRACT_ORPHAN_FAIL=0 to warn only)" >&2
  exit 1
fi

# config consumed via tsconfig extends (relative path to packages/config)
search_q 'config/tsconfig.base.json' apps packages || {
  echo "tsconfig must extend packages/config/tsconfig.base.json" >&2
  exit 1
}

# Axial ADR frontmatter
if ! grep -q 'axial: true' docs/architecture/adr/0001-primary-axis-packages-compose-apps.md; then
  echo "Axial ADR missing axial: true" >&2
  exit 1
fi

# ADR-0002 session interim present (kit contract)
if [[ ! -f docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md ]]; then
  echo "MISSING: ADR-0002 session HMAC interim" >&2
  exit 1
fi

echo "extract-dry-run: OK (mode=${MODE})"
