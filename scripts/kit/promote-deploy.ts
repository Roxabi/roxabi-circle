#!/usr/bin/env bun
/**
 * Deploy gate (Roxabi/roxabi-boilerplate-cf#256). Cloudflare Workers Builds and Pages use `deploy/<branch>` as their production
 * branch. This script decides which commit that branch may move to: the newest first-parent commit
 * of `<branch>` that descends from it and whose required workflows all succeeded on their **push**
 * run for that exact SHA — with no red secret scan anywhere in the range it would ship. It prints
 * `promote=<sha>` and `target=deploy/<branch>` to $GITHUB_OUTPUT (stdout when unset); the workflow
 * pushes it, fast-forward only, with a token minted after this decision.
 *
 * Required workflows = kit CI + Secret scan, plus the union of Product workflows declared at the
 * resolved deployed SHA and at each candidate SHA (`config/product/deploy-gate.json`, product mode
 * when `inheritance.json` is present). Each declared workflow must run as `Product CI`.
 *
 * The union is monotone for this decision only: a candidate can add a requirement, and dropping one
 * does not erase what the deployed SHA still declares. It is not an eternal veto — promoting a
 * commit that undeclares a workflow while that workflow's own push run is still green moves the
 * baseline; the next decision no longer requires it. Deleting the file before that promotion leaves
 * the deployed obligation missing and blocks. This union runs only once this revision itself is on
 * `deploy/<branch>` (the job executes the promoted script, not the tip).
 *
 * Candidate declarations are git data (`git show`), never a checkout or an execution of that commit.
 * A finding or a candidate-only wrong name excludes that candidate and the loop continues. A finding
 * or a git read failure on the deployed SHA refuses the run. A git read failure on a candidate is
 * not absence: that candidate is not green, with the error in the detail. Those details, run names
 * and surfaced git errors are untrusted: the log renders them so a newline or `::` / `##[` marker
 * cannot form a workflow command on stdout or stderr. `promote` and `target` are written only to
 * `$GITHUB_OUTPUT`.
 *
 * `--check` (Roxabi/roxabi-boilerplate-cf#317, retirement Roxabi/roxabi-boilerplate-cf#331, Roxabi/roxabi-boilerplate-cf#325) validates the working-tree
 * declaration, then workflows the local `refs/remotes/origin/deploy/<SOURCE_BRANCH>` snapshot still
 * requires. Those blobs are read with `readDeclarationAt` and judged in this working tree, never
 * in the old YAML. No GitHub API, no `gh`, no fetch, no push. ENOENT on the `.git` marker, or a
 * missing deploy ref, is bootstrap. Any other marker or git failure — including exit 128 — and a
 * deployed declaration or read failure, refuse. `SOURCE_BRANCH` is `main` | `staging` (default
 * `main`). Each finding is
 * `promote-deploy: CHECK — <file>: <finding>` on stderr, then a FAILED summary; exit 1 if any.
 * When those are clean, pinned actionlint checks the inspected workflows (expression syntax and
 * local reusable-workflow calls). Its output is the failure, rendered command-inert; a product actionlint config is not read.
 *
 * Trust: run promotion from a checkout of `deploy/<branch>` — the workflow does — so this code and
 * its runtime config are the last green revision. The Product baseline is the blob at the resolved
 * deployed SHA, not the worktree, so a dirty checkout cannot change it. Candidate blobs are read
 * with git, never checked out.
 * Env:   GITHUB_REPOSITORY (owner/repo, promotion only) · SOURCE_BRANCH (`main` | `staging`, default
 *        `main`) · GH_TOKEN (actions: read) for `gh api` — not used by `--check`
 * Exit:  0 — decided (promote, or nothing green ahead) or `--check` clean; 1 — refused (bad input
 *        or config, deploy branch diverged, API answer incomplete) or `--check` findings.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkDeployGate,
  type GateFinding,
  KIT_WORKFLOWS,
  PRODUCT_WORKFLOW_NAME,
} from './lib/deploy-gate-check'
import { type RevisionDeclaration, readDeclarationAt } from './lib/deploy-gate-git'
import { classifyDeployRefProbe } from './lib/deploy-ref-probe'
import { selectLatestRun } from './lib/latest-run.cjs'
import { PRODUCT_CONFIG } from './lib/product-declaration.cjs'

const SECRET_SCAN = '.github/workflows/secret-scan.yml'
/** First-parent commits examined per run; older ones wait for the deploy branch to catch up. */
const MAX_CANDIDATES = 50
/** First-parent commits whose Secret scan is read for one candidate's range (one API call each). */
const MAX_RANGE = 200

