#!/usr/bin/env bash
# Dry-run extractability check for Chemin A kit.
#
# Tree identity: ADR-0009 D5 classifier (scripts/kit/resolve-tree-identity.mjs).
#   kit     — example/mcp apps only; residency + temp compose proof
#   product — product apps under apps/ allowed (complement of kit examples)
#
# Harness-only override (audit): EXTRACT_MODE + EXTRACT_HARNESS_SENTINEL
#   (forbidden on normal lefthook/CI without sentinel — mirror ZERO_EDIT_MODE discipline)
set -euo pipefail

ROOT="${EXTRACT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

export ROOT
export EXTRACT_MODE="${EXTRACT_MODE:-}"
export EXTRACT_HARNESS_SENTINEL="${EXTRACT_HARNESS_SENTINEL:-}"

identity_line="$(
  node --input-type=module <<'NODE'
import { resolveTreeIdentity } from './scripts/kit/resolve-tree-identity.mjs'
const { mode, identity, classifiedMode } = resolveTreeIdentity({
  root: process.env.ROOT,
  modeEnv: process.env.EXTRACT_MODE || '',
  harnessSentinel: process.env.EXTRACT_HARNESS_SENTINEL || '',
})
console.log(`mode=${mode} identity=${identity || '(none)'} classified=${classifiedMode}`)
NODE
)" || {
  echo "extract-dry-run: tree identity resolution failed" >&2
  exit 1
}

MODE="$(echo "$identity_line" | sed -n 's/^mode=\([^ ]*\).*/\1/p')"
IDENTITY="$(echo "$identity_line" | sed -n 's/.*identity=\([^ ]*\).*/\1/p')"
CLASSIFIED="$(echo "$identity_line" | sed -n 's/.*classified=\([^ ]*\).*/\1/p')"

search_q() {
  local pat="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pat" "$@"
  else
    grep -RIqE --exclude-dir=node_modules --exclude-dir=.git -e "$pat" "$@"
  fi
}

echo "== extract-dry-run: mode=${MODE} identity=${IDENTITY} classified=${CLASSIFIED} =="
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
  docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  config/kit/zero-edit-zones.json
  scripts/kit/check-zero-edit-zones.sh
)

for f in "${required[@]}"; do
  if [[ ! -e "$f" ]]; then
    echo "MISSING: $f" >&2
    exit 1
  fi
done

KIT_APP_ALLOW=(
  example-api
  example-web
  example-web-branded
  mcp-example
)

if [[ "$MODE" == "kit" ]]; then
  echo "== extract-dry-run: product-app allowlist (kit mode) =="
  for app_dir in apps/*/; do
    [[ -d "$app_dir" ]] || continue
    app_name="$(basename "$app_dir")"
    allowed=0
    for ok in "${KIT_APP_ALLOW[@]}"; do
      if [[ "$app_name" == "$ok" ]]; then
        allowed=1
        break
      fi
    done
    if [[ "$allowed" -eq 0 ]]; then
      echo "UNEXPECTED app (not in kit allowlist): apps/$app_name" >&2
      exit 1
    fi
  done
  echo "NOTE: kit tree — no product apps under apps/"
elif [[ "$MODE" == "product" ]]; then
  echo "== extract-dry-run: product apps (product mode) =="
  product_found=0
  for app_dir in apps/*/; do
    [[ -d "$app_dir" ]] || continue
    app_name="$(basename "$app_dir")"
    allowed=0
    for ok in "${KIT_APP_ALLOW[@]}"; do
      if [[ "$app_name" == "$ok" ]]; then
        allowed=1
        break
      fi
    done
    if [[ "$allowed" -eq 0 ]]; then
      product_found=1
      echo "NOTE: product app present (expected on product tree): apps/$app_name"
    fi
  done
  if [[ "$product_found" -eq 0 ]]; then
    echo "NOTE: product tree with kit examples only (no product apps yet)"
  fi
else
  echo "extract-dry-run: unresolved tree mode '${MODE}'" >&2
  exit 1
fi

echo "== extract-dry-run: banlist (packages + example apps only) =="
# check-banned-strings.sh already targets packages + apps/example-* only
bash scripts/kit/check-banned-strings.sh

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
search_q '@kit/api-client' apps/example-web || {
  echo "example-web must import @kit/api-client" >&2
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
if ! grep -q 'axial: true' docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md; then
  echo "Axial ADR missing axial: true" >&2
  exit 1
fi

# ADR-0002 session interim present (kit contract)
if [[ ! -f docs/kit/architecture/adr/0002-session-hmac-interim-vs-better-auth.md ]]; then
  echo "MISSING: ADR-0002 session HMAC interim" >&2
  exit 1
fi


echo "== extract-dry-run: residency (kit tables + org policy) =="
bun scripts/kit/extract-residency.ts

echo "== extract-dry-run: temp compose proof (typecheck + org 200/404) =="
bun scripts/kit/extract-compose-proof.ts

echo "extract-dry-run: OK (mode=${MODE})"
