/** `inv_` + UUID hex without dashes — matches API `newInviteId()`. */
const INVITATION_ID_RE = /^inv_[0-9a-f]{32}$/

export function parseInvitationId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return INVITATION_ID_RE.test(id) ? id : null
}
