import { z } from '@hono/zod-openapi'
import { notificationPageQuerySchema, orgParamsSchema, rowIdSchema } from './shared.schemas'

export const inboxQuerySchema = notificationPageQuerySchema.extend({
  filter: z.enum(['all', 'unread']).optional(),
})
export const inboxIdParamsSchema = orgParamsSchema.extend({ notificationId: rowIdSchema })
export const unreadCountResponseSchema = z.strictObject({
  unreadCount: z.number().int().nonnegative(),
  requestId: z.string(),
})
export const readAllResponseSchema = z.strictObject({
  ok: z.literal(true),
  updated: z.number().int().nonnegative(),
  requestId: z.string(),
})
