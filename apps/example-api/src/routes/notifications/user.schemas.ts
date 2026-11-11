import { z } from '@hono/zod-openapi'
import { rowIdSchema } from './shared.schemas'

export const userRuleParamsSchema = z.strictObject({ ruleId: rowIdSchema })
