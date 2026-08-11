import {
  type Audience,
  canSetCommentVisibility,
  canViewComment,
  createCommentInputSchema,
  filterCommentsForAudience,
} from '@kit/comments'
import { AppError, parseOrThrow } from '@kit/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as commentsRepo from '../repos/comments'
import * as tasksRepo from '../repos/tasks'

type Db = DrizzleD1Database<typeof schema>

export async function listCommentsForTarget(
  db: Db,
  orgId: string,
  targetType: string,
  targetId: string,
  audience: Audience,
) {
  if (targetType === 'task') {
    const task = await tasksRepo.getTask(db, orgId, targetId)
    if (!task) throw AppError.notFound('Task not found')
    // Hide internal task entirely for external (no comment leak)
    if (task.visibility === 'internal' && audience === 'external') {
      throw AppError.notFound('Task not found')
    }
  }
  const rows = await commentsRepo.listByTarget(db, orgId, targetType, targetId)
  return filterCommentsForAudience(
    rows.map((r) => ({
      ...r,
      visibility: r.visibility as 'internal' | 'shared',
    })),
    audience,
  )
}

export async function createCommentForOrg(
  db: Db,
  orgId: string,
  actorId: string,
  audience: Audience,
  raw: unknown,
) {
  const input = parseOrThrow(
    createCommentInputSchema,
    { ...(raw as object), orgId, authorId: actorId },
    'Invalid comment',
  )
  const visibility = input.visibility ?? 'shared'
  if (!canSetCommentVisibility(audience, visibility)) {
    throw AppError.forbidden('Cannot set this visibility')
  }
  if (input.targetType === 'task') {
    const task = await tasksRepo.getTask(db, orgId, input.targetId)
    if (!task) throw AppError.notFound('Task not found')
    if (task.visibility === 'internal' && audience === 'external') {
      throw AppError.notFound('Task not found')
    }
  }
  const now = Date.now()
  const id = crypto.randomUUID()
  await commentsRepo.insertComment(db, {
    id,
    orgId,
    targetType: input.targetType,
    targetId: input.targetId,
    authorId: actorId,
    body: input.body,
    visibility,
    createdAt: now,
    updatedAt: now,
  })
  const row = await commentsRepo.getComment(db, orgId, id)
  return row
}

export async function deleteCommentForOrg(
  db: Db,
  orgId: string,
  id: string,
  audience: Audience,
  actorId: string,
) {
  if (audience === 'external') throw AppError.forbidden()
  const row = await commentsRepo.getComment(db, orgId, id)
  if (!row) throw AppError.notFound('Comment not found')
  if (!canViewComment({ visibility: row.visibility as 'internal' | 'shared' }, audience)) {
    throw AppError.notFound('Comment not found')
  }
  if (row.authorId !== actorId && audience === 'staff') {
    // staff may delete any in dogfood; keep simple
  }
  await commentsRepo.deleteComment(db, orgId, id)
}
