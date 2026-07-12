/**
 * React Email-style demo template (string-rendered for local kit).
 * Swap to @react-email/components when wiring Resend/CF Email Service.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function DemoEmail(props: { subjectId: string; to: string }) {
  const safeId = escapeHtml(props.subjectId)
  return {
    to: props.to,
    subject: `GOSILEX kit demo (${props.subjectId.replace(/[\r\n]/g, '')})`,
    html: `<p>Hello from <strong>@gosilex/email</strong> demo template.</p><p>Subject: ${safeId}</p>`,
    text: 'Hello from @gosilex/email demo template.',
  }
}
