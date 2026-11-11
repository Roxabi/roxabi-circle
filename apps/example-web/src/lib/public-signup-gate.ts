import type { QueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'
import { type HealthResponse, healthQueryKey, isPublicSignupEnabled } from './health'

export function optionalNextSearch(search: Record<string, unknown>): { next?: string } {
  if (typeof search.next === 'string' && search.next.length > 0) {
    return { next: search.next }
  }
  return {}
}

/** Fail-closed: health down or flag off → no public sign-up. BA env remains the API gate. */
export async function isPublicSignupAllowed(queryClient: QueryClient): Promise<boolean> {
  try {
    const health = await queryClient.fetchQuery({
      queryKey: healthQueryKey,
      queryFn: () => apiFetch<HealthResponse>('/health'),
      staleTime: 0,
    })
    return isPublicSignupEnabled(health)
  } catch {
    return false
  }
}
