#!/usr/bin/env bash
# Dry-run extractability check for Chemin A kit (no product share apps required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

search_q() {
  local pat="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pat" "$@"
  else
    grep -RIqE --exclude-dir=node_modules --exclude-dir=.git -e "$pat" "$@"
  fi
}

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

# Product apps must not exist yet (kit-only tree)
for product_app in apps/share-api apps/share-web; do
  if [[ -d "$product_app" ]]; then
    echo "UNEXPECTED product app present during kit extract dry-run: $product_app" >&2
    exit 1
  fi
done

echo "== extract-dry-run: banlist =="
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

echo "extract-dry-run: OK"
