/**
 * OpenAPI plumbing for the example-api contract.
 *
 * Request schemas ARE the validators (`OpenAPIHono` + `createRoute`), so
 * request shapes cannot drift from what the app accepts. `security`, the
 * per-route status set, and response descriptions are hand-declared metadata
 * the snapshot gate cannot falsify — they must match middleware and thrown
 * `AppError` statuses. This module owns the shared pieces: error-body parity
 * with `toApiErrorBody`, reusable error responses, and security schemes.
 */

import { z } from '@hono/zod-openapi'
import { SESSION_COOKIE } from '@kit/auth'
import { AppError, zodFieldErrors } from '@kit/core'
import { ErrorCode, type ErrorCodeName } from '@kit/types'

/** Mirrors `ApiErrorBody` — the single error envelope every route returns. */
const apiErrorBodySchema = z
  .object({
    error: z.object({
      code: z.enum(Object.values(ErrorCode) as [ErrorCodeName, ...ErrorCodeName[]]),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    requestId: z.string(),
  })
  .openapi('ApiError')

/** One error response entry, ready to spread into `createRoute({ responses })`. */
export function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: apiErrorBodySchema } },
  }
}

/** 401/403 are on every authenticated route; 400 wherever a schema validates input. */
export const authErrorResponses = {
  401: errorResponse('Missing or invalid session / API key'),
  403: errorResponse('Authenticated but not permitted (role, module, or org scope)'),
} as const

export const validationErrorResponse = {
  400: errorResponse('Validation failed — `details.fieldErrors` carries per-field messages'),
} as const

export const notFoundErrorResponse = {
  404: errorResponse('Not found, or not visible to this org'),
} as const

/** 429 from `assertRateLimit`; error-handler sets `Retry-After` (CORS-exposed). */
export const rateLimitErrorResponse = {
  429: errorResponse('Rate limited — `Retry-After` is set in seconds'),
} as const

/**
 * Org isolation is enforced by `requireOrgContext()` from the `{orgId}` path
 * param, or `X-Org-Id` when the path has no org id. Path/header mismatch → 403.
 * The header is documented here only — it is NOT a request schema field, so a
 * missing header is not turned into a schema 400.
 */
export const orgIsolationDescription =
  "Org isolation: `{orgId}` path param (preferred) or `X-Org-Id` header, enforced by requireOrgContext. Mismatch → 403. Header is not a request schema field so missing/optional headers keep today's validation behaviour."

/**
 * Validation hook with the exact `parseOrThrow` semantics: `AppError.fieldErrors`
 * so the response body stays `{ error: { code: VALIDATION_ERROR, details:
 * { fieldErrors } }, requestId }`. Pass the same message the route used before.
 *
 * Returns `undefined` (never `void`): the `Hook` contract accepts a response or
 * `undefined`, and a `void` return breaks route generic inference.
 */
export function invalidRequest(message: string) {
  return (result: { success: boolean; error?: unknown }): undefined => {
    if (!result.success) {
      throw AppError.fieldErrors(
        message,
        zodFieldErrors(result.error as { flatten: () => { fieldErrors: unknown } }),
      )
    }
  }
}

/** Default hook for routes that never customised the message. */
export const defaultHook = invalidRequest('Invalid request body')

/**
 * Security requirement lists. Typed explicitly: an inline `[{ session: [] }]`
 * infers `never[]`, which does not satisfy `SecurityRequirementObject[]` and
 * silently collapses `createRoute` generic inference (`c.req.valid()` → never).
 */
export const sessionOrKeySecurity: Array<Record<string, string[]>> = [
  { session: [] },
  { apiKey: [] },
]

/** Routes behind `requireSession`: `sk_` keys are rejected with 403. */
export const sessionOnlySecurity: Array<Record<string, string[]>> = [{ session: [] }]

export const securitySchemes = {
  session: {
    type: 'apiKey' as const,
    in: 'cookie' as const,
    name: SESSION_COOKIE,
    description:
      'Kit logical cookie name (`kit_session`); browsers may receive `__Secure-kit_session` when Secure cookies are on; `SESSION_COOKIE_NAME` overrides are product-local and are not this snapshot.',
  },
  apiKey: {
    type: 'http' as const,
    scheme: 'bearer' as const,
    description: 'Organization-bound `sk_` API key. Session-only routes reject it with 403.',
  },
}

export const openApiInfo = {
  openapi: '3.1.0',
  info: {
    title: 'Kit example-api',
    version: '0.1.0',
    description:
      'HTTP contract shared by the SPA, MCP tools and skills. Generated from the running Hono app — see docs/kit/api-contract.md.',
  },
}
