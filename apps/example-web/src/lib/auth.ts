import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from './api'

export type KitRole = 'admin' | 'user'

export type MeResponse = {
  subject: string
  authMethod: string
  role: KitRole
  requestId: string
}

export const meQueryKey = ['me'] as const

export function useMe(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => apiFetch<MeResponse>('/api/me'),
    retry: false,
    enabled: opts?.enabled ?? true,
  })
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401
}

export function isAdmin(me: MeResponse | undefined): boolean {
  return me?.role === 'admin'
}
