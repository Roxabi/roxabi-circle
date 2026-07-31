import { buildDemoEmailText } from '@gosilex/email'
import type { Env } from '../env'
import { resolveEmailPort } from '../lib/email-port'

/**
 * Demo email send on the Worker path via EMAIL_TRANSPORT (ADR-0004).
 * SMTP (Mailpit) lives in `@gosilex/email/server` for Node CLI/scripts, not this bundle.
 */
export async function sendDemoEmail(
  env: Env,
  subjectId: string,
): Promise<{ ok: boolean; transport: string; to: string }> {
  const to = env.DEMO_USER_EMAIL || 'demo@gosilex.local'
  const tmpl = buildDemoEmailText({ to, subjectId })
  const port = resolveEmailPort(env)
  const sent = await port.send({
    to: tmpl.to,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  })
  return { ok: sent.ok, transport: sent.transport, to: tmpl.to }
}
