import type { FieldErrors } from '@kit/types'
import { AppError } from './errors'

/** Minimal Zod-like schema surface (version-agnostic across monorepo packages). */
export type ParseableSchema<T> = {
  safeParse: (
    data: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { flatten: () => { fieldErrors: unknown } } }
}

/** Map Zod (or compatible) `flatten().fieldErrors` into the kit FieldErrors contract. */
export function zodFieldErrors(error: { flatten: () => { fieldErrors: unknown } }): FieldErrors {
  return error.flatten().fieldErrors as FieldErrors
}

/**
 * Parse unknown input with Zod; throw AppError.fieldErrors on failure.
 * Shared route helper — replaces duplicated safeParse + flatten ceremony.
 */
export function parseOrThrow<T>(
  schema: ParseableSchema<T>,
  data: unknown,
  message = 'Invalid request body',
): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw AppError.fieldErrors(message, zodFieldErrors(parsed.error))
  }
  return parsed.data
}
