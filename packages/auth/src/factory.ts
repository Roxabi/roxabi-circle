/**
 * Worker BA factory — import `@kit/auth/factory`, not `@kit/auth`.
 * Root barrel stays free of `better-auth` / `drizzle-orm/d1` (SPA + MCP).
 * SPA password forms: `@kit/auth/react` (never from this Worker entry).
 */
export {
  type AuthEmailPort,
  MAGIC_LINK_EXPIRES_IN_SEC,
  RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC,
  sendMagicLinkMail,
  sendResetPasswordMail,
} from './auth-email'
export {
  type CreateBetterAuthOpts,
  createBetterAuth,
  type KitBetterAuth,
} from './better-auth-factory'
export {
  createFirstSessionAfterHook,
  type FirstSessionHandler,
} from './first-session-hook'
