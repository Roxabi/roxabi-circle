import { z } from '@hono/zod-openapi'

/** `inv_` + UUID hex without dashes — matches `newInviteId()`. */
const INVITATION_ID_RE = /^inv_[0-9a-f]{32}$/

export const invitationIdSchema = z.string().regex(INVITATION_ID_RE, 'Invalid invitation id')