type WorkflowRun = {
  id?: number
  name?: string
  path?: string
  status?: string
  conclusion?: string | null
}

function run(cmd: string, args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return { code: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

function git(args: string[]): string {
  const r = run('git', args)
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.err || r.out}`)
  return r.out
}

/** One log line. Control characters and workflow-command markers in untrusted text stay inert. */
function commandInert(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\r') out += '\\r'
    else if (ch === '\n') out += '\\n'
    else if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
      out += `\\u${code.toString(16).padStart(4, '0')}`
    } else out += ch
  }
  return out.replace(/::/g, ':\\:').replace(/##\[/g, '#\\#[')
}

function stderrLine(text: string): void {
  console.error(commandInert(text))
}

function logLine(text: string): void {
  console.log(commandInert(text))
}

function refuse(msg: string): never {
  stderrLine(`promote-deploy: REFUSED — ${msg}`)
  process.exit(1)
}

type RequiredSet = { paths: string[]; product: Set<string>; deployProduct: Set<string> }

function deployedBaseline(rev: string): { paths: string[]; product: string[] } {
  let loaded: RevisionDeclaration
  try {
    loaded = readDeclarationAt(rev)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    refuse(`${PRODUCT_CONFIG} is not readable at ${rev.slice(0, 12)}: ${detail}`)
  }
  const first = loaded.findings[0]
  if (first) refuse(first.refusal)
  return { paths: [...KIT_WORKFLOWS, ...loaded.product], product: loaded.product }
}

function unionRequired(
  baseline: { paths: string[]; product: string[] },
  extra: readonly string[],
): RequiredSet {
  const paths = [...baseline.paths]
  const product = new Set(baseline.product)
  for (const path of extra) {
    if (!paths.includes(path)) paths.push(path)
    product.add(path)
  }
  return { paths, product, deployProduct: new Set(baseline.product) }
}

const cache = new Map<string, WorkflowRun[]>()
const declarations = new Map<string, RevisionDeclaration>()

function candidateDeclaration(sha: string): RevisionDeclaration {
  const hit = declarations.get(sha)
  if (hit) return hit
  const loaded = readDeclarationAt(sha)
  declarations.set(sha, loaded)
  return loaded
}

/** Push runs of `sha` on `branch` (all workflows), one API page, cached per SHA. */
function pushRuns(repo: string, branch: string, sha: string): WorkflowRun[] {
  const hit = cache.get(sha)
  if (hit) return hit
  const query = `repos/${repo}/actions/runs?head_sha=${sha}&event=push&branch=${branch}&per_page=100`
  const r = run('gh', ['api', query])
  if (r.code !== 0) refuse(`cannot read workflow runs for ${sha}: ${r.err || r.out}`)
  const body: unknown = JSON.parse(r.out)
  const runs =
    body && typeof body === 'object' && 'workflow_runs' in body && Array.isArray(body.workflow_runs)
      ? (body.workflow_runs as WorkflowRun[])
      : []
  const total =
    body && typeof body === 'object' && 'total_count' in body
      ? Number(body.total_count)
      : runs.length
  if (total > runs.length) refuse(`workflow runs for ${sha} span several pages`)
  cache.set(sha, runs)
  return runs
}

/** Latest push run per required workflow for `sha`; success only is green. */
function verdict(runs: WorkflowRun[], required: RequiredSet) {
  const states: string[] = []
  let green = true
  for (const path of required.paths) {
    const last = selectLatestRun(runs, path)
    const name = path.replace(/^\.github\/workflows\//, '')
    if (!last) {
      states.push(`${name}=missing`)
      green = false
      continue
    }
    if (required.product.has(path) && last.name !== PRODUCT_WORKFLOW_NAME) {
      if (required.deployProduct.has(path)) {
        refuse(
          `${path} runs as '${last.name}', not '${PRODUCT_WORKFLOW_NAME}': the gate is never triggered by it`,
        )
      }
      states.push(`${name}=runs as '${last.name}'`)
      green = false
      continue
    }
    states.push(`${name}=${last.status === 'completed' ? last.conclusion : last.status}`)
    if (last.status !== 'completed' || last.conclusion !== 'success') green = false
  }
  return { green, detail: states.join(' ') }
}

/**
 * The push scan only covers each push's own diff: every push in the range must be clean. Pushes to
 * the branch are its first-parent commits (a merge's scan covers its side commits' content).
 */
function dirtyScan(repo: string, branch: string, deployed: string, sha: string): string | null {
  const range = git(['rev-list', '--first-parent', `${deployed}..${sha}`])
    .split('\n')
    .filter(Boolean)
  if (range.length > MAX_RANGE) {
    refuse(
      `${deployed.slice(0, 12)}..${sha.slice(0, 12)} spans ${range.length} pushes (> ${MAX_RANGE}) — promote by hand (deploy-cloudflare.md § Break-glass)`,
    )
  }
  for (const c of range) {
    const scan = selectLatestRun(pushRuns(repo, branch, c), SECRET_SCAN)
    if (scan && (scan.status !== 'completed' || scan.conclusion !== 'success')) {
      return `${c.slice(0, 12)} secret-scan.yml=${scan.status === 'completed' ? scan.conclusion : scan.status}`
    }
  }
  return null
}
function sourceBranch(): string {
  const source = (process.env.SOURCE_BRANCH ?? 'main').trim()
  if (source !== 'main' && source !== 'staging') {
    refuse(`SOURCE_BRANCH must be main or staging, got '${source}'`)
  }
  return source
}

function readSource(): { repo: string; source: string; target: string } {
  const repo = (process.env.GITHUB_REPOSITORY ?? '').trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    refuse(`GITHUB_REPOSITORY must be owner/repo, got '${repo}'`)
  }
  const source = sourceBranch()
  return { repo, source, target: `deploy/${source}` }
}

function resolveDeployedTip(source: string, target: string): { tip: string; deployed: string } {
  git(['fetch', '--quiet', 'origin', `+refs/heads/${source}:refs/remotes/origin/${source}`])
  const tip = git(['rev-parse', `refs/remotes/origin/${source}`])
  const deployed =
    run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${target}`]).out.split(/\s+/)[0] ?? ''
  if (!deployed)
    refuse(
      `${target} does not exist yet — bootstrap it at a green commit (deploy-cloudflare.md § Cutover)`,
    )
  git(['fetch', '--quiet', 'origin', `+refs/heads/${target}:refs/remotes/origin/${target}`])
  if (run('git', ['merge-base', '--is-ancestor', deployed, tip]).code !== 0) {
    refuse(
      `${target} (${deployed.slice(0, 12)}) is not an ancestor of ${source} — not forcing; see deploy-cloudflare.md § Break-glass`,
    )
  }
  return { tip, deployed }
}

