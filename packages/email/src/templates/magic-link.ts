/**
 * Kit magic-link sign-in email (string-rendered). No product-domain copy.
 * Header scrub is at EmailPort boundary (scrubHeaderLine).
 */
import { escapeHtml } from '../escape-html'
import { assertSafeTokenHref, type TokenHrefPolicy } from '../safe-token-href'

export function MagicLinkEmail(
  props: { to: string; magicUrl: string; expiresHint?: string } & TokenHrefPolicy,
) {
  const href = assertSafeTokenHref(props.magicUrl, props)
  const safeUrl = escapeHtml(href)
  const subject = 'Sign in — Kit kit'
  const exp = props.expiresHint ?? 'about 5 minutes'
  const text = [
    'You requested a sign-in link for Kit Kit.',
    `Sign-in link: ${href}`,
    `This link expires in ${exp}.`,
    'If you did not request this, ignore this email.',
  ].join('\n')
  const html = `<p>You requested a sign-in link for <strong>Kit Kit</strong>.</p><p><a href="${safeUrl}">Sign in</a></p><p>This link expires in ${escapeHtml(exp)}.</p><p>If you did not request this, ignore this email.</p>`
  return { to: props.to, subject, text, html }
}
