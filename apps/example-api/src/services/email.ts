import { buildDemoEmailText, sendLog } from '@gosilex/email'
import type { Env } from '../env'

/**
 * Demo email send on the Worker path — **log transport only** (edge-safe).
 * SMTP (Mailpit) lives in `@gosilex/email/server` for Node CLI/scripts, not this bundle.
 */
export async function sendDemoEmail(
  env: Env,
  subjectId: string,
): Promise<{ ok: boolean; transport: string; to: string }> {
  const to = env.DEMO_USER_EMAIL || 'demo@gosilex.local'
  const tmpl = buildDemoEmailText({ to, subjectId })
  sendLog({ to: tmpl.to, subject: tmpl.subject, text: tmpl.text })
  return { ok: true, transport: 'log', to: tmpl.to }
}
