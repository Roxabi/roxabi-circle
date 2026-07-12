export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  /** Required outside development (min 32 chars). */
  SESSION_SECRET?: string
  /** development | test | production — defaults to development for local wrangler. */
  ENVIRONMENT?: string
  /** Comma-separated allowlist. Default: localhost Vite origins. */
  CORS_ORIGINS?: string
  DEMO_USER_EMAIL?: string
  /** SMTP host for demo email (Mailpit: localhost) */
  SMTP_HOST?: string
  SMTP_PORT?: string
}
