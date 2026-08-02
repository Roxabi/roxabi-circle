#!/usr/bin/env bun
/**
 * import-boundary — static layer gate for monorepo Chemin A (ADR-0001).
 *
 * Proves (CP-IMPORT):
 *   R1/R2 packages ↛ apps (workspace name or relative)
 *   R3 example-web ↛ example-api src
 *   R4 example-web ↛ cloudflare:workers (and WORKER_BAR_IMPORTS)
 *   exemptions require reason; invalid config → exit 2
 *
 * Does NOT prove: runtime/DI purity, non-literal dynamic imports,
 * full tsconfig alias graph, product-owned graphs, R5 routes↛repos.
 *
 * Env: IMPORT_BOUNDARY_ROOT — override monorepo root (self-test harness).
 * Exit: 0 clean · 1 violations · 2 bad exemptions config
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'

// Harness override for self-test temp trees (scripts run outside Turbo task graph).
// biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo-cached task env
const ROOT = resolve(process.env.IMPORT_BOUNDARY_ROOT ?? join(import.meta.dirname, '..'))

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cts', '.mts'])
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.wrangler',
  'coverage',
  '.git',
  '.turbo',
  'build',
])

/** Bare specifiers forbidden under apps/example-web (R4). */
const WORKER_BAR_IMPORTS = new Set(['cloudflare:workers', 'cloudflare:email'])

const EXEMPTIONS_REL = join('tools', 'import-boundary-exemptions.txt')

type Zone = 'package' | 'example-web' | 'example-api' | 'other-app' | 'outside'

type WorkspaceEntry = { name: string; absDir: string; zone: Zone }

type ImportHit = {
  file: string
  line: number
  specifier: string
}

type Violation = ImportHit & { rule: string }

function isSourceFile(name: string): boolean {
  if (name.endsWith('.d.ts')) return false
  if (/\.(test|spec)\.(ts|tsx|js|mjs|cts|mts)$/.test(name)) return false
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return SOURCE_EXT.has(name.slice(dot))
}

function walkSources(dir: string, out: string[]): void {
  if (!existsSync(dir)) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent)) continue
    const abs = join(dir, ent)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) walkSources(abs, out)
    else if (st.isFile() && isSourceFile(ent)) out.push(abs)
  }
}

function loadPackageName(pkgJsonPath: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { name?: string }
    return typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : null
  } catch {
    return null
  }
}

function zoneForAppDir(dirName: string): Zone {
  if (dirName === 'example-web') return 'example-web'
  if (dirName === 'example-api') return 'example-api'
  return 'other-app'
}

function loadWorkspaceMap(root: string): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = []

  const packagesRoot = join(root, 'packages')
  if (existsSync(packagesRoot)) {
    for (const dir of readdirSync(packagesRoot)) {
      const absDir = join(packagesRoot, dir)
      if (!statSync(absDir).isDirectory()) continue
      const name = loadPackageName(join(absDir, 'package.json'))
      if (name) entries.push({ name, absDir, zone: 'package' })
    }
  }

  const appsRoot = join(root, 'apps')
  if (existsSync(appsRoot)) {
    for (const dir of readdirSync(appsRoot)) {
      const absDir = join(appsRoot, dir)
      if (!statSync(absDir).isDirectory()) continue
      const name = loadPackageName(join(absDir, 'package.json'))
      if (name) entries.push({ name, absDir, zone: zoneForAppDir(dir) })
    }
  }

  // Longest name first for subpath prefix match (@gosilex/feedback/react).
  entries.sort((a, b) => b.name.length - a.name.length)
  return entries
}

function zoneOfPath(absPath: string, root: string): Zone {
  const rel = relative(root, absPath).split(sep).join('/')
  if (rel.startsWith('packages/') || rel === 'packages') return 'package'
  if (rel.startsWith('apps/example-web/') || rel === 'apps/example-web') return 'example-web'
  if (rel.startsWith('apps/example-api/') || rel === 'apps/example-api') return 'example-api'
  if (rel.startsWith('apps/') || rel === 'apps') return 'other-app'
  return 'outside'
}

/** Extract static import/export/require string literals (line best-effort). */
function extractImports(content: string, file: string): ImportHit[] {
  const hits: ImportHit[] = []
  // from '…' / from "…" (import and export … from)
  const fromRe = /\bfrom\s+['"]([^'"]+)['"]/g
  // side-effect import '…'
  const sideRe = /\bimport\s+['"]([^'"]+)['"]/g
  // require('…') / import('…')
  const callRe = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  const lineAt = (index: number): number => {
    let line = 1
    for (let i = 0; i < index && i < content.length; i++) {
      if (content[i] === '\n') line++
    }
    return line
  }

  const pushAll = (re: RegExp) => {
    re.lastIndex = 0
    for (;;) {
      const m = re.exec(content)
      if (m === null) break
      hits.push({ file, line: lineAt(m.index), specifier: m[1] })
    }
  }

  pushAll(fromRe)
  pushAll(sideRe)
  pushAll(callRe)
  return hits
}

type ResolveResult =
  | { kind: 'workspace'; entry: WorkspaceEntry; absPath: string }
  | { kind: 'relative'; absPath: string }
  | { kind: 'bare'; specifier: string }
  | { kind: 'unresolved' }

function resolveSpecifier(
  specifier: string,
  importerAbs: string,
  workspace: WorkspaceEntry[],
): ResolveResult {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const absPath = normalize(resolve(dirname(importerAbs), specifier))
    return { kind: 'relative', absPath }
  }

  for (const entry of workspace) {
    if (specifier === entry.name || specifier.startsWith(`${entry.name}/`)) {
      const rest = specifier === entry.name ? '' : specifier.slice(entry.name.length + 1)
      const absPath = rest ? join(entry.absDir, rest) : entry.absDir
      return { kind: 'workspace', entry, absPath }
    }
  }

  return { kind: 'bare', specifier }
}

