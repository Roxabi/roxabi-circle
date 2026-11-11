#!/usr/bin/env bun
/**
 * tsconfig-orphans — every tracked TypeScript file belongs to a TS project,
 * and every workspace that owns src/ has a project a typecheck script invokes.
 *
 * Root `tsconfig.json` is not repo-wide: it lists the tooling files no
 * workspace owns (kit scripts, vite/vitest configs, app scripts).
 * Workspace sources are owned by `{apps,packages}/<ws>/tsconfig.json`.
 *
 * The gap that creates: a new `.ts` outside any workspace `src/` and outside
 * the root `include` globs is checked by nobody and lands in no editor
 * project — silently. That is how `packages/ui/vite.config.ts` stayed
 * unchecked.
 *
 * COVERAGE invariant:
 *   tracked {ts,tsx,mts,cts} MINUS <ws>/src/** for every {apps,packages}/<ws>
 *   that has a package.json
 *   is a subset of `tsc -p tsconfig.json --listFilesOnly`
 *
 * The manifest is what makes that subtraction legitimate: a directory under
 * apps|packages without one is not a workspace, nothing runs a project for it,
 * and subtracting its src/ would hide the file from both invariants at once.
 *
 * Coverage counts the whole program, not just roots: a file pulled in by an
 * import is really typechecked. Drop that import and the file leaves the
 * program — the gate then flags it, which is the point.
 *
 * That subtraction of `{apps,packages}/<ws>/src/**` is a hole of its own: it
 * trusts a workspace to run its own project(s), and nothing ran that trust.
 * `apps/example-web` now ships TWO programs (browser `tsconfig.json`,
 * Node `tsconfig.test.json`) and `turbo typecheck` only executes the
 * workspace's `typecheck` script — delete half that script and 22 test files
 * stop being typechecked with nothing going red.
 *
 * CITATION invariant:
 *   for each {apps,packages}/<ws>: tracked files under <ws>/src/ imply at
 *   least one runnable tsconfig*.json at the workspace root (otherwise the
 *   coverage subtraction has nothing to assume); every such project is named
 *   by a tsc command in that workspace's own `typecheck` script — and every
 *   project that script names exists. A citation counts only when tsc/tsgo/
 *   vue-tsc is in the same command as `-p`/`-b`. `|| true` and `|` discard
 *   tsc's status and do not count.
 *
 * Does NOT prove the covering project uses the right compilerOptions, does
 * NOT look inside workspace projects (a workspace `exclude` can still orphan
 * its own sources), does NOT audit projects nested below a workspace root,
 * and does not audit `.mjs`/`.js`/`.cjs` files. The root program checks three
 * named CJS files, but this orphan invariant remains TypeScript-only.
 * Semantic type checking belongs to `typecheck` / `typecheck:tooling`.
 *
 * Exit 0 clean · 1 orphans and/or citation breaks · 2 cannot read the tree,
 * the project, or a tsconfig/package manifest.
 * Override: TSCONFIG_ORPHANS_ROOT (throwaway trees in the self-test).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

const ROOT = realpathSync(
  resolve(process.env.TSCONFIG_ORPHANS_ROOT ?? join(import.meta.dirname, '../..')),
)

/**
 * The kit checkout that owns this script. `tsc` is always taken from here, so
 * the self-test can point ROOT at a temp tree with no node_modules.
 */
const KIT_ROOT = realpathSync(resolve(join(import.meta.dirname, '../..')))

/** git pathspecs for the file kinds a TS project can own. */
const TS_PATHSPECS = ['*.ts', '*.tsx', '*.mts', '*.cts']

/** Files under a workspace `src/` are owned by that workspace's project. */
const WORKSPACE_SRC = /^((?:apps|packages)\/[^/]+)\/src\//

const ROOT_PROJECT_REL = 'tsconfig.json'

/** Workspace roots, as git pathspecs plus the exact shape they must have. */
const WORKSPACE_MANIFEST_PATHSPECS = ['apps/*/package.json', 'packages/*/package.json']
const WORKSPACE_MANIFEST = /^(?:apps|packages)\/[^/]+\/package\.json$/
const WORKSPACE_TSCONFIG_PATHSPECS = ['apps/*/tsconfig*.json', 'packages/*/tsconfig*.json']
const WORKSPACE_TSCONFIG = /^(?:apps|packages)\/[^/]+\/tsconfig[^/]*\.json$/

/**
 * A `tsconfig*.json` is a runnable PROJECT once it declares its own inputs.
 * Declaring none makes it a base meant for `extends` only — `tsc -p` on it
 * would sweep every file under its directory, which is never what a base is
 * for (`packages/config/tsconfig.base.json`). Structural on purpose: renaming
 * that base changes nothing here, and the day a base grows an `include` it
 * becomes executable and starts being audited.
 */
