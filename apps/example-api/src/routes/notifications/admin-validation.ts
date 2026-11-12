import { z } from '@hono/zod-openapi'
import { AppError, decodeListCursor } from '@kit/core'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../types'
import { epochMsSchema, rowIdSchema } from './shared.schemas'

const cursorSchema = z.strictObject({ createdAt: epochMsSchema, id: rowIdSchema })
export function validateAdminCursor(cursor?: string): void {
  if (cursor === undefined) return
  const value = decodeListCursor(cursor)
  const keys = Object.keys(value)
  if (
    keys.length !== 2 ||
    keys.some((key) => key !== 'createdAt' && key !== 'id') ||
    !cursorSchema.safeParse(value).success
  )
    throw AppError.validation('Invalid cursor')
}

export function strictAdminQuery(allowed: readonly string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const seen = new Set<string>()
    for (const key of new URL(c.req.url).searchParams.keys()) {
      if (!allowed.includes(key) || seen.has(key)) throw AppError.validation('Invalid query')
      seen.add(key)
    }
    await next()
  }
}

function hasUnknownKeys(value: unknown, allowed: readonly string[]): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).some((key) => !allowed.includes(key))
  )
}
export const strictAdminBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  let body: unknown
  try {
    body = await c.req.raw.clone().json()
  } catch {
    throw AppError.validation('Invalid request body')
  }
  if (hasUnknownKeys(body, ['selector', 'channel', 'enabled', 'locked']))
    throw AppError.validation('Invalid request body')
  if (
    body !== null &&
    typeof body === 'object' &&
    'selector' in body &&
    hasUnknownKeys(body.selector, ['kind', 'value'])
  )
    throw AppError.validation('Invalid request body')
  await next()
}