function listCandidates(deployed: string, tip: string): string[] {
  // --ancestry-path: only first-parent commits that descend from the deployed one (a break-glass
  // commit merged into main keeps production on the hotfix line).
  return git([
    'rev-list',
    '--first-parent',
    '--ancestry-path',
    `--max-count=${MAX_CANDIDATES}`,
    `${deployed}..${tip}`,
  ])
    .split('\n')
    .filter(Boolean)
}

function emitPromote(sha: string, target: string): void {
  const lines = `promote=${sha}\ntarget=${target}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines)
  else process.stdout.write(lines)
}

function candidateVerdict(
  repo: string,
  source: string,
  sha: string,
  baseline: { paths: string[]; product: string[] },
): { green: boolean; detail: string } {
  try {
    const decl = candidateDeclaration(sha)
    const first = decl.findings[0]
    if (first)
      return { green: false, detail: `${first.file}@${sha.slice(0, 12)}: ${first.finding}` }
    return verdict(pushRuns(repo, source, sha), unionRequired(baseline, decl.product))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { green: false, detail: `${PRODUCT_CONFIG}@${sha.slice(0, 12)}: ${detail}` }
  }
}

function pickGreen(
  repo: string,
  source: string,
  target: string,
  deployed: string,
  candidates: string[],
  baseline: { paths: string[]; product: string[] },
): boolean {
  for (const sha of candidates) {
    const v = candidateVerdict(repo, source, sha, baseline)
    const dirty = v.green ? dirtyScan(repo, source, deployed, sha) : null
    logLine(
      `promote-deploy: ${sha.slice(0, 12)} ${v.green && !dirty ? 'green' : 'not green'} (${v.detail}${dirty ? `; range has ${dirty}` : ''})`,
    )
    if (!v.green || dirty) continue
    emitPromote(sha, target)
    logLine(
      `promote-deploy: ${target} ${deployed.slice(0, 12)} → ${sha} (newest green of ${candidates.length})`,
    )
    return true
  }
  return false
}

/**
 * Local deploy snapshot for `--check`. ENOENT on `.git` is a non-git fixture. Any other marker
 * or git failure refuses — exit 128 is not absence. A missing deploy ref (verify exit 1, quiet)
 * is bootstrap. A signal or a null status is not absence. Does not fetch.
 */
function deploySnapshot(root: string, source: string): string | null {
  try {
    lstatSync(join(root, '.git'))
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    refuse(`cannot read .git: ${err.message || String(error)}`)
  }
  const ref = `refs/remotes/origin/deploy/${source}`
  const probed = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', ref], {
    encoding: 'utf8',
  })
  const classified = classifyDeployRefProbe(ref, {
    status: probed.status,
    signal: probed.signal,
    stdout: probed.stdout ?? '',
    stderr: probed.stderr ?? '',
    error: probed.error instanceof Error ? probed.error.message : undefined,
  })
  if ('refusal' in classified) refuse(classified.refusal)
  return classified.sha
}

function deployedRetention(
  root: string,
  source: string,
): {
  paths: string[]
  findings: GateFinding[]
} {
  const rev = deploySnapshot(root, source)
  if (rev === null) return { paths: [], findings: [] }
  try {
    const declared = readDeclarationAt(rev, root)
    return {
      paths: declared.product,
      findings: declared.findings.map(({ file, finding }) => ({ file, finding })),
    }
  } catch (error) {
    refuse(error instanceof Error ? error.message : String(error))
  }
}

function reportCheck(findings: GateFinding[]): void {
  for (const finding of findings) {
    stderrLine(`promote-deploy: CHECK — ${finding.file}: ${finding.finding}`)
  }
  stderrLine(`promote-deploy: check FAILED (${findings.length} finding(s))`)
  process.exit(1)
}

function runActionlint(root: string, files: readonly string[]): void {
  if (files.length === 0) refuse('actionlint was not given any workflow file')
  const script = join(import.meta.dirname, 'actionlint-check.sh')
  const r = spawnSync('bash', [script, ...files.map((rel) => join(root, rel))], {
    cwd: root,
    encoding: 'utf8',
  })
  if (r.error) refuse(`actionlint failed to start: ${r.error.message}`)
  const text = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim()
  if ((r.status ?? 1) !== 0) {
    stderrLine(text || 'promote-deploy: actionlint failed')
    process.exit(r.status ?? 1)
  }
}

function main(): void {
  if (process.argv.includes('--check')) {
    const source = sourceBranch()
    const root = process.cwd()
    const retained = deployedRetention(root, source)
    const result = checkDeployGate(root, source, retained.paths)
    const findings = [...retained.findings, ...result.findings]
    if (findings.length > 0) reportCheck(findings)
    runActionlint(root, result.syntaxFiles)
    logLine(
      `promote-deploy: check OK (${result.count} product workflow(s), source branch ${source})`,
    )
    return
  }
  const { repo, source, target } = readSource()
  const { tip, deployed } = resolveDeployedTip(source, target)
  const baseline = deployedBaseline(deployed)
  const candidates = listCandidates(deployed, tip)
  if (candidates.length === 0) {
    logLine(
      `promote-deploy: ${target} is at ${source} (${deployed.slice(0, 12)}) — nothing to promote`,
    )
    return
  }
  if (pickGreen(repo, source, target, deployed, candidates, baseline)) return
  logLine(
    `promote-deploy: no green commit ahead of ${target} — ${target} unchanged, the next completed run re-evaluates`,
  )
}

main()
