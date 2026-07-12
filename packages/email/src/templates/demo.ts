/**
 * React Email-style demo template (string-rendered for local kit).
 * Swap to @react-email/components when wiring Resend/CF Email Service.
 */
export function DemoEmail(props: { subjectId: string; to: string }) {
  return {
    to: props.to,
    subject: `GOSILEX kit demo (${props.subjectId})`,
    html: `<p>Hello from <strong>@gosilex/email</strong> demo template.</p><p>Subject: ${props.subjectId}</p>`,
    text: 'Hello from @gosilex/email demo template.',
  }
}
