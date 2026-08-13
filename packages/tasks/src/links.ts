import { MAX_LINK_TRAVERSAL, type TaskLinkKind } from './constants'
import type { TaskLink } from './schema'

export type LinkIssueCode = 'REFLEXIVE' | 'DUPLICATE_EDGE' | 'MULTIPLE_PARENTS' | 'CYCLE'

export type LinkIssue = {
  code: LinkIssueCode
  message: string
}

export type LinkEdge = Pick<TaskLink, 'orgId' | 'fromTaskId' | 'toTaskId' | 'kind'>

/**
 * parent: from = parent, to = child (one incoming parent per child).
 * blocks: from blocks to.
 * duplicates: from is duplicate of to (canonical).
 */
export function checkNewLink(existing: readonly LinkEdge[], next: LinkEdge): LinkIssue[] {
  const issues: LinkIssue[] = []
  if (next.fromTaskId === next.toTaskId) {
    issues.push({ code: 'REFLEXIVE', message: 'link cannot connect a task to itself' })
    return issues
  }

  const sameOrg = existing.filter((e) => e.orgId === next.orgId)
  for (const e of existing) {
    if (e.orgId !== next.orgId) continue
    if (e.fromTaskId === next.fromTaskId && e.toTaskId === next.toTaskId && e.kind === next.kind) {
      issues.push({ code: 'DUPLICATE_EDGE', message: 'identical link already exists' })
    }
  }

  if (next.kind === 'parent') {
    const otherParents = sameOrg.filter((e) => e.kind === 'parent' && e.toTaskId === next.toTaskId)
    if (otherParents.length > 0) {
      issues.push({
        code: 'MULTIPLE_PARENTS',
        message: 'child task already has a parent link',
      })
    }
  }

  // Cycle check per kind within org
  const wouldCycle = createsCycle(
    sameOrg.filter((e) => e.kind === next.kind),
    next.fromTaskId,
    next.toTaskId,
    next.kind,
  )
  if (wouldCycle) {
    issues.push({
      code: 'CYCLE',
      message: `adding ${next.kind} link would create a cycle`,
    })
  }

  return issues
}

/**
 * DFS: after adding edge from→to, is there a path to→…→from?
 */
function createsCycle(
  edgesOfKind: readonly LinkEdge[],
  from: string,
  to: string,
  _kind: TaskLinkKind,
): boolean {
  const adj = new Map<string, string[]>()
  for (const e of edgesOfKind) {
    const list = adj.get(e.fromTaskId) ?? []
    list.push(e.toTaskId)
    adj.set(e.fromTaskId, list)
  }
  const list = adj.get(from) ?? []
  list.push(to)
  adj.set(from, list)

  const stack = [to]
  const seen = new Set<string>()
  let steps = 0
  while (stack.length > 0 && steps < MAX_LINK_TRAVERSAL) {
    steps += 1
    const node = stack.pop()
    if (node === undefined) break
    if (node === from) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adj.get(node) ?? []) {
      stack.push(next)
    }
  }
  return false
}

/** Children of parent (kind=parent, from=parent). */
export function childTaskIds(
  links: readonly LinkEdge[],
  orgId: string,
  parentTaskId: string,
): string[] {
  return links
    .filter((e) => e.orgId === orgId && e.kind === 'parent' && e.fromTaskId === parentTaskId)
    .map((e) => e.toTaskId)
}

/** Tasks blocked by blocker (kind=blocks). */
export function blockedTaskIds(
  links: readonly LinkEdge[],
  orgId: string,
  blockerTaskId: string,
): string[] {
  return links
    .filter((e) => e.orgId === orgId && e.kind === 'blocks' && e.fromTaskId === blockerTaskId)
    .map((e) => e.toTaskId)
}
