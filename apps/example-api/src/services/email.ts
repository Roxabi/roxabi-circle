import { buildDemoEmailText } from '@gosilex/email'
import { sendLog, sendSmtp } from '@gosilex/email/server'
import type { Env } from '../env'

/**
 * Demo email send. Prefer Node/SMTP (Mailpit); fall back to structured log.
 * SMTP path lives in `@gosilex/email/server` (not edge-safe barrel).
 */
export async function sendDemoEmail(
  env: Env,
  subjectId: string,
): Promise<{ ok: boolean; transport: string; to: string }> {
  const to = env.DEMO_USER_EMAIL || 'demo@gosilex.local'
  const host = env.SMTP_HOST || '127.0.0.1'
  const port = Number(env.SMTP_PORT || '1025')
  const tmpl = buildDemoEmailText({ to, subjectId })

  const smtp = await sendSmtp({
    host,
    port,
    from: 'kit@gosilex.local',
    to: tmpl.to,
    subject: tmpl.subject,
    text: tmpl.text,
  })
  if (smtp.ok) {
    return { ok: true, transport: 'smtp', to: tmpl.to }
  }

  console.error(
    JSON.stringify({
      level: 'warn',
      msg: 'smtp_failed_fallback_log',
      error: smtp.error,
    }),
  )
  sendLog({ to: tmpl.to, subject: tmpl.subject, text: tmpl.text })
  return { ok: true, transport: 'log', to: tmpl.to }
}