type ExemptionsLoad = { ok: true; paths: Set<string> } | { ok: false; errors: string[] }

function loadExemptions(root: string): ExemptionsLoad {
  const path = join(root, EXEMPTIONS_REL)
  if (!existsSync(path)) {
    return { ok: true, paths: new Set() }
  }
  const paths = new Set<string>()
  const errors: string[] = []
  const lines = readFileSync(path, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    // Format: <exact/relative/path>  # reason — #issue
    const hash = trimmed.indexOf('#')
    if (hash < 0) {
      errors.push(`${EXEMPTIONS_REL}:${lineNo}: missing reason after #`)
      continue
    }
    const filePart = trimmed.slice(0, hash).trim()
    const reason = trimmed.slice(hash + 1).trim()
    if (!filePart) {
      errors.push(`${EXEMPTIONS_REL}:${lineNo}: empty path before #`)
      continue
    }
    if (!reason) {
      errors.push(`${EXEMPTIONS_REL}:${lineNo}: empty reason after #`)
      continue
    }
    // Normalize to posix-ish relative path (no leading ./)
    const norm = filePart.replace(/^\.\//, '').split(sep).join('/')
    paths.add(norm)
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, paths }
}

function relPosix(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/')
}

function targetUnderApps(absPath: string, root: string, workspace: WorkspaceEntry[]): boolean {
  const z = zoneOfPath(absPath, root)
  if (z === 'example-web' || z === 'example-api' || z === 'other-app') return true
  // Workspace entry rooted under apps/
  for (const e of workspace) {
    if (e.zone === 'package') continue
    const rootSlash = e.absDir.endsWith(sep) ? e.absDir : e.absDir + sep
    if (absPath === e.absDir || absPath.startsWith(rootSlash)) return true
  }
  return false
}

function targetUnderExampleApi(
  absPath: string,
  root: string,
  workspace: WorkspaceEntry[],
): boolean {
  if (zoneOfPath(absPath, root) === 'example-api') return true
  for (const e of workspace) {
    if (e.zone !== 'example-api') continue
    const rootSlash = e.absDir.endsWith(sep) ? e.absDir : e.absDir + sep
    if (absPath === e.absDir || absPath.startsWith(rootSlash)) return true
  }
  return false
}

function classify(
  hit: ImportHit,
  importerZone: Zone,
  resolved: ResolveResult,
  root: string,
  workspace: WorkspaceEntry[],
): Violation | null {
  if (importerZone === 'example-web' && WORKER_BAR_IMPORTS.has(hit.specifier)) {
    return { ...hit, rule: 'R4' }
  }

  if (resolved.kind === 'bare' || resolved.kind === 'unresolved') {
    return null
  }

  const absTarget =
    resolved.kind === 'workspace'
      ? resolved.absPath
      : resolved.kind === 'relative'
        ? resolved.absPath
        : null
  if (!absTarget) return null

  if (importerZone === 'package' && targetUnderApps(absTarget, root, workspace)) {
    const rule = resolved.kind === 'relative' ? 'R2' : 'R1'
    return { ...hit, rule }
  }

  if (importerZone === 'example-web' && targetUnderExampleApi(absTarget, root, workspace)) {
    return { ...hit, rule: 'R3' }
  }

  return null
}

export function scanRoot(root: string = ROOT): {
  violations: Violation[]
  exemptionErrors: string[]
  filesScanned: number
} {
  const workspace = loadWorkspaceMap(root)
  const exemptions = loadExemptions(root)
  if (!exemptions.ok) {
    return { violations: [], exemptionErrors: exemptions.errors, filesScanned: 0 }
  }

  const files: string[] = []
  walkSources(join(root, 'packages'), files)
  walkSources(join(root, 'apps'), files)

  const violations: Violation[] = []

  for (const abs of files) {
    const rel = relPosix(root, abs)
    if (exemptions.paths.has(rel)) continue

    const importerZone = zoneOfPath(abs, root)
    if (importerZone === 'outside') continue

    let content: string
    try {
      content = readFileSync(abs, 'utf8')
    } catch {
      continue
    }

    for (const hit of extractImports(content, rel)) {
      const resolved = resolveSpecifier(hit.specifier, abs, workspace)
      const v = classify(hit, importerZone, resolved, root, workspace)
      if (v) violations.push(v)
    }
  }

  return { violations, exemptionErrors: [], filesScanned: files.length }
}

function main(): void {
  const started = performance.now()
  console.log(`import-boundary — root=${ROOT}`)

  const { violations, exemptionErrors, filesScanned } = scanRoot(ROOT)

  if (exemptionErrors.length > 0) {
    for (const e of exemptionErrors) console.error(`CONFIG: ${e}`)
    console.error(
      '\nimport-boundary: invalid exemptions (exit 2). Each active line needs: path  # reason — #issue',
    )
    console.error(`Fix: edit ${EXEMPTIONS_REL}`)
    process.exit(2)
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.rule} ${v.file}:${v.line} → ${v.specifier}`)
    }
    console.error(`\nimport-boundary: ${violations.length} violation(s) in ${filesScanned} file(s)`)
    console.error(`Fix: remove edge | ${EXEMPTIONS_REL}  # reason — #issue`)
    process.exit(1)
  }

  const ms = Math.round(performance.now() - started)
  console.log(`import-boundary OK — ${filesScanned} files, 0 violations (${ms}ms)`)
  if (ms > 3000) {
    console.warn(`WARN: import-boundary p95 budget 3s exceeded (${ms}ms)`)
  }
  process.exit(0)
}

if (import.meta.main) {
  main()
}