const PROJECT_INPUT_KEYS = ['files', 'include', 'references']

/** `tsc`, `tsgo`, `vue-tsc`, or any of them reached through a path. */
const TSC_BINARY = /(?:^|\/)(?:[\w.]+-)?ts(?:c|go)$/

/** Shell operators that end one command inside a package script. */
const SCRIPT_SEPARATORS = /&&|\|\||;|\|/

/**
 * `|| true`, `|| exit 0`, or a pipe: the script's status is not tsc's.
 * Not a shell parser — these two spellings are the ones that turn a red
 * typecheck green without deleting the command.
 */
function swallowsExit(script: string): boolean {
  if (/\|\|\s*(?:true|exit\s+0)\b/.test(script)) return true
  // A lone `|` (pipe), not part of `||`.
  if (/(?:^|[^|])\|(?:[^|]|$)/.test(script)) return true
  return false
}

function fail(message: string, hint?: string): never {
  console.error(`tsconfig-orphans: ${message}`)
  if (hint) console.error(hint)
  process.exit(2)
}

/**
 * `git ls-files` inside ROOT, as posix ROOT-relative paths.
 *
 * `untracked` adds non-ignored files git does not track yet. The coverage
 * audit stays tracked-only — a scratch `.ts` is nobody's debt. The citation
 * audit opts in: a `tsconfig*.json` sitting in the checkout is already the
 * project vite, vitest and tsserver load, so it must be cited before it is
 * staged, not one commit later.
 */
function gitFiles(pathspecs: string[], untracked: boolean): string[] {
  const args = ['git', 'ls-files', '-z', '--cached']
  if (untracked) args.push('--others', '--exclude-standard')
  const git = Bun.spawnSync([...args, '--', ...pathspecs], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (git.exitCode !== 0) {
    fail(
      `git ls-files failed in ${ROOT} (exit ${git.exitCode})`,
      git.stderr.toString().trim() || 'Fix: run this gate inside a git checkout',
    )
  }
  return git.stdout
    .toString()
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.split(sep).join('/'))
    .sort()
}

/** Workspace roots that own their sources: the ones carrying a manifest. */
function manifestWorkspaces(): Set<string> {
  return new Set(
    gitFiles(WORKSPACE_MANIFEST_PATHSPECS, true)
      .filter((path) => WORKSPACE_MANIFEST.test(path))
      .map((path) => path.slice(0, -'/package.json'.length)),
  )
}

/** Tracked TS files, sources owned by a real workspace removed. */
function candidates(): string[] {
  const owned = manifestWorkspaces()
  return gitFiles(TS_PATHSPECS, false).filter((path) => {
    const workspace = WORKSPACE_SRC.exec(path)?.[1]
    return workspace === undefined || !owned.has(workspace)
  })
}

/**
 * Files the root project actually opens, as ROOT-relative posix paths.
 * List compiler inputs without repeating the separate semantic typecheck.
 */
function projectFiles(): Set<string> {
  const tsc = join(KIT_ROOT, 'node_modules', '.bin', 'tsc')
  if (!existsSync(tsc)) {
    fail(`missing ${relative(KIT_ROOT, tsc)}`, 'Fix: bun install')
  }
  const run = Bun.spawnSync(
    [tsc, '-p', join(ROOT, ROOT_PROJECT_REL), '--noEmit', '--listFilesOnly', '--pretty', 'false'],
    { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' },
  )
  const stdout = run.stdout.toString()
  const covered = new Set<string>()
  for (const line of stdout.split('\n')) {
    const path = line.trim()
    // A listed file exists; a diagnostic line ("file.ts(1,2): error TS…") does not.
    if (!(isAbsolute(path) && existsSync(path))) continue
    const rel = relative(ROOT, path).split(sep).join('/')
    if (rel.length > 0 && !rel.startsWith('..')) covered.add(rel)
  }
  if (covered.size === 0) {
    fail(
      `tsc listed no file for ${ROOT_PROJECT_REL} (exit ${run.exitCode})`,
      `${stdout.trim() || run.stderr.toString().trim()}\nFix: repair ${ROOT_PROJECT_REL} so the project loads`,
    )
  }
  return covered
}

/**
 * JSONC → object. tsconfig files carry comments (this repo's root project does)
 * and `JSON.parse` refuses them; nothing under scripts/kit exposes a JSONC
 * reader, so strip comments and trailing commas here. String-aware: a `//`
 * inside a path string survives. Unparseable → exit 2, never "no project".
 */
function skipLineComment(text: string, i: number): number {
  while (i < text.length && text[i] !== '\n') i++
  return i
}

function skipBlockComment(text: string, i: number): number {
  const end = text.indexOf('*/', i + 2)
  return end === -1 ? text.length : end + 2
}

function pushJsoncChar(out: string[], char: string, lastSignificant: number): number {
  // Trailing comma: legal in a tsconfig, fatal for JSON.parse.
  if ((char === '}' || char === ']') && out[lastSignificant] === ',') {
    out[lastSignificant] = ''
  }
  out.push(char)
  return char.trim().length > 0 ? out.length - 1 : lastSignificant
}

function stripJsonc(text: string): string {
  const out: string[] = []
  let lastSignificant = -1
  let i = 0
  while (i < text.length) {
    const char = text[i] as string
    if (char === '"') {
      i = copyJsonString(text, i, out)
      lastSignificant = out.length - 1
      continue
    }
    if (char === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i)
      continue
    }
    if (char === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i)
      continue
    }
    lastSignificant = pushJsoncChar(out, char, lastSignificant)
    i++
  }
  return out.join('')
}

