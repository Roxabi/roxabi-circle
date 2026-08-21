#!/usr/bin/env bash
# Fail if a product consumer diverges from inherited kit tip on protected paths
# without a valid, non-expired exception entry. ADR-0009.
#
# Modes:
#   kit     — allowlisted kit/mirror origin, no product inheritance marker
#   product — inheritance marker (or transitional kit-baseline) present
#
# Base (product): config/product/inheritance.json → upstreamCommit
#   transitional: docs/product/kit-baseline
#   NEVER upstream/main. NEVER auto-fetch.
#
# See config/kit/zero-edit-zones.json · docs/kit/architecture/adr/0009-…
set -euo pipefail

# Script lives at scripts/kit/ → monorepo is ../..
ROOT="${ZERO_EDIT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

ZONES_FILE="${ZERO_EDIT_ZONES_FILE:-config/kit/zero-edit-zones.json}"
if [[ ! -f "$ZONES_FILE" ]]; then
  echo "check-zero-edit-zones: missing $ZONES_FILE" >&2
  exit 1
fi

export ROOT ZONES_FILE
export ZERO_EDIT_MODE="${ZERO_EDIT_MODE:-}"
export ZERO_EDIT_HARNESS_SENTINEL="${ZERO_EDIT_HARNESS_SENTINEL:-}"

exec node --input-type=module <<'NODE'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.env.ROOT
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

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    if (allowFail) return ''
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
    execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

function isAncestor(anc, head = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', anc, head], {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function normalizeOriginUrl(url) {
  let u = (url || '').trim()
  if (!u) return ''
  u = u.replace(/\.git$/, '')
  const ssh = u.match(/^git@github\.com:(.+)$/)
  if (ssh) return ssh[1]
  const https = u.match(/^https:\/\/github\.com\/(.+)$/)
  if (https) return https[1]
  return u
}

function listTrackedUnder(prefix) {
  return gitLines(['ls-files', '-z', '--', prefix]).length
    ? git(['ls-files', '-z', '--', prefix]).split('\0').filter(Boolean)
    : []
}

/** Walk working tree dirs for unclassified paths under namespaced trees (tracked only). */
function inventoryUnclassified(zones) {
  const trees = zones.namespaced_trees || ['config', 'scripts', 'docs']
  const kitNs = zones.kit_namespace || 'kit'
  const prodNs = zones.product_namespace || 'product'
  const bad = []
  for (const tree of trees) {
    const files = listTrackedUnder(`${tree}/`)
    for (const f of files) {
      const parts = f.split('/')
      if (parts.length < 2) {
        bad.push(f)
        continue
      }
      const ns = parts[1]
      if (ns !== kitNs && ns !== prodNs) bad.push(f)
    }
  }
  return bad
}

const zones = loadJson(zonesPath, 'zones')
if (!zones || zones.version !== 1) die(`zones config must have version: 1 (${zonesPath})`)
if (!Array.isArray(zones.protected_prefixes) || !Array.isArray(zones.protected_files)) {
  die('zones must define protected_prefixes and protected_files arrays')
}

const inheritanceFile = zones.inheritance_file || 'config/product/inheritance.json'
const inheritancePath = join(root, inheritanceFile)
const allowlist = new Set(zones.kit_origin_allowlist || [])

const originUrl = git(['remote', 'get-url', 'origin'], { allowFail: true })
const originId = normalizeOriginUrl(originUrl)
const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim()
const identity = ghRepo || originId
const onAllowlist = identity !== '' && allowlist.has(identity)

const inheritanceDoc = loadJson(inheritancePath, 'inheritance')
const hasInheritance = Boolean(inheritanceDoc?.upstreamCommit)

// Mode resolution (ADR-0009 D5)
let mode
const modeEnv = process.env.ZERO_EDIT_MODE || ''
const harnessOk =
  modeEnv &&
  process.env.ZERO_EDIT_HARNESS_SENTINEL &&
  existsSync(process.env.ZERO_EDIT_HARNESS_SENTINEL)

if (modeEnv) {
  if (!harnessOk) {
    die(
      `ZERO_EDIT_MODE is set but ZERO_EDIT_HARNESS_SENTINEL is missing/unusable — forbidden on normal lefthook/CI (ADR-0009 D5)`,
    )
  }
  mode = modeEnv
} else if (hasInheritance) {
  if (onAllowlist) {
    die(
      `inheritance marker present on kit-allowlisted origin "${identity}" — mirrors/kits must not carry product markers`,
    )
  }
  mode = 'product'
} else if (onAllowlist) {
  mode = 'kit'
} else {
  die(
    `cannot classify repo (no marker, origin/identity "${identity || '(empty)'}" not in kit_origin_allowlist).\n` +
      `  Product: add ${inheritanceFile} after merge upstream.\n` +
      `  Kit/mirror: add repo to config/kit/zero-edit-zones.json kit_origin_allowlist.`,
  )
}

console.log(`== check-zero-edit-zones: mode=${mode} identity=${identity || '(none)'} ==`)

// Inventory gate (ADR-0009 D1/D6) — always
const unclassified = inventoryUnclassified(zones)
if (unclassified.length) {
  console.error('check-zero-edit-zones: unclassified paths under config|scripts|docs (need kit/ or product/):')
  for (const f of unclassified.slice(0, 50)) console.error(`  UNCLASSIFIED ${f}`)
  if (unclassified.length > 50) console.error(`  … +${unclassified.length - 50} more`)
  die('inventory gate failed (ADR-0009 D1)')
}

const exceptionsPath = join(root, zones.exceptions_file || 'config/product/zero-edit-exceptions.json')
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
  process.exit(0)
}

if (mode !== 'product') {
  die(`unknown mode "${mode}" (use kit|product)`)
}

// Resolve base (ADR-0009 D4 / #107) — inheritance.json only; never upstream/main
let baseRef = ''
let baseSource = inheritanceFile

if (!hasInheritance) {
  die(`product mode requires ${inheritanceFile} with upstreamCommit (full SHA)`)
}
{
  const sha = String(inheritanceDoc.upstreamCommit || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    die(`${inheritanceFile}: upstreamCommit must be a full 40-char SHA`)
  }
  baseRef = sha
}

if ((process.env.ZERO_EDIT_BASE_REF || '').trim()) {
  die('ZERO_EDIT_BASE_REF is removed (#107) — use config/product/inheritance.json only')
}

if (!refExists(baseRef)) {
  die(
    `base commit ${baseRef} not in local history (from ${baseSource}).\n` +
      `  Deepen checkout / re-merge upstream — checker never auto-fetches.`,
  )
}

if (!isAncestor(baseRef, 'HEAD')) {
  die(`base ${baseRef} is not an ancestor of HEAD — marker must be an inherited tip`)
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
    '  1. Design override — CSS tokens / wrap @kit/ui in apps/<product>-web (see design_overrides)',
  )
  console.error('  2. Move logic to apps/<product>-* or config|docs|scripts/product/')
  console.error('  3. Contribute fix on kit parent, then merge upstream + refresh inheritance.json')
  console.error(
    `  4. Last resort: ${zones.exceptions_file} (from ${zones.exceptions_example})`,
  )
}

if (failed) {
  console.error('check-zero-edit-zones: FAILED')
  process.exit(1)
}

console.log(
  `check-zero-edit-zones: OK (product mode, base=${baseRef}, source=${baseSource}, diverged_covered=${covered.length})`,
)
process.exit(0)
NODE
