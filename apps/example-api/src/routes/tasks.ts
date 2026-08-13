import { COMMENTS_MODULE_ID } from '@kit/comments'
import { TASKS_MODULE_ID } from '@kit/tasks'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { requireModule, requireOrgContext } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as commentsService from '../services/comments'
import * as tasksService from '../services/tasks'
import type { AppEnv } from '../types'

export const tasksRoutes = new Hono<AppEnv>()

const orgMw = requireOrgContext()
const tasksRead = requireModule(TASKS_MODULE_ID, 'read')
const tasksWrite = requireModule(TASKS_MODULE_ID, 'write')
const commentsRead = requireModule(COMMENTS_MODULE_ID, 'read')
const commentsWrite = requireModule(COMMENTS_MODULE_ID, 'write')

function audienceOf(c: Context<AppEnv>) {
  return tasksService.resolveAudience({
    orgRole: c.get('orgRole'),
    platformRole: c.get('platformRole'),
  })
}

tasksRoutes.use('/api/tasks', requireAuth)
tasksRoutes.use('/api/tasks/*', requireAuth)
tasksRoutes.use('/api/tasks', orgMw)
tasksRoutes.use('/api/tasks/*', orgMw)

tasksRoutes.get('/api/tasks', tasksRead, async (c) => {
  const tasks = await tasksService.listTasksForOrg(c.get('db')!, c.get('orgId')!, audienceOf(c))
  return c.json({ tasks, requestId: c.get('requestId') })
})

tasksRoutes.get('/api/tasks/stages', tasksRead, async (c) => {
  const boardKey = c.req.query('boardKey') ?? undefined
  const stages = await tasksService.listStagesForOrg(c.get('db')!, c.get('orgId')!, boardKey)
  return c.json({ stages, requestId: c.get('requestId') })
})

tasksRoutes.get('/api/tasks/links', tasksRead, async (c) => {
  const links = await tasksService.listLinksForOrg(c.get('db')!, c.get('orgId')!)
  return c.json({ links, requestId: c.get('requestId') })
})

tasksRoutes.post('/api/tasks', tasksWrite, async (c) => {
  const raw = await c.req.json().catch(() => null)
  const task = await tasksService.createTaskForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.get('subject')!,
    audienceOf(c),
    raw,
  )
  return c.json({ task, requestId: c.get('requestId') }, 201)
})

// Static path segments before :id
tasksRoutes.post('/api/tasks/links', tasksWrite, async (c) => {
  const raw = await c.req.json().catch(() => null)
  const link = await tasksService.createLinkForOrg(
    c.get('db')!,
    c.get('orgId')!,
    audienceOf(c),
    raw,
  )
  return c.json({ link, requestId: c.get('requestId') }, 201)
})

tasksRoutes.delete('/api/tasks/comments/:commentId', commentsWrite, async (c) => {
  await commentsService.deleteCommentForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.req.param('commentId'),
    audienceOf(c),
    c.get('subject')!,
  )
  return c.json({ ok: true, requestId: c.get('requestId') })
})

tasksRoutes.get('/api/tasks/:id', tasksRead, async (c) => {
  const task = await tasksService.getTaskForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.req.param('id'),
    audienceOf(c),
  )
  return c.json({ task, requestId: c.get('requestId') })
})

tasksRoutes.patch('/api/tasks/:id', tasksWrite, async (c) => {
  const raw = await c.req.json().catch(() => null)
  const task = await tasksService.updateTaskForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.req.param('id'),
    audienceOf(c),
    raw,
  )
  return c.json({ task, requestId: c.get('requestId') })
})

tasksRoutes.delete('/api/tasks/:id', tasksWrite, async (c) => {
  await tasksService.deleteTaskForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.req.param('id'),
    audienceOf(c),
  )
  return c.json({ ok: true, requestId: c.get('requestId') })
})

tasksRoutes.get('/api/tasks/:id/comments', commentsRead, async (c) => {
  const comments = await commentsService.listCommentsForTarget(
    c.get('db')!,
    c.get('orgId')!,
    'task',
    c.req.param('id'),
    audienceOf(c),
  )
  return c.json({ comments, requestId: c.get('requestId') })
})

tasksRoutes.post('/api/tasks/:id/comments', commentsWrite, async (c) => {
  const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const comment = await commentsService.createCommentForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.get('subject')!,
    audienceOf(c),
    {
      ...(raw ?? {}),
      targetType: 'task',
      targetId: c.req.param('id'),
    },
  )
  return c.json({ comment, requestId: c.get('requestId') }, 201)
})
