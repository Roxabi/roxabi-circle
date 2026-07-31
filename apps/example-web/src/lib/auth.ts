import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from './api'

export type KitRole = 'admin' | 'user'

export type PlatformRole = 'super_admin' | 'staff'

export type MeOrg = {
  id: string
  name: string
  slug: string
  kind: 'client' | 'internal'
  status: 'active' | 'suspended' | 'archived'
  role: 'owner' | 'admin' | 'member' | 'reader'
}

export type MeResponse = {
  subject: string
  email?: string
  authMethod: string
  /** @deprecated kit demo KitRole — do not use for BO gates */
  role: KitRole
  platformRole: PlatformRole | null
  orgs: MeOrg[]
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

/** @deprecated Prefer hasPlatformRole for BO. Kept for kit-demo KitRole surfaces if any. */
export function isAdmin(me: MeResponse | undefined): boolean {
  return me?.role === 'admin'
}

export function hasPlatformRole(me: MeResponse | undefined, ...roles: PlatformRole[]): boolean {
  if (!me?.platformRole) return false
  if (roles.length === 0) return true
  return roles.includes(me.platformRole)
}

/** True when user has staff or super_admin platform role. */
export function isPlatformActor(me: MeResponse | undefined): boolean {
  return hasPlatformRole(me, 'staff', 'super_admin')
}

/** Client-only: no platform role (may still have org memberships). */
export function isClientOnly(me: MeResponse | undefined): boolean {
  return Boolean(me) && !isPlatformActor(me)
}

/** Default post-login home: BO for platform actors, client app otherwise. */
export function defaultHomePath(me: MeResponse | undefined): '/admin' | '/app' {
  return isPlatformActor(me) ? '/admin' : '/app'
}
