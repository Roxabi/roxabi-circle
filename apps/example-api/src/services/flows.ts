import { AppError, createLogger, parseOrThrow } from '@kit/core'
import {
  canAdminFlows,
  canCreateFlowRun,
  checkPlan,
  createRunSnapshot,
  digestPlan,
  loadPlanFromYaml,
  type PlanDocument,
  PlanYamlError,
  parseRunnerView,
  readRunRollup,
} from '@kit/flows'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { z } from 'zod'
import type { schema } from '../db/schema'
import type { Env } from '../env'
import { dogfoodFixedGrant, dogfoodToolRegistry } from '../lib/flows-dogfood'
import * as flowsRepo from '../repos/flows'

type Db = DrizzleD1Database<typeof schema>
type PlanRow = typeof import('../db/schema').flowPlans.$inferSelect
type RunRow = typeof import('../db/schema').flowRuns.$inferSelect

const log = createLogger({ service: 'example-api', component: 'flows' })

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isUniqueConstraintError(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 6 && current != null; depth++) {
    if (/UNIQUE|unique constraint/i.test(errorMessage(current))) return true
    current = current instanceof Error ? current.cause : undefined
  }
  return false
}

function toPublicPlan(row: PlanRow) {
  return {
    id: row.id,
    orgId: row.orgId,
    planKey: row.planKey,
    version: row.version,
    enabled: row.enabled,
    digest: row.planDigest,
  }
}

function toPublicRun(row: RunRow) {
  const rollup = readRunRollup({
    status: row.status,
    receiptJson: row.receiptJson,
    errorCode: row.errorCode,
  })
  return {
    id: row.id,
    orgId: row.orgId,
    planId: row.planId,
    status: rollup.status,
    receipts: rollup.receipts,
    errorCode: rollup.errorCode ?? null,
  }
}

export async function listPlansForOrg(db: Db, orgId: string) {
  const rows = await flowsRepo.listPlansForOrg(db, orgId)
  return rows.map(toPublicPlan)
}

export async function getPlanForOrg(db: Db, orgId: string, planId: string) {
  const row = await flowsRepo.getPlan(db, planId, orgId)
  if (!row) throw AppError.notFound()
  return toPublicPlan(row)
}

export async function listRunsForOrg(db: Db, orgId: string) {
  const rows = await flowsRepo.listRunsForOrg(db, orgId)
  return rows.map(toPublicRun)
}

export async function getRunForOrg(db: Db, orgId: string, runId: string) {
  const row = await flowsRepo.getRun(db, runId, orgId)
  if (!row) throw AppError.notFound()
  return toPublicRun(row)
}

/** Extra keys (`allowedTools`, `grant`) fail closed — grant is minted server-side. */
const createPlanBodySchema = z.object({ yaml: z.string() }).strict()
const setEnabledBodySchema = z.object({ enabled: z.boolean() }).strict()
/** Extra keys (`yaml`, `grant`) fail closed — snapshot is from stored plan_json. */
const createRunBodySchema = z.object({}).strict()

export async function createPlan(
  db: Db,
  input: {
    orgId: string
    subject: string
    orgRole: string | null | undefined
    platformRole: string | null | undefined
    body: unknown
  },
) {
  if (!canAdminFlows({ orgRole: input.orgRole, platformRole: input.platformRole })) {
    throw AppError.forbidden()
  }
  const { yaml } = parseOrThrow(createPlanBodySchema, input.body)
  let plan: PlanDocument
  try {
    plan = loadPlanFromYaml(yaml)
  } catch (err) {
    if (err instanceof PlanYamlError) {
      throw AppError.validation(err.message, { code: err.code })
    }
    throw err
  }
  const checked = checkPlan(plan, dogfoodFixedGrant(input.orgId), dogfoodToolRegistry)
  if (!checked.ok) {
    throw AppError.validation(checked.issues[0]?.message ?? 'Plan check failed', {
      issues: checked.issues,
    })
  }
  const planKey = plan.plan.id
  const version = 1
  const existing = await flowsRepo.getPlanByOrgKeyVersion(db, input.orgId, planKey, version)
  if (existing) {
    throw AppError.conflict('Plan already exists')
  }
  const now = Date.now()
  const row = {
    id: `plan_${crypto.randomUUID().replace(/-/g, '')}`,
    orgId: input.orgId,
    planKey,
    version,
    enabled: true,
    yamlSource: yaml,
    planJson: JSON.stringify(plan),
    planDigest: digestPlan(plan),
    createdBy: input.subject,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await flowsRepo.insertPlan(db, row)
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict('Plan already exists')
    }
    throw err
  }
  return toPublicPlan(row)
}

