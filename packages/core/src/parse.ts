import { AppError } from './errors'

/** Minimal Zod-like schema surface (version-agnostic across monorepo packages). */
export type ParseableSchema<T> = {
  safeParse: (
    data: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { flatten: () => { fieldErrors: unknown } } }
}

/**
 * Parse unknown input with Zod; throw AppError.validation on failure.
 * Shared route helper — replaces duplicated safeParse + flatten ceremony.
 */
export function parseOrThrow<T>(
  schema: ParseableSchema<T>,
  data: unknown,
  message = 'Invalid request body',
): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw AppError.validation(message, {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }
  return parsed.data
}
