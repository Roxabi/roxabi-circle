/**
 * Kit password-reset email (string-rendered). No product-domain copy.
 * Header scrub is at EmailPort boundary (scrubHeaderLine).
 */
import { escapeHtml } from '../escape-html'
import { assertSafeTokenHref, type TokenHrefPolicy } from '../safe-token-href'

export function ResetPasswordEmail(
  props: { to: string; resetUrl: string; expiresHint?: string } & TokenHrefPolicy,
) {
  const href = assertSafeTokenHref(props.resetUrl, props)
  const safeUrl = escapeHtml(href)
  const subject = 'Reset your password — Kit kit'
  const exp = props.expiresHint ?? 'about 1 hour'
  const text = [
    'You requested a password reset for Kit Kit.',
    `Reset link: ${href}`,
    `This link expires in ${exp}.`,
    'If you did not request this, ignore this email.',
  ].join('\n')
  const html = `<p>You requested a password reset for <strong>Kit Kit</strong>.</p><p><a href="${safeUrl}">Reset password</a></p><p>This link expires in ${escapeHtml(exp)}.</p><p>If you did not request this, ignore this email.</p>`
  return { to: props.to, subject, text, html }
}
