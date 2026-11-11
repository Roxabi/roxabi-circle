import type { CapabilityGrant, EffectiveAuthority } from './authority'
import { unionAfterWithBindings } from './bindings'
import { hardMaxTokens, staticTokenBudget } from './budget'
import { type CheckIssue, checkPlan } from './check'
import { digestPlan } from './digest-plan'
import { deepFreeze } from './freeze'
import { isKitRegistry, isMintedGrant } from './provenance'
import type { ToolRegistry } from './registry'
import {
  executionTools,
  type ParseRunnerViewResult,
  parseRunnerView,
  RUNNER_VIEW_VERSION,
  type RunnerView,
  runnerViewSchema,
} from './runner-view'
import type { PlanDocument, PlanTask } from './schema'

export type { ParseRunnerViewResult, RunnerView }
export { digestPlan, executionTools, parseRunnerView, RUNNER_VIEW_VERSION, runnerViewSchema }

export type CreateSnapshotInput = {
  plan: unknown
  grant: unknown
  registry: ToolRegistry
  actorId: string
  createdAt?: string
}

export type CreateSnapshotResult =
  | { ok: true; runnerView: RunnerView; grantAudit: CapabilityGrant }
  | { ok: false; issues: CheckIssue[] }

/**
 * Seal a checked plan into a runner view + separate grant audit copy.
 * **Persist `runnerView` only** on the Workflow / execution path (`JSON.stringify(runnerView)`).
 * Store `grantAudit` separately if needed for admin audit (never for dispatch).
 *
 * Provenance, not just conformity: the grant MUST be the object `mintCapabilityGrant` returned and
 * the registry the object `createToolRegistry` built. `checkPlan` can only prove a grant stays
 * inside the mintable set — it cannot prove `allowsInfer`, which comes from policy facts no
 * registry carries, so a forged grant that copies the mintable set and sets `allowsInfer: true`
 * would otherwise seal an infer run the org policy refuses.
 *
 * @capability flows-run-snapshot
 * @tag critical
 * @invariant runner-executes-snapshot-only: the runner must execute the runner view, never the live plan row; plan edits create a new version and in-flight runs are unchanged — ADR-0005 D4 § Run snapshot / RunnerView
 * @invariant sealing-requires-kit-provenance: createRunSnapshot seals only a grant returned by mintCapabilityGrant and a registry built by createToolRegistry — GRANT_NOT_MINTED / REGISTRY_NOT_KIT_BUILT — ADR-0005 D4 amendment
 * @contract flows-snapshot-port: createRunSnapshot(input) -> RunnerView + grantAudit
 */
export function createRunSnapshot(input: CreateSnapshotInput): CreateSnapshotResult {
  if (!input.actorId || input.actorId.trim() === '' || input.actorId.length > 256) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_INVALID',
          message: 'actorId is required (1..256 chars)',
          path: 'actorId',
        },
      ],
    }
  }

  if (!isKitRegistry(input.registry)) {
    return {
      ok: false,
      issues: [
        {
          code: 'REGISTRY_NOT_KIT_BUILT',
          message: 'registry was not built by createToolRegistry — a run cannot be sealed from it',
          path: 'registry',
        },
      ],
    }
  }
  if (!isMintedGrant(input.grant)) {
    return {
      ok: false,
      issues: [
        {
          code: 'GRANT_NOT_MINTED',
          message:
            'grant did not come from mintCapabilityGrant — provenance is required to seal a run',
          path: 'grant',
        },
      ],
    }
  }

  const checked = checkPlan(input.plan, input.grant, input.registry)
  if (!checked.ok) return { ok: false, issues: checked.issues }

  const effective: EffectiveAuthority = checked.effective
  const sealedPlan = sealBindingAfter(structuredClone(checked.plan) as PlanDocument)
  const staticBudget = staticTokenBudget(sealedPlan)
  const hard = hardMaxTokens(sealedPlan)
  const grantAudit: CapabilityGrant = {
    orgId: checked.grant.orgId,
    allowedTools: [...checked.grant.allowedTools],
    registryVersion: checked.grant.registryVersion,
    allowsInfer: checked.grant.allowsInfer,
    allowedModels: [...checked.grant.allowedModels],
  }
  const tools = Object.freeze([...effective.tools]) as readonly string[]
  const toolEffectsField = sealReadToolEffects(tools, input.registry)

  const ceilings: RunnerView['ceilings'] = {
    hardMaxTokens: hard,
    staticTokenBudget: staticBudget,
    ...(sealedPlan.plan.max_tokens !== undefined
      ? { planMaxTokens: sealedPlan.plan.max_tokens }
      : {}),
  }

  const runnerView: RunnerView = {
    runnerViewVersion: RUNNER_VIEW_VERSION,
    orgId: checked.grant.orgId,
    actorId: input.actorId,
    planId: sealedPlan.plan.id,
    planDigest: digestPlan(sealedPlan),
    sealedPlan,
    executionTools: tools,
    ...toolEffectsField,
    registryVersion: input.registry.version,
    registryContentDigest: input.registry.contentDigest,
    ceilings,
    allowsInfer: checked.grant.allowsInfer,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }

  return {
    ok: true,
    runnerView: deepFreeze(runnerView),
    grantAudit: deepFreeze(grantAudit),
  }
}

/** Seal authored∪binding `after` edges without rewriting plan_json. */
function sealBindingAfter(sealedPlan: PlanDocument): PlanDocument {
  for (const taskId of Object.keys(sealedPlan.tasks)) {
    const task = sealedPlan.tasks[taskId] as PlanTask
    const after = unionAfterWithBindings(task.after, task.invoke?.args)
    if (after === undefined) {
      const { after: _drop, ...rest } = task
      sealedPlan.tasks[taskId] = rest
    } else {
      sealedPlan.tasks[taskId] = { ...task, after }
    }
  }
  return sealedPlan
}

/**
 * Seal retry hints from the registry at create-run; driver must not re-read the live registry.
 * Emit the map only when any execution tool is `'read'` so all-write snapshots stay parseable by
 * pre-Roxabi/roxabi-boilerplate-cf#234 `.strict()` RunnerView schemas without bumping `RUNNER_VIEW_VERSION` (ADR-0005 D4).
 */
function sealReadToolEffects(
  tools: readonly string[],
  registry: ToolRegistry,
): { toolEffects: Readonly<Record<string, 'read' | 'write'>> } | Record<string, never> {
  const toolEffects: Record<string, 'read' | 'write'> = {}
  let anyRead = false
  for (const name of tools) {
    const effect = registry.tools.get(name)?.effect === 'read' ? 'read' : 'write'
    toolEffects[name] = effect
    if (effect === 'read') anyRead = true
  }
  return anyRead ? { toolEffects: Object.freeze(toolEffects) } : {}
}
