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
  config/zero-edit-zones.json
  scripts/check-zero-edit-zones.sh
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
search_q '@kit/core' apps/example-api || {
  echo "example-api must import @kit/core" >&2
  exit 1
}
search_q '@kit/auth' apps/example-api || {
  echo "example-api must import @kit/auth" >&2
  exit 1
}
search_q '@kit/db' apps/example-api || {
  echo "example-api must import @kit/db" >&2
  exit 1
}
search_q '@kit/storage' apps/example-api || {
  echo "example-api must import @kit/storage" >&2
  exit 1
}
search_q '@kit/email' apps/example-api || {
  echo "example-api must import @kit/email" >&2
  exit 1
}
search_q '@kit/mcp' apps/mcp-example || {
  echo "mcp-example must import @kit/mcp" >&2
  exit 1
}
search_q '@kit/ui' apps/example-web || {
  echo "example-web must import @kit/ui" >&2
  exit 1
}
search_q '@kit/types' apps/example-web || {
  echo "example-web must import @kit/types" >&2
  exit 1
}
search_q '@kit/i18n' apps/example-web || {
  echo "example-web must import @kit/i18n" >&2
  exit 1
}

echo "== extract-dry-run: no orphan workspace packages (optional hard-fail) =="
# Packages under packages/* must be referenced outside their own dir (except config tooling).
# EXTRACT_ORPHAN_FAIL=1 enables hard-fail (default on).
ORPHAN_FAIL="${EXTRACT_ORPHAN_FAIL:-1}"
orphan=0
# Use a small Node helper so we avoid set -o pipefail + rg exit-1 traps.
orphan_report="$(
  node --input-type=module <<'NODE'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const skip = new Set(['config'])
const roots = ['apps', 'packages']
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'coverage') continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx|js|mjs|cjs|json|md)$/.test(ent.name)) acc.push(p)
  }
  return acc
}

const files = roots.flatMap((r) => walk(r))
const orphans = []
for (const pkgDir of readdirSync('packages', { withFileTypes: true })) {
  if (!pkgDir.isDirectory() || skip.has(pkgDir.name)) continue
  const pkgJsonPath = join('packages', pkgDir.name, 'package.json')
  if (!existsSync(pkgJsonPath)) continue
  const name = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name
  if (!name) continue
  const selfPrefix = join('packages', pkgDir.name) + '/'
  const hit = files.some((f) => {
    if (f.startsWith(selfPrefix)) return false
    try {
      return readFileSync(f, 'utf8').includes(name)
    } catch {
      return false
    }
  })
  if (!hit) orphans.push(`${name} (packages/${pkgDir.name})`)
}
if (orphans.length) {
  for (const o of orphans) console.log(`ORPHAN package (no importers outside itself): ${o}`)
  process.exit(2)
}
process.exit(0)
NODE
)" || orphan_ec=$?
orphan_ec="${orphan_ec:-0}"
if [[ -n "$orphan_report" ]]; then
  echo "$orphan_report" >&2
fi
if [[ "$orphan_ec" -eq 2 ]]; then
  orphan=1
elif [[ "$orphan_ec" -ne 0 ]]; then
  echo "extract-dry-run: orphan check helper failed (exit $orphan_ec)" >&2
  exit 1
fi
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
