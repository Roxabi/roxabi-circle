export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  SESSION_SECRET?: string
  DEMO_USER_EMAIL?: string
  /** SMTP host for demo email (Mailpit: localhost) */
  SMTP_HOST?: string
  SMTP_PORT?: string
}
