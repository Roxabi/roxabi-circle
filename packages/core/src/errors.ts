import type { ApiErrorBody, ErrorCodeName } from '@kit/types'
import { ErrorCode } from '@kit/types'

const CODE_STATUS: Record<ErrorCodeName, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  RATE_LIMITED: 429,
  INTEGRATION_NOT_CONFIGURED: 400,
}

export class AppError extends Error {
  readonly code: ErrorCodeName
  readonly status: number
  readonly details?: unknown

  constructor(code: ErrorCodeName, message: string, status?: number, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status ?? CODE_STATUS[code] ?? 500
    this.details = details
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message)
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message)
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message)
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, undefined, details)
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.CONFLICT, message, undefined, details)
  }

  static internal(message = 'Internal error'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message)
  }

  static rateLimited(
    message = 'Too many requests',
    details?: { retryAfterSeconds?: number },
  ): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, message, undefined, details)
  }

  static integrationNotConfigured(
    message = 'Integration is not configured',
    details?: { configPath?: string; moduleId?: string },
  ): AppError {
    return new AppError(ErrorCode.INTEGRATION_NOT_CONFIGURED, message, undefined, details)
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
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal error',
      },
      requestId,
    },
  }
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}
