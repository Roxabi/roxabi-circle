/**
 * React Email-style demo template (string-rendered for local kit).
 * Swap to @react-email/components when wiring Resend/CF Email Service.
 * Subject header scrub is at EmailPort boundary (scrubHeaderLine).
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
    subject: `Kit kit demo (${props.subjectId})`,
    html: `<p>Hello from <strong>@kit/email</strong> demo template.</p><p>Subject: ${safeId}</p>`,
    text: 'Hello from @kit/email demo template.',
  }
}
