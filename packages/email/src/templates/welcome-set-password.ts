/**
 * Kit welcome / first-login set-password email (string-rendered). No product-domain copy.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function WelcomeSetPasswordEmail(props: {
  to: string
  setPasswordUrl: string
  expiresHint?: string
  name?: string
}) {
  const safeUrl = escapeHtml(props.setPasswordUrl)
  const scrub = (s: string) => s.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')
  const who = props.name?.trim() ? scrub(props.name.trim()) : 'there'
  const subject = 'Welcome — set your password — Kit kit'
  const exp = props.expiresHint ? scrub(props.expiresHint) : 'about 1 hour'
  const text = [
    `Hi ${who},`,
    'An account was created for you on Kit Kit.',
    `Set your password: ${props.setPasswordUrl}`,
    `This link expires in ${exp}.`,
    'If you did not expect this email, ignore it.',
  ].join('\n')
  const html = `<p>Hi ${escapeHtml(who)},</p><p>An account was created for you on <strong>Kit Kit</strong>.</p><p><a href="${safeUrl}">Set your password</a></p><p>This link expires in ${escapeHtml(exp)}.</p><p>If you did not expect this email, ignore it.</p>`
  return { to: props.to, subject, text, html }
}