function copyJsonString(text: string, start: number, out: string[]): number {
  let end = start + 1
  while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
  out.push(text.slice(start, Math.min(end + 1, text.length)))
  return end + 1
}

function parseJsonc(rel: string): Record<string, unknown> {
  const cleaned = stripJsonc(readFileSync(resolve(ROOT, rel), 'utf8'))
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (error) {
    fail(`cannot parse ${rel}`, `${String(error)}\nFix: repair ${rel} so tools can read it`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`${rel} is not a JSON object`, `Fix: repair ${rel}`)
  }
  return parsed as Record<string, unknown>
}

/**
 * Projects a workspace script runs, as ROOT-relative posix paths.
 *
 * Read the way a shell reads it: split on `&&`/`||`/`;`/`|`, then per command
 * take the `-p` / `--project[=]` / `-b` operands — but only if that command
 * is tsc (or tsgo / vue-tsc). `echo … -p tsconfig.json` is not a citation.
 * A tsc command with no operand compiles `<cwd>/tsconfig.json`, which inside
 * a workspace script is that workspace's own project — counted, so
 * `"typecheck": "tsc --noEmit"` is recognised instead of being reported as
 * an uncited project.
 */
function citeProject(cited: Set<string>, wsDir: string, operand: string): void {
  const value = operand.replace(/^\.\//, '')
  const project = value.endsWith('.json') ? value : `${value}/${ROOT_PROJECT_REL}`
  cited.add(join(wsDir, project).split(sep).join('/'))
}

function citeProjectFlag(
  token: string,
  next: string | undefined,
  wsDir: string,
  cited: Set<string>,
): number {
  if (token.startsWith('--project=')) {
    citeProject(cited, wsDir, token.slice('--project='.length))
    return 1
  }
  if ((token === '-p' || token === '--project') && next !== undefined && !next.startsWith('-')) {
    citeProject(cited, wsDir, next)
    return 1
  }
  return 0
}

function citeBuildOperands(
  tokens: string[],
  start: number,
  wsDir: string,
  cited: Set<string>,
): number {
  let operands = 0
  for (const operand of tokens.slice(start + 1)) {
    if (operand.startsWith('-')) break
    citeProject(cited, wsDir, operand)
    operands++
  }
  return operands
}

function citeFromTokens(tokens: string[], wsDir: string, cited: Set<string>): number {
  let operands = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string
    const fromFlag = citeProjectFlag(token, tokens[i + 1], wsDir, cited)
    if (fromFlag > 0) {
      operands += fromFlag
      continue
    }
    if (token === '-b' || token === '--build') {
      operands += citeBuildOperands(tokens, i, wsDir, cited)
    }
  }
  return operands
}

function citedProjects(script: string, wsDir: string): Set<string> {
  const cited = new Set<string>()
  for (const segment of script.split(SCRIPT_SEPARATORS)) {
    const tokens = tokenize(segment)
    if (!tokens.some((token) => TSC_BINARY.test(token))) continue
    if (citeFromTokens(tokens, wsDir, cited) === 0) citeProject(cited, wsDir, ROOT_PROJECT_REL)
  }
  return cited
}

