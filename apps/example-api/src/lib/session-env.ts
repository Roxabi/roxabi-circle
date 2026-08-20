/**
 * Env-typed re-exports of `@kit/auth` session/BA helpers (dogfood call sites).
 * Keep kit names: do not alias `sessionCookieNameFromEnv` as `sessionCookieName`
 * (collides with `@kit/auth` `sessionCookieName({ name })`).
 */
export {
  allowPublicSignup,
  assertBetterAuthConfigured,
  assertTrustedOrigins,
  corsAllowlist,
  environmentName,
  getBetterAuthSecret,
  getSessionSecret,
  isDevLikeEnvironment,
  sessionCookieNameFromEnv,
  useSecureCookie,
} from '@kit/auth'
