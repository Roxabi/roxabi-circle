#!/usr/bin/env bash
# Fail if a product consumer diverges from kit upstream on protected paths
# without a valid, non-expired exception entry.
#
# Modes (ZERO_EDIT_MODE or auto):
#   kit     — no docs/product/kit-baseline (brand-agnostic kit tree)
#   product — kit-baseline present; compare to ZERO_EDIT_BASE_REF (default upstream/main)
#
# Design overrides (CSS tokens, compose wrappers) live under apps/<product>-* and
# never need exceptions. See config/zero-edit-zones.json → design_overrides.
#
# Exceptions (last resort): docs/product/zero-edit-exceptions.json
# Template: config/zero-edit-exceptions.example.json
set -euo pipefail

# ZERO_EDIT_ROOT: product dogfood / CI may point checkers at a tree that is not
# the kit that owns this script (dirname $0 → kit). Default = script's monorepo.
ROOT="${ZERO_EDIT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

ZONES_FILE="${ZERO_EDIT_ZONES_FILE:-config/zero-edit-zones.json}"
if [[ ! -f "$ZONES_FILE" ]]; then
  echo "check-zero-edit-zones: missing $ZONES_FILE" >&2
  exit 1
fi

# --- detect mode (brand-agnostic) ---
if [[ -n "${ZERO_EDIT_MODE:-}" ]]; then
  MODE="$ZERO_EDIT_MODE"
elif [[ ! -f "${ROOT}/docs/product/kit-baseline" ]]; then
  MODE="kit"
else
  MODE="product"
fi

echo "== check-zero-edit-zones: mode=${MODE} =="

export MODE ROOT
export ZONES_FILE
export ZERO_EDIT_BASE_REF="${ZERO_EDIT_BASE_REF:-}"

exec node --input-type=module <<'NODE'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.env.ROOT
const mode = process.env.MODE
const zonesPath = join(root, process.env.ZONES_FILE)

function die(msg, code = 1) {
  console.error(`check-zero-edit-zones: ${msg}`)
  process.exit(code)
}

function loadJson(path, label) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    die(`invalid JSON (${label}): ${path}: ${e.message}`)
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    const err = (e.stderr || e.message || '').toString()
    die(`git ${args.join(' ')} failed:\n${err}`)
  }
}