export async function setEnabled(
  db: Db,
  input: {
    orgId: string
    planId: string
    orgRole: string | null | undefined
    platformRole: string | null | undefined
    body: unknown
  },
) {
  if (!canAdminFlows({ orgRole: input.orgRole, platformRole: input.platformRole })) {
    throw AppError.forbidden()
  }
  const { enabled } = parseOrThrow(setEnabledBodySchema, input.body)
  const existing = await flowsRepo.getPlan(db, input.planId, input.orgId)
  if (!existing) throw AppError.notFound()
  await flowsRepo.setPlanEnabled(db, { id: input.planId, orgId: input.orgId, enabled })
  const updated = await flowsRepo.getPlan(db, input.planId, input.orgId)
  if (!updated) throw AppError.notFound()
  return toPublicPlan(updated)
}

export async function createRun(
  db: Db,
  env: Pick<Env, 'FLOW_RUN'>,
  input: {
    orgId: string
    planId: string
    subject: string
    orgRole: string | null | undefined
    platformRole: string | null | undefined
    authMethod: 'session' | 'api_key' | null | undefined
    body: unknown
  },
) {
  if (
    !canCreateFlowRun({
      orgRole: input.orgRole,
      platformRole: input.platformRole,
      authMethod: input.authMethod,
    })
  ) {
    throw AppError.forbidden()
  }
  parseOrThrow(createRunBodySchema, input.body)
  const existing = await flowsRepo.getPlan(db, input.planId, input.orgId)
  if (!existing) throw AppError.notFound()
  let plan: unknown
  try {
    plan = JSON.parse(existing.planJson) as unknown
  } catch {
    throw AppError.validation('Invalid stored plan')
  }
  const snap = createRunSnapshot({
    plan,
    grant: dogfoodFixedGrant(input.orgId),
    registry: dogfoodToolRegistry,
    actorId: input.subject,
  })
  if (!snap.ok) {
    throw AppError.validation(snap.issues[0]?.message ?? 'Snapshot failed', {
      issues: snap.issues,
    })
  }
  const snapshotJson = JSON.stringify(snap.runnerView)
  const parsed = parseRunnerView(JSON.parse(snapshotJson) as unknown)
  if (!parsed.ok) {
    throw AppError.validation(parsed.issues[0]?.message ?? 'Runner view invalid', {
      issues: parsed.issues,
    })
  }
  const runId = `run_${crypto.randomUUID().replace(/-/g, '')}`
  const now = Date.now()
  const inserted = await flowsRepo.insertQueuedRunIfPlanEnabled(db, {
    id: runId,
    orgId: input.orgId,
    planId: existing.id,
    actorId: input.subject,
    snapshotJson,
    createdAt: now,
    updatedAt: now,
  })
  if (!inserted) {
    const again = await flowsRepo.getPlan(db, input.planId, input.orgId)
    if (!again) throw AppError.notFound()
    if (!again.enabled) throw AppError.conflict('Plan is disabled')
    throw AppError.internal()
  }
  try {
    await env.FLOW_RUN.create({ id: runId, params: { runId, orgId: input.orgId } })
  } catch (err) {
    log.error('flow_run_create_failed', {
      runId,
      orgId: input.orgId,
      error: errorMessage(err),
    })
    let marked = false
    try {
      marked = await flowsRepo.markQueuedRunCreateFailed(db, { id: runId, orgId: input.orgId })
    } catch (markErr) {
      log.error('flow_run_mark_create_failed', {
        runId,
        orgId: input.orgId,
        error: errorMessage(markErr),
      })
      throw AppError.internal()
    }
    if (!marked) {
      const row = await flowsRepo.getRun(db, runId, input.orgId)
      if (row?.status === 'failed' && row.errorCode === 'WORKFLOW_CREATE_FAILED') {
        throw new AppError('INTERNAL_ERROR', 'Internal error', 502)
      }
      throw AppError.internal()
    }
    throw new AppError('INTERNAL_ERROR', 'Internal error', 502)
  }
  return { id: runId, status: 'queued' as const }
}
