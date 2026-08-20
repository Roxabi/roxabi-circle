/**
 * Env-typed re-exports of `@kit/auth` session/BA helpers (dogfood call sites).
 */
export {
  allowPublicSignup,
  assertBetterAuthConfigured,
  corsAllowlist,
  environmentName,
  getBetterAuthSecret,
  getSessionSecret as getSecret,
  isDevLikeEnvironment,
  sessionCookieNameFromEnv as sessionCookieName,
  useSecureCookie,
} from '@kit/auth'
