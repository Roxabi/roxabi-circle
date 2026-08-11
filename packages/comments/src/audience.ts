/** Mirror of @kit/tasks Audience — kept local to avoid package cycles. */
export const AUDIENCES = ['staff', 'external'] as const
export type Audience = (typeof AUDIENCES)[number]

export function isAudience(value: unknown): value is Audience {
  return value === 'staff' || value === 'external'
}
