import { type MeResponse, meResponseSchema, type PlatformRole, parseMe } from '@kit/api-client/me'
import type { QueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, HttpError, invalidatePrincipalGeneration, setImpersonationFence } from './api'
import { safeInviteReturnPath, safeMcpOAuthResumePath } from './safe-return-path'

export {
  type MeOrg,
  type MeResponse,
  meOrgSchema,
  meResponseSchema,
  type PlatformRole,
} from '@kit/api-client/me'

/** Sole /api/me network reader. Optimistic me-cache patches go through writeMeCache. */
let onFenceChange: (() => void) | undefined
let beforeMeRead: (signal?: AbortSignal) => Promise<() => void> = async (signal) => () => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

export function setMeReadBarrier(barrier: (signal?: AbortSignal) => Promise<() => void>): void {
  beforeMeRead = barrier
}

export function setFenceChangeHandler(handler: () => void): void {
  onFenceChange = handler
}

export async function fetchMe(context?: { signal: AbortSignal }): Promise<MeResponse> {
  const signal = context?.signal
  const assertCurrent = await beforeMeRead(signal)
  assertCurrent()
  try {
    const me = await apiFetch<MeResponse>('/api/me', { parse: parseMe, signal })
    assertCurrent()
    if (setImpersonationFence(me.impersonation?.id ?? null)) onFenceChange?.()
    return me
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      assertCurrent()
      setImpersonationFence(null)
    }
    throw error
  }
}

export const meQueryKey = ['me'] as const

/**
 * Sole me-cache writer besides fetchMe. Re-parses the full MeResponse so
 * ensureQueryData cannot serve an unvalidated optimistic patch to route gates.
 */
export function writeMeCache(
  queryClient: QueryClient,
  updater: (prev: MeResponse) => unknown,
): void {
  queryClient.setQueryData<MeResponse>(meQueryKey, (prev) => {
    if (!prev) return prev
    return parseMe(updater(prev))
  })
}

export async function ensureMe(queryClient: QueryClient): Promise<MeResponse> {
  const data = await queryClient.ensureQueryData({
    queryKey: meQueryKey,
    queryFn: fetchMe,
  })
  const parsed = meResponseSchema.safeParse(data)
  if (parsed.success) return parsed.data
  queryClient.removeQueries({ queryKey: meQueryKey })
  return queryClient.fetchQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
  })
}

export function useMe(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    retry: false,
    enabled: opts?.enabled ?? true,
    select: parseMe,
  })
}

/**
 * Drop every cached query when the principal changes.
 * Sign-in, sign-up, sign-out, and a protected 401 all call this — nothing else.
 */
export function dropPrincipalCache(qc: QueryClient): void {
  invalidatePrincipalGeneration()
  qc.clear()
}

/**
 * A 401 on a protected resource means the cached principal is gone.
 * The `me` query's own 401 is anonymous bootstrap — clearing there loops.
 */
export function onSessionUnauthorized(
  qc: QueryClient,
  error: unknown,
  sourceQueryKey?: readonly unknown[],
): void {
  if (!(error instanceof HttpError) || error.status !== 401) return
  if (sourceQueryKey?.[0] === meQueryKey[0]) return
  setImpersonationFence(null)
  dropPrincipalCache(qc)
}

/**
 * BA sign-out then clear client cache.
 * Fail-closed: throws if server revoke fails — callers must not navigate as if signed out.
 * Shared by app-shell + settings (SH3 / anti parallel-path drift).
 */
export async function signOutAndClearSession(qc: QueryClient): Promise<void> {
  await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
  setImpersonationFence(null)
  dropPrincipalCache(qc)
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof HttpError && err.status === 401
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

/** Post sign-in / sign-up navigation: allowlisted invite or MCP OAuth resume, else default home. */
export function postAuthTarget(me: MeResponse, next: string | undefined): string {
  return safeInviteReturnPath(next) ?? safeMcpOAuthResumePath(next) ?? defaultHomePath(me)
}

/** FE convenience — server still enforces manage_members. */
export function canManageMembers(me: MeResponse | undefined, orgId: string): boolean {
  const org = me?.orgs?.find((o) => o.id === orgId)
  if (!org) return false
  return org.role === 'owner' || org.role === 'admin'
}
