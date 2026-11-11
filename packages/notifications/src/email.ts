import type { EmailContent } from './types'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function renderNotificationEmail(
  input: Readonly<{
    content: EmailContent
    manageRulesHref: string
    copy: Readonly<{ brand: string; manageRulesLabel: string }>
  }>,
): EmailContent {
  const { content, manageRulesHref, copy } = input
  for (let index = 0; index < manageRulesHref.length; index++) {
    const code = manageRulesHref.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      throw new Error('Invalid rules management URL')
    }
  }

  let url: URL
  try {
    url = new URL(manageRulesHref)
  } catch {
    throw new Error('Invalid rules management URL')
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new Error('Invalid rules management URL')
  }

  const body =
    content.html ?? `<div style="white-space: pre-wrap">${escapeHtml(content.text)}</div>`
  return {
    subject: content.subject,
    text: `${copy.brand}\n\n${content.text}\n\n${copy.manageRulesLabel}: ${manageRulesHref}`,
    html: `<p>${escapeHtml(copy.brand)}</p>${body}<p><a href="${escapeHtml(manageRulesHref)}">${escapeHtml(copy.manageRulesLabel)}</a></p>`,
  }
}