/** argv of one command, honouring the quotes a package script may use. */
function tokenize(segment: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote = ''
  for (const char of segment) {
    if (quote !== '') {
      if (char === quote) quote = ''
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char.trim().length === 0) {
      if (current.length > 0) tokens.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/**
 * Every runnable project at a workspace root must be named by that workspace's
 * `typecheck` script, and every project that script names must exist.
 *
 * This is the invariant the `{apps,packages}/<ws>/src/**` subtraction above
 * assumes. `turbo typecheck` runs the script and nothing else, so the script
 * is the only place where "this program is checked in CI" is expressed. A
 * workspace with src/ and no project makes that assumption false — reported,
 * not silently green.
 */
function typecheckScript(manifest: string): unknown {
  const scripts = parseJsonc(manifest).scripts
  if (scripts === null || typeof scripts !== 'object') return undefined
  return (scripts as Record<string, unknown>).typecheck
}

function auditWorkspaceProjects(
  wsDir: string,
  manifest: string,
  script: unknown,
  swallowed: boolean,
  runs: Set<string>,
  tsconfigs: string[],
): { audited: number; runnableHere: number; problems: { report: string; fix: string }[] } {
  const problems: { report: string; fix: string }[] = []
  let audited = 0
  let runnableHere = 0
  for (const rel of tsconfigs.filter((path) => path.startsWith(`${wsDir}/`))) {
    const config = parseJsonc(rel)
    if (!PROJECT_INPUT_KEYS.some((key) => config[key] !== undefined)) continue
    runnableHere++
    audited++
    // SWALLOWED already reported for the workspace; don't pile UNCITED.
    if (swallowed) continue
    if (runs.has(rel)) continue
    problems.push({
      report: `UNCITED ${rel} — ${
        typeof script === 'string'
          ? `the "typecheck" script of ${wsDir} never runs this project`
          : `${wsDir} has no "typecheck" script, so nothing runs this project`
      }`,
      fix: `make "typecheck" in ${manifest} run \`tsc --noEmit -p ${basename(rel)}\`, or delete ${rel}`,
    })
  }
  return { audited, runnableHere, problems }
}

function auditCitations(): { audited: number; problems: { report: string; fix: string }[] } {
  const manifests = gitFiles(WORKSPACE_MANIFEST_PATHSPECS, true).filter((path) =>
    WORKSPACE_MANIFEST.test(path),
  )
  const tsconfigs = gitFiles(WORKSPACE_TSCONFIG_PATHSPECS, true).filter((path) =>
    WORKSPACE_TSCONFIG.test(path),
  )
  const problems: { report: string; fix: string }[] = []
  let audited = 0
  const trackedTs = gitFiles(TS_PATHSPECS, false)

  for (const manifest of manifests) {
    const wsDir = manifest.slice(0, -'/package.json'.length)
    const script = typecheckScript(manifest)
    const swallowed = typeof script === 'string' && swallowsExit(script)
    const runs =
      typeof script === 'string' && !swallowed ? citedProjects(script, wsDir) : new Set<string>()

    if (swallowed) {
      problems.push({
        report: `SWALLOWED ${wsDir} — the "typecheck" script discards tsc's exit status (\`|| true\` or a pipe)`,
        fix: `remove \`|| true\` / the pipe from "typecheck" in ${manifest} so a type error fails the script`,
      })
    }

    const local = auditWorkspaceProjects(wsDir, manifest, script, swallowed, runs, tsconfigs)
    audited += local.audited
    problems.push(...local.problems)

    if (local.runnableHere === 0 && trackedTs.some((path) => path.startsWith(`${wsDir}/src/`))) {
      problems.push({
        report: `NO PROJECT ${wsDir} — src/ is subtracted from coverage but no project owns it`,
        fix: `add ${wsDir}/tsconfig.json covering src/ and a "typecheck" script that runs \`tsc --noEmit\``,
      })
    }

    for (const rel of runs) {
      if (existsSync(resolve(ROOT, rel))) continue
      problems.push({
        report: `PHANTOM ${rel} — the "typecheck" script of ${wsDir} cites a missing project`,
        fix: `create ${rel}, or drop it from "typecheck" in ${manifest}`,
      })
    }
  }
  return { audited, problems }
}

function main(): void {
  const started = performance.now()
  console.log(`tsconfig-orphans — root=${ROOT}`)

  const tracked = candidates()
  const citations = auditCitations()
  const covered = projectFiles()
  const orphans = tracked.filter((path) => !covered.has(path))

  for (const problem of citations.problems) {
    console.error(problem.report)
    console.error(`  Fix: ${problem.fix}`)
  }
  for (const path of orphans) {
    console.error(`ORPHAN ${path} — no TS project opens this file`)
  }

  if (orphans.length > 0) {
    console.error(
      `\ntsconfig-orphans: ${orphans.length} orphan file(s) of ${tracked.length} outside workspace src`,
    )
    console.error(
      `Fix: add the path to "include" in ${ROOT_PROJECT_REL}, or move it under a workspace that owns it`,
    )
  }
  if (citations.problems.length > 0) {
    console.error(
      `\ntsconfig-orphans: ${citations.problems.length} citation break(s) of ${citations.audited} workspace project(s) — a project no "typecheck" script runs is checked by nobody`,
    )
  }
  if (orphans.length > 0 || citations.problems.length > 0) {
    process.exit(1)
  }

  const ms = Math.round(performance.now() - started)
  console.log(
    `tsconfig-orphans OK — ${tracked.length} file(s) outside workspace src, 0 orphan(s); ${citations.audited} workspace project(s) all cited by their "typecheck" script (${ms}ms)`,
  )
  process.exit(0)
}

if (import.meta.main) {
  main()
}
