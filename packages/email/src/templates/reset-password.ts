/**
 * Kit password-reset email (string-rendered). No product-domain copy.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function ResetPasswordEmail(props: { to: string; resetUrl: string; expiresHint?: string }) {
  const safeUrl = escapeHtml(props.resetUrl)
  const subject = 'Reset your password — Kit kit'
  const exp = props.expiresHint
    ? props.expiresHint.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')
    : 'about 1 hour'
  const text = [
    'You requested a password reset for Kit Kit.',
    `Reset link: ${props.resetUrl}`,
    `This link expires in ${exp}.`,
    'If you did not request this, ignore this email.',
  ].join('\n')
  const html = `<p>You requested a password reset for <strong>Kit Kit</strong>.</p><p><a href="${safeUrl}">Reset password</a></p><p>This link expires in ${escapeHtml(exp)}.</p><p>If you did not request this, ignore this email.</p>`
  return { to: props.to, subject, text, html }
}
