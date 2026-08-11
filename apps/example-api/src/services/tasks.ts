import { AppError, parseOrThrow } from '@kit/core'
import type { Audience } from '@kit/tasks'
import {
  canSetVisibility,
  canViewTask,
  createTaskInputSchema,
  filterTasksForAudience,
  findDefaultStage,
  isStageOnBoard,
  suggestedDoneForStage,
  updateTaskInputSchema,
} from '@kit/tasks'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as tasksRepo from '../repos/tasks'

type Db = DrizzleD1Database<typeof schema>

const DEFAULT_BOARD = 'main'

export function resolveAudience(input: {
  orgRole?: string | null
  platformRole?: string | null
}): Audience {
  // reader ≈ external portal principal for dogfood IDOR matrix
  if (input.orgRole === 'reader') return 'external'
  return 'staff'
}

export async function ensureDefaultBoard(db: Db, orgId: string): Promise<void> {
  const existing = await tasksRepo.listStages(db, orgId, DEFAULT_BOARD)
  if (existing.length > 0) return
  const now = Date.now()
  const stages = [
    {
      id: crypto.randomUUID(),
      orgId,
      boardKey: DEFAULT_BOARD,
      label: 'Todo',
      position: 0,
      isDefault: true,
      isTerminal: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      boardKey: DEFAULT_BOARD,
      label: 'Doing',
      position: 1,
      isDefault: false,
      isTerminal: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      boardKey: DEFAULT_BOARD,
      label: 'Done',
      position: 2,
      isDefault: false,
      isTerminal: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
  for (const s of stages) {
    await tasksRepo.insertStage(db, s)
  }
}

function toApiTask(
  row: typeof import('../db/schema').kitTasks.$inferSelect,
  assigneeIds: string[],
) {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    description: row.description,
    boardKey: row.boardKey,
    stageId: row.stageId,
    visibility: row.visibility,
    scopeKind: row.scopeKind,
    scopeId: row.scopeId,
    priority: row.priority,
    dueAt: row.dueAt,
    done: row.done,
    order: row.orderIndex,
    externalUrl: row.externalUrl,
    createdBy: row.createdBy,
    assigneeIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listTasksForOrg(db: Db, orgId: string, audience: Audience) {
  await ensureDefaultBoard(db, orgId)
  const rows = await tasksRepo.listTasks(db, orgId)
  const visible = filterTasksForAudience(
    rows.map((r) => ({ ...r, visibility: r.visibility as 'internal' | 'shared' })),
    audience,
  )
  const ids = visible.map((r) => r.id)
  const assignees = await tasksRepo.listAssigneesForTasks(db, ids)
  const byTask = new Map<string, string[]>()
  for (const a of assignees) {
    const list = byTask.get(a.taskId) ?? []
    list.push(a.userId)
    byTask.set(a.taskId, list)
  }
  return visible.map((r) => toApiTask(r, byTask.get(r.id) ?? []))
}

export async function getTaskForOrg(db: Db, orgId: string, id: string, audience: Audience) {
  const row = await tasksRepo.getTask(db, orgId, id)
  if (!row) throw AppError.notFound('Task not found')
  if (!canViewTask({ visibility: row.visibility as 'internal' | 'shared' }, audience)) {
    throw AppError.notFound('Task not found')
  }
  const assignees = await tasksRepo.listAssigneesForTasks(db, [id])
  return toApiTask(
    row,
    assignees.map((a) => a.userId),
  )
}

export async function createTaskForOrg(
  db: Db,
  orgId: string,
  actorId: string,
  audience: Audience,
  raw: unknown,
) {
  await ensureDefaultBoard(db, orgId)
  const input = parseOrThrow(
    createTaskInputSchema,
    { ...(raw as object), orgId, createdBy: actorId },
    'Invalid task',
  )
  const visibility = input.visibility ?? 'shared'
  if (!canSetVisibility(audience, visibility)) {
    throw AppError.forbidden('Cannot set this visibility')
  }
  const stages = await tasksRepo.listStages(db, orgId, input.boardKey)
  const stageRows = stages.map((s) => ({
    id: s.id,
    orgId: s.orgId,
    boardKey: s.boardKey,
    label: s.label,
    position: s.position,
    isDefault: s.isDefault,
    isTerminal: s.isTerminal,
  }))
  let stageId = input.stageId
  if (!stageId) {
    const def = findDefaultStage(stageRows, orgId, input.boardKey)
    if (!def) throw AppError.validation('No default stage for board')
    stageId = def.id
  } else if (!isStageOnBoard(stageRows, orgId, input.boardKey, stageId)) {
    throw AppError.validation('Stage not on board')
  }
  const doneHint = suggestedDoneForStage(stageRows, stageId)
  const now = Date.now()
  const id = crypto.randomUUID()
  await tasksRepo.insertTask(db, {
    id,
    orgId,
    title: input.title,
    description: input.description ?? null,
    boardKey: input.boardKey,
    stageId,
    visibility,
    scopeKind: input.scopeKind ?? null,
    scopeId: input.scopeId ?? null,
    priority: input.priority ?? null,
    dueAt: input.dueAt ?? null,
    done: input.done ?? doneHint ?? false,
    orderIndex: input.order ?? 0,
    externalUrl: input.externalUrl ?? null,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  })
  await tasksRepo.replaceAssignees(db, id, input.assigneeIds ?? [], now)
  return getTaskForOrg(db, orgId, id, audience)
}

export async function updateTaskForOrg(
  db: Db,
  orgId: string,
  id: string,
  audience: Audience,
  raw: unknown,
) {
  const existing = await tasksRepo.getTask(db, orgId, id)
  if (!existing) throw AppError.notFound('Task not found')
  if (!canViewTask({ visibility: existing.visibility as 'internal' | 'shared' }, audience)) {
    throw AppError.notFound('Task not found')
  }
  if (audience === 'external') {
    throw AppError.forbidden('External audience cannot update tasks')
  }
  const input = parseOrThrow(updateTaskInputSchema, raw, 'Invalid task patch')
  if (input.visibility && !canSetVisibility(audience, input.visibility)) {
    throw AppError.forbidden('Cannot set this visibility')
  }
  const boardKey = input.boardKey ?? existing.boardKey
  const stages = await tasksRepo.listStages(db, orgId, boardKey)
  const stageRows = stages.map((s) => ({
    id: s.id,
    orgId: s.orgId,
    boardKey: s.boardKey,
    label: s.label,
    position: s.position,
    isDefault: s.isDefault,
    isTerminal: s.isTerminal,
  }))
  const stageId = input.stageId
  if (stageId && !isStageOnBoard(stageRows, orgId, boardKey, stageId)) {
    throw AppError.validation('Stage not on board')
  }
  const nextStage = stageId ?? existing.stageId
  let done = input.done
  if (stageId && done === undefined) {
    done = suggestedDoneForStage(stageRows, nextStage)
  }
  const now = Date.now()
  const patch: Parameters<typeof tasksRepo.updateTask>[3] = { updatedAt: now }
  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.boardKey !== undefined) patch.boardKey = input.boardKey
  if (stageId !== undefined) patch.stageId = stageId
  if (input.visibility !== undefined) patch.visibility = input.visibility
  if (input.scopeKind !== undefined) patch.scopeKind = input.scopeKind
  if (input.scopeId !== undefined) patch.scopeId = input.scopeId
  if (input.priority !== undefined) patch.priority = input.priority
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt
  if (done !== undefined) patch.done = done
  if (input.order !== undefined) patch.orderIndex = input.order
  if (input.externalUrl !== undefined) patch.externalUrl = input.externalUrl
  await tasksRepo.updateTask(db, orgId, id, patch)
  if (input.assigneeIds) {
    await tasksRepo.replaceAssignees(db, id, input.assigneeIds, now)
  }
  return getTaskForOrg(db, orgId, id, audience)
}

export async function deleteTaskForOrg(db: Db, orgId: string, id: string, audience: Audience) {
  if (audience === 'external') throw AppError.forbidden('External audience cannot delete tasks')
  const existing = await tasksRepo.getTask(db, orgId, id)
  if (!existing) throw AppError.notFound('Task not found')
  await tasksRepo.deleteTask(db, orgId, id)
}

export async function listStagesForOrg(db: Db, orgId: string, boardKey?: string) {
  await ensureDefaultBoard(db, orgId)
  return tasksRepo.listStages(db, orgId, boardKey)
}

export { createLinkForOrg, listLinksForOrg } from './tasks-links'
