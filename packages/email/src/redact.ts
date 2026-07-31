/**
 * Redact secrets from email log bodies (reset/invite URLs).
 * Does not alter delivery content — only log transport output.
 */

/** Query param values that must never appear in logs. */
const SECRET_QUERY = /([?&](?:token|invitationId|code|key)=)[^&\s"'<>]+/gi

/** BA reset path segment: /reset-password/<token> */
const RESET_PATH = /(\/api\/auth\/reset-password\/)[A-Za-z0-9_-]{8,}/g

/** Invite accept with id already covered by query; also bare long tokens. */
const LONG_TOKEN = /\b[A-Za-z0-9_-]{20,}\b/g

export function redactEmailBody(text: string): string {
  let out = text
  out = out.replace(SECRET_QUERY, '$1[REDACTED]')
  out = out.replace(RESET_PATH, '$1[REDACTED]')
  // Soft second pass: only on lines that look like URLs (avoid mangling normal words)
  out = out
    .split('\n')
    .map((line) => {
      if (!/https?:\/\//i.test(line) && !/token=/i.test(line)) return line
      return line.replace(LONG_TOKEN, (m) => (m.length >= 20 ? '[REDACTED]' : m))
    })
    .join('\n')
  return out
}
