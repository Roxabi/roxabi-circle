import { DemoEmail } from './templates/demo'

/** Build a plain-text demo email body (React Email-style template). */
export function buildDemoEmailText(params: { to: string; subjectId: string }): {
  to: string
  subject: string
  text: string
  html: string
} {
  const mail = DemoEmail(params)
  return {
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  }
}

export { DemoEmail } from './templates/demo'

export type EmailTransport = 'smtp' | 'log' | 'resend'
