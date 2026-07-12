/** Generic kit error codes — product domain codes live in apps only. */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode]

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
}
