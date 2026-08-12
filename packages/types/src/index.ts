/** Generic kit error codes — product domain codes live in apps only. */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTEGRATION_NOT_CONFIGURED: 'INTEGRATION_NOT_CONFIGURED',
} as const

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode]

/** Per-field validation messages (Zod flatten / service checks). */
export type FieldErrors = Record<string, string[] | undefined>

/**
 * Field-level validation details on `VALIDATION_ERROR`.
 * Prefer `AppError.fieldErrors` / `{ fieldErrors }` for form fields.
 * Non-field cases (cursor, size max, issues lists) may use message-only
 * or other structured details — do not force those into FieldErrors.
 */
export type ValidationDetails = { fieldErrors: FieldErrors }

export type ApiErrorBody = {
  error: {
    code: ErrorCodeName
    message: string
    details?: unknown
  }
  requestId: string
}
