import { z } from '@hono/zod-openapi'
import { deliveryRefSchema } from '@kit/notifications'
import { listQuerySchema } from '@kit/types'

export const rowIdSchema = deliveryRefSchema.shape.id
export const identitySchema = deliveryRefSchema.shape.orgId
export const epochMsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

// Unlike `$`, the absolute-end assertion cannot stop before a final newline.
// Keeping the complete grammar in one regex also preserves it in OpenAPI.
export const typeKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._-]*(?![\s\S])/)
export const channelKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(?!in_app$)[a-z][a-z0-9._-]*(?![\s\S])/)
const selectorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('all') }),
  z.strictObject({ kind: z.literal('type'), value: typeKeySchema }),
  z.strictObject({ kind: z.literal('category'), value: typeKeySchema }),
])
export const notificationPageQuerySchema = listQuerySchema
  .omit({ q: true })
  .extend({
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict()
export const emptyQuerySchema = z.strictObject({})
export const emptyBodySchema = z.strictObject({})
export const orgParamsSchema = z.strictObject({ orgId: identitySchema })

export const ruleDtoSchema = z
  .strictObject({
    id: rowIdSchema,
    selector: selectorSchema,
    channel: channelKeySchema,
    enabled: z.boolean(),
    locked: z.boolean(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .openapi('NotificationRule')
export const ruleInputSchema = z.strictObject({
  selector: selectorSchema,
  channel: channelKeySchema,
  enabled: z.boolean(),
  locked: z.boolean(),
})
export const userRuleInputSchema = ruleInputSchema.omit({ locked: true })
const ruleSourceSchema = z.discriminatedUnion('level', [
  z.strictObject({ level: z.literal('deployment'), selector: selectorSchema }),
  z.strictObject({ level: z.literal('organization'), selector: selectorSchema }),
  z.strictObject({ level: z.literal('user'), selector: selectorSchema }),
  z.strictObject({ level: z.literal('type-default') }),
])
export const typeDtoSchema = z
  .strictObject({
    type: typeKeySchema,
    category: typeKeySchema,
    moduleId: identitySchema.nullable(),
    channels: z.array(channelKeySchema),
    defaultOn: z.array(channelKeySchema),
    organizationDestinations: z.boolean(),
  })
  .openapi('NotificationType')
export const effectiveRuleDtoSchema = z
  .strictObject({
    type: typeKeySchema,
    channel: channelKeySchema,
    enabled: z.boolean(),
    locked: z.boolean(),
    source: ruleSourceSchema,
    available: z.boolean(),
  })
  .openapi('EffectiveNotificationRule')
export const inboxDtoSchema = z
  .strictObject({
    id: rowIdSchema,
    type: typeKeySchema,
    source: z.strictObject({ kind: z.string().min(1).max(64), id: z.string().min(1).max(1024) }),
    content: z.strictObject({ title: z.string(), body: z.string(), href: z.string() }),
    createdAt: epochMsSchema,
    readAt: epochMsSchema.nullable(),
    resolvedAt: epochMsSchema.nullable(),
  })
  .openapi('InboxNotification')
export const deliveryMetadataSchema = z
  .strictObject({
    id: rowIdSchema,
    targetKind: z.enum(['user', 'organization']),
    userId: identitySchema.nullable(),
    destinationId: rowIdSchema.nullable(),
    type: typeKeySchema,
    channel: channelKeySchema,
    status: z.enum(['pending', 'sent', 'failed', 'skipped']),
    errorCode: z.string().nullable(),
    attemptCount: z.number().int().nonnegative(),
    admissionStatus: z.enum(['pending', 'admitted', 'unknown', 'expired']),
    createdAt: epochMsSchema,
    finishedAt: epochMsSchema.nullable(),
  })
  .openapi('NotificationDeliveryMetadata')
export const deliveryQuerySchema = notificationPageQuerySchema.extend({
  status: deliveryMetadataSchema.shape.status.optional(),
  channel: channelKeySchema.optional(),
  type: typeKeySchema.optional(),
  targetKind: deliveryMetadataSchema.shape.targetKind.optional(),
})
export const okResponseSchema = z.strictObject({ ok: z.literal(true), requestId: z.string() })
export const ruleResponseSchema = z.strictObject({ rule: ruleDtoSchema, requestId: z.string() })

export function pageResponseSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    nextCursor: z.string().max(512).nullable(),
    requestId: z.string(),
  })
}
