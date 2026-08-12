/**
 * Kit org-invite email (string-rendered). No product-domain copy.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function InviteEmail(props: {
  to: string
  orgName: string
  acceptUrl: string
  expiresAt: Date
  inviterLabel?: string
}) {
  // Strip all Unicode line terminators (CR/LF/NEL/LS/PS) — header injection via subject
  const scrub = (s: string) => s.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')
  const org = scrub(props.orgName)
  const safeOrg = escapeHtml(org)
  const safeUrl = escapeHtml(props.acceptUrl)
  const exp = props.expiresAt.toISOString()
  const inviter = props.inviterLabel ? scrub(props.inviterLabel) : undefined
  const subject = `Invitation — ${org} (Kit kit)`
  const text = [
    `You have been invited to join "${org}" on Kit Kit.`,
    inviter ? `Invited by: ${inviter}` : null,
    `Accept: ${props.acceptUrl}`,
    `Expires: ${exp}`,
  ]
    .filter(Boolean)
    .join('\n')
  const html = `<p>You have been invited to join <strong>${safeOrg}</strong> on Kit Kit.</p>${
    inviter ? `<p>Invited by: ${escapeHtml(inviter)}</p>` : ''
  }<p><a href="${safeUrl}">Accept invitation</a></p><p>Expires: ${escapeHtml(exp)}</p>`
  return { to: props.to, subject, text, html }
}
