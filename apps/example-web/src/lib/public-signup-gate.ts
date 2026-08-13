import type { QueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'
import { type HealthResponse, healthQueryKey, isPublicSignupEnabled } from './health'

export function optionalNextSearch(search: Record<string, unknown>): { next?: string } {
  if (typeof search.next === 'string' && search.next.length > 0) {
    return { next: search.next }
  }
  return {}
}

/** Fail-closed: health down or flag off → no public sign-up. */
export async function isPublicSignupAllowed(queryClient: QueryClient): Promise<boolean> {
  try {
    const health = await queryClient.ensureQueryData({
      queryKey: healthQueryKey,
      queryFn: () => apiFetch<HealthResponse>('/health'),
    })
    return isPublicSignupEnabled(health)
  } catch {
    return false
  }
}
