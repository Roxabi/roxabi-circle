/**
 * SPA password forms — import `@kit/auth/react`, never `@kit/auth` root or `/factory`.
 * Worker bundles must not import this entry (React + `@kit/ui`).
 */

export {
  AUTH_CHANGE_PASSWORD_PATH,
  AUTH_REQUEST_PASSWORD_RESET_PATH,
  AUTH_RESET_PASSWORD_PATH,
  type ChangePasswordValues,
  changePasswordSchema,
  type ForgotPasswordValues,
  forgotPasswordSchema,
  type ResetPasswordValues,
  resetPasswordSchema,
} from '../password-schemas'
export {
  type ChangePasswordCopy,
  ChangePasswordForm,
} from './change-password-form'
export {
  type ChangePasswordErrorCopy,
  changePasswordErrorMessage,
  isRateLimited,
  resolveAuthFormStatus,
} from './errors'
export {
  type ForgotPasswordCopy,
  ForgotPasswordForm,
} from './forgot-password-form'
export type { AuthFormFetch, AuthFormNotify } from './notify'
export { silentNotify } from './notify'
export {
  type ResetPasswordCopy,
  ResetPasswordForm,
} from './reset-password-form'
