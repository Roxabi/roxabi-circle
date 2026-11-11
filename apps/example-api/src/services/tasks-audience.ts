import type { Audience } from '@kit/tasks'

export function resolveAudience(input: {
  orgRole?: string | null
  platformRole?: string | null
}): Audience {
  // reader ≈ external portal principal for dogfood IDOR matrix
  if (input.orgRole === 'reader') return 'external'
  return 'staff'
}
