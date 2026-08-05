/**
 * Kit magic-link sign-in email (string-rendered). No product-domain copy.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function MagicLinkEmail(props: { to: string; magicUrl: string; expiresHint?: string }) {
  const safeUrl = escapeHtml(props.magicUrl)
  const subject = 'Sign in — Kit kit'
  const exp = props.expiresHint ? props.expiresHint.replace(/[\r\n]/g, '') : 'about 5 minutes'
  const text = [
    'You requested a sign-in link for Kit Kit.',
    `Sign-in link: ${props.magicUrl}`,
    `This link expires in ${exp}.`,
    'If you did not request this, ignore this email.',
  ].join('\n')
  const html = `<p>You requested a sign-in link for <strong>Kit Kit</strong>.</p><p><a href="${safeUrl}">Sign in</a></p><p>This link expires in ${escapeHtml(exp)}.</p><p>If you did not request this, ignore this email.</p>`
  return { to: props.to, subject, text, html }
}