function gitLines(args) {
  const out = git(args)
  if (!out) return []
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

function refExists(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', ref], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

const zones = loadJson(zonesPath, 'zones')
if (!zones || zones.version !== 1) die(`zones config must have version: 1 (${zonesPath})`)
if (!Array.isArray(zones.protected_prefixes) || !Array.isArray(zones.protected_files)) {
  die('zones must define protected_prefixes and protected_files arrays')
}

const exceptionsPath = join(root, zones.exceptions_file || 'docs/product/zero-edit-exceptions.json')
const exceptionsDoc = loadJson(exceptionsPath, 'exceptions')

/** @type {Map<string, object>} */
const exceptionByPath = new Map()
const today = new Date()
today.setHours(0, 0, 0, 0)

function validateException(ex, idx) {
  const req = [
    'path',
    'reason',
    'owner',
    'expires',
    'ticket',
    'alternatives_considered',
    'why_not_alternative',
  ]
  for (const k of req) {
    if (ex[k] === undefined || ex[k] === null || ex[k] === '') {
      die(`exception[${idx}] missing required field "${k}" in ${exceptionsPath}`)
    }
  }
  if (!Array.isArray(ex.alternatives_considered) || ex.alternatives_considered.length === 0) {
    die(`exception[${idx}] alternatives_considered must be a non-empty array`)
  }
  if (typeof ex.why_not_alternative !== 'string' || ex.why_not_alternative.trim().length < 10) {
    die(
      `exception[${idx}] why_not_alternative must explain (≥10 chars) why design overrides / product paths fail`,
    )
  }
  if (typeof ex.reason !== 'string' || ex.reason.trim().length < 10) {
    die(`exception[${idx}] reason too short`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.expires)) {
    die(`exception[${idx}] expires must be YYYY-MM-DD`)
  }
  const exp = new Date(ex.expires + 'T00:00:00')
  if (Number.isNaN(exp.getTime())) die(`exception[${idx}] invalid expires date`)
  return { ...ex, expired: exp < today }
}

if (exceptionsDoc) {
  if (exceptionsDoc.version !== 1) die(`exceptions version must be 1 (${exceptionsPath})`)
  if (!Array.isArray(exceptionsDoc.exceptions)) die(`exceptions.exceptions must be an array`)
  exceptionsDoc.exceptions.forEach((ex, i) => {
    const v = validateException(ex, i)
    if (exceptionByPath.has(v.path)) die(`duplicate exception path: ${v.path}`)
    exceptionByPath.set(v.path, v)
  })
}

function isProtected(relPath) {
  const p = relPath.replace(/^\.\//, '')
  for (const pref of zones.protected_prefixes) {
    if (p === pref.replace(/\/$/, '') || p.startsWith(pref)) return true
  }
  for (const f of zones.protected_files) {
    if (p === f) return true
  }
  return false
}

/** Product apps under apps/* except kit examples are free (never need exception). */
function isFreeProductAppPath(relPath) {
  const p = relPath.replace(/^\.\//, '')
  if (!p.startsWith('apps/')) return false
  if (p.startsWith('apps/example-api/') || p === 'apps/example-api') return false
  if (p.startsWith('apps/example-web/') || p === 'apps/example-web') return false
  if (p.startsWith('apps/mcp-example/') || p === 'apps/mcp-example') return false
  return true
}

if (mode === 'kit') {
  const expired = [...exceptionByPath.values()].filter((e) => e.expired)
  if (expired.length) {
    console.error(
      'check-zero-edit-zones: WARNING expired exceptions present (product cleanup when dual-mission):',
    )
    for (const e of expired) {
      console.error(`  - ${e.path} expired ${e.expires} ticket=${e.ticket}`)
    }
  }
  console.log('check-zero-edit-zones: OK (kit mode — config valid, no upstream diff)')
  if (zones.design_overrides?.patterns?.length) {
    console.log(
      `  design_overrides: ${zones.design_overrides.patterns.map((p) => p.id).join(', ')}`,
    )
  }
  console.log(
    `  exceptions_file: ${zones.exceptions_file} (${exceptionByPath.size} entries loaded)`,
  )
  process.exit(0)
}

if (mode !== 'product') {
  die(`unknown mode "${mode}" (use kit|product or set ZERO_EDIT_MODE)`)
}

const defaultBase = zones.default_base_ref || 'upstream/main'
const baseRef = process.env.ZERO_EDIT_BASE_REF || defaultBase

if (!refExists(baseRef)) {
  die(
    `base ref "${baseRef}" not found.\n` +
      `  Product clones must provide a reachable kit base via one of:\n` +
      `    git remote add upstream <kit-parent-url>\n` +
      `    git fetch upstream\n` +
      `    docs/product/kit-baseline  # CI: full SHA of last-merged kit tip\n` +
      `    ZERO_EDIT_BASE_REF env\n` +
      `  Override: ZERO_EDIT_BASE_REF=upstream/main bun run zero-edit`,
  )
}

const pathspecs = [...zones.protected_prefixes, ...zones.protected_files]

const changed = new Set([
  ...gitLines(['diff', '--name-only', baseRef, 'HEAD', '--', ...pathspecs]),
  ...gitLines(['diff', '--name-only', 'HEAD', '--', ...pathspecs]),
  ...gitLines(['diff', '--cached', '--name-only', '--', ...pathspecs]),
  ...gitLines(['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]),
])

const violations = []
const expiredHits = []
const covered = []

for (const file of [...changed].sort()) {
  if (!isProtected(file)) continue
  if (isFreeProductAppPath(file)) continue

  const ex = exceptionByPath.get(file)
  if (!ex) {
    violations.push(file)
    continue
  }
  if (ex.expired) {
    expiredHits.push(ex)
    continue
  }
  covered.push(ex)
}

const stale = []
for (const [path, ex] of exceptionByPath) {
  if (!changed.has(path) && !ex.expired) stale.push(ex)
}

if (covered.length) {
  console.log('check-zero-edit-zones: allowed exceptions (active):')
  for (const ex of covered) {
    console.log(`  OK  ${ex.path}`)
    console.log(`      owner=${ex.owner} expires=${ex.expires} ticket=${ex.ticket}`)
  }
}

if (stale.length) {
  console.log(
    'check-zero-edit-zones: stale exceptions (path no longer diverges — remove entry):',
  )
  for (const ex of stale) {
    console.log(`  STALE ${ex.path} (expires ${ex.expires})`)
  }
}

let failed = false

if (expiredHits.length) {
  failed = true
  console.error(
    'check-zero-edit-zones: EXPIRED exceptions (renew with new justification or drop the kit patch):',
  )
  for (const ex of expiredHits) {
    console.error(`  EXPIRED ${ex.path} since ${ex.expires}`)
    console.error(`    ticket=${ex.ticket}`)
    console.error(`    reason=${ex.reason}`)
  }
}

if (violations.length) {
  failed = true
  console.error('check-zero-edit-zones: DIVERGED kit paths without exception:')
  for (const f of violations) {
    console.error(`  FORBIDDEN ${f}`)
  }
  console.error('')
  console.error('Fix options (prefer top):')
  console.error(
    '  1. Design override — CSS tokens / wrap @kit/ui in apps/<product>-web (see config/zero-edit-zones.json design_overrides)',
  )
  console.error('  2. Move logic to apps/<product>-* or docs/product/ (new paths)')
  console.error(
    '  3. Contribute fix on kit parent, then merge upstream/main',
  )
  console.error(
    '  4. Last resort: docs/product/zero-edit-exceptions.json (from config/zero-edit-exceptions.example.json)',
  )
  console.error(
    '     Required: path, reason, owner, expires, ticket, alternatives_considered, why_not_alternative',
  )
}

if (failed) {
  console.error('check-zero-edit-zones: FAILED')
  process.exit(1)
}

console.log(
  `check-zero-edit-zones: OK (product mode, base=${baseRef}, diverged_covered=${covered.length})`,
)
process.exit(0)
NODE
