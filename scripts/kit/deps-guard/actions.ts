/**
 * github-actions half of the guard. A Dependabot actions PR may only move `uses:` pins:
 *   1. WORKFLOW_BEYOND_PINS — once every `uses: <action>@<ref> # comment` is normalised to its
 *      action name, base and head of each touched workflow file must be byte-identical.
 *   2. ACTION_UNPINNED — a new `uses:` ref that is not a 40-hex commit SHA.
 *   3. ACTION_IMPOSTOR — a new pinned SHA that is not reachable from the action repo's default
 *      branch, nor the commit of the tag its `# vX.Y.Z` comment names. A fork-network commit
 *      (impostor commit) resolves under the parent repo's URL but is neither: `compare` reports it
 *      ahead/diverged and the tag points elsewhere.
 * Workflow text is parsed as data with a regex; nothing from the PR is executed or checked out.
 */
import type { GitHubApi } from './github.ts'
import { str } from './json.ts'
import type { Reason, Verdict } from './types.ts'

const USES = /^(\s*(?:-\s+)?uses:\s*)(['"]?)([^\s'"#]+)\2[ \t]*(?:#[ \t]*(\S*).*)?$/
const SHA = /^[0-9a-f]{40}$/

type Use = { spec: string; action: string; ref: string; comment: string | undefined }

function extractUses(text: string): Use[] {
  const out: Use[] = []
  for (const line of text.split('\n')) {
    const m = USES.exec(line.replace(/\r$/, ''))
    if (!m) continue
    const spec = m[3] as string
    const at = spec.lastIndexOf('@')
    if (at <= 0) continue
    out.push({
      spec,
      action: spec.slice(0, at),
      ref: spec.slice(at + 1),
      comment: m[4] || undefined,
    })
  }
  return out
}

/** Text with every `uses:` pin reduced to `uses: <action>@PIN` (ref and trailing comment dropped). */
function withoutPins(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = USES.exec(line.replace(/\r$/, ''))
      const spec = m?.[3]
      const at = spec?.lastIndexOf('@') ?? -1
      return m && spec && at > 0 ? `${m[1]}${spec.slice(0, at)}@PIN` : line
    })
    .join('\n')
}

export type WorkflowChange = { path: string; base: string | undefined; head: string | undefined }

/** `owner/repo` of `owner/repo[/sub/path]`; undefined for local (`./`) and docker refs. */
function repoOf(action: string): string | undefined {
  if (action.startsWith('./') || action.startsWith('docker://')) return undefined
  const [owner, repo] = action.split('/')
  return owner && repo ? `${owner}/${repo}` : undefined
}

async function tagCommit(api: GitHubApi, repo: string, tag: string): Promise<string | undefined> {
  const ref = await api.get(`/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`)
  if (ref.status !== 200) return undefined
  const sha = str(ref.body, 'object', 'sha')
  if (str(ref.body, 'object', 'type') !== 'tag') return sha
  // Annotated tag: one more hop to the commit it points at.
  const annotated = await api.get(`/repos/${repo}/git/tags/${sha}`)
  return str(annotated.body, 'object', 'sha')
}

/** undefined = reachable; otherwise why not. */
async function unreachable(api: GitHubApi, use: Use): Promise<string | undefined> {
  const repo = repoOf(use.action) as string
  const meta = await api.get(`/repos/${repo}`)
  const branch = str(meta.body, 'default_branch')
  if (meta.status !== 200 || !branch) return `cannot read ${repo} (HTTP ${meta.status})`
  const cmp = await api.get(`/repos/${repo}/compare/${encodeURIComponent(branch)}...${use.ref}`)
  const status = str(cmp.body, 'status')
  if (cmp.status === 200 && (status === 'behind' || status === 'identical')) return undefined
  if (
    use.comment &&
    /^v?\d/.test(use.comment) &&
    (await tagCommit(api, repo, use.comment)) === use.ref
  ) {
    return undefined
  }
  return `${use.ref} is not on ${repo}'s default branch "${branch}" (compare: ${cmp.status === 200 ? status : `HTTP ${cmp.status}`}) and is not the commit of tag "${use.comment ?? '(no version comment)'}"`
}

export async function evaluateWorkflowChange(
  api: GitHubApi,
  files: readonly WorkflowChange[],
): Promise<Verdict> {
  const reasons: Reason[] = []
  const pins: { path: string; use: Use }[] = []
  for (const f of files) {
    if (f.base === undefined || f.head === undefined) {
      reasons.push({
        code: 'WORKFLOW_BEYOND_PINS',
        subject: f.path,
        detail: f.base === undefined ? 'workflow file added' : 'workflow file deleted',
      })
      continue
    }
    if (withoutPins(f.base) !== withoutPins(f.head)) {
      reasons.push({
        code: 'WORKFLOW_BEYOND_PINS',
        subject: f.path,
        detail: 'changes something other than `uses:` pins',
      })
      continue
    }
    const before = new Set(extractUses(f.base).map((u) => u.spec))
    for (const use of extractUses(f.head))
      if (!before.has(use.spec)) pins.push({ path: f.path, use })
  }

  const seen = new Set<string>()
  await Promise.all(
    pins.map(async ({ path, use }) => {
      const repo = repoOf(use.action)
      if (!repo) return
      const subject = `${use.action}@${use.ref.slice(0, 12)} (${path})`
      if (!SHA.test(use.ref)) {
        reasons.push({
          code: 'ACTION_UNPINNED',
          subject,
          detail: `ref "${use.ref}" is not a 40-hex commit SHA`,
        })
        return
      }
      if (seen.has(`${repo}@${use.ref}`)) return
      seen.add(`${repo}@${use.ref}`)
      const why = await unreachable(api, use)
      if (why) reasons.push({ code: 'ACTION_IMPOSTOR', subject, detail: why })
    }),
  )

  reasons.sort((a, b) => a.subject.localeCompare(b.subject) || a.code.localeCompare(b.code))
  return {
    verdict: reasons.length === 0 ? 'PASS' : 'WITHHOLD',
    reasons,
    checked: [`workflows: ${files.length} file(s), ${seen.size} new pinned SHA(s) verified`],
  }
}
