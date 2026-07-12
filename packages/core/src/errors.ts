import type { ApiErrorBody, ErrorCodeName } from '@gosilex/types'
import { ErrorCode } from '@gosilex/types'

export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401)
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403)
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404)
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details)
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409, details)
  }

  static internal(message = 'Internal error'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500)
  }
}

export function toApiErrorBody(
  err: unknown,
  requestId: string,
): {
  body: ApiErrorBody
  status: number
} {
  if (err instanceof AppError) {
    // Never leak internal/config messages or details on 5xx.
    const publicMessage = err.status >= 500 ? 'Internal error' : err.message
    const details = err.status >= 500 ? undefined : err.details
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: publicMessage,
          ...(details !== undefined ? { details } : {}),
        },
        requestId,
      },
    }
  }

  return {
    status: 500,
    body: {
      error: {
        code: ErrorCode.INTERNAL_ERROR as ErrorCodeName,
        message: 'Internal error',
      },
      requestId,
    },
  }
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}
