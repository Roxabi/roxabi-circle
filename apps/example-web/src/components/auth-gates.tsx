import { Button, Skeleton } from '@kit/ui'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { isPlatformActor, isUnauthorized, type MeResponse, useMe } from '../lib/auth'
import { useImpersonationRecovery } from '../lib/impersonation'
import { useLocale } from '../lib/locale'
import { OrgProvider } from '../lib/org-context'
import { AppShell, type ShellMode } from './app-shell'
import { ImpersonationBanner } from './impersonation-banner'

/** BO gate: platform staff | super_admin only. */
export function PlatformGate({ children }: { children: ReactNode }) {
  const me = useMe()
  const navigate = useNavigate()
  const { m } = useLocale()
  const delegated = Boolean(me.data?.impersonation)
  const forbidden = !(me.isLoading || isPlatformActor(me.data))

  useEffect(() => {
    if (delegated) {
      void navigate({ to: '/app/tasks', replace: true })
    } else if (forbidden) {
      toast.error(m.forbiddenPlatform, { description: m.forbiddenPlatformDesc })
      void navigate({ to: '/app' })
    }
  }, [delegated, forbidden, navigate, m.forbiddenPlatform, m.forbiddenPlatformDesc])

  if (me.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{m.loading}</p>
      </div>
    )
  }

  if (delegated) return null

  if (forbidden) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold">{m.forbiddenPlatform}</p>
        <p className="text-sm text-muted-foreground">{m.forbiddenPlatformDesc}</p>
      </div>
    )
  }

  return children
}

function useDelegationRedirect(active: boolean, pathname: string) {
  const navigate = useNavigate()
  useEffect(() => {
    if (active && (pathname === '/app' || pathname === '/app/')) {
      void navigate({ to: '/app/tasks', replace: true })
    }
  }, [active, pathname, navigate])
}

function AuthLoadError({ delegated, retry }: { delegated: boolean; retry: () => void }) {
  const { m } = useLocale()
  const navigate = useNavigate()
  return (
    <>
      {delegated ? <ImpersonationBanner recovery /> : null}
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-semibold">{m.error}</p>
        <p className="text-sm text-muted-foreground">{m.loadFailed}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={retry}>
            {m.retry}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigate({ to: '/login' })}
          >
            {m.login}
          </Button>
        </div>
      </div>
    </>
  )
}

function AuthenticatedShell({
  me,
  pathname,
  mode,
  children,
}: {
  me: MeResponse
  pathname: string
  mode: ShellMode
  children: ReactNode
}) {
  const { m } = useLocale()
  if (me.impersonation && !me.impersonation.active) {
    return <ImpersonationBanner recovery />
  }
  const allowedDelegatedPath = pathname === '/app/tasks' || pathname === '/app/tasks/'
  const content =
    me.impersonation && !allowedDelegatedPath ? (
      <p role="alert">{m.impersonationRestricted}</p>
    ) : (
      children
    )
  return (
    <OrgProvider me={me}>
      <AppShell mode={mode}>{content}</AppShell>
    </OrgProvider>
  )
}

export function AuthGate({ children, mode = 'app' }: { children: ReactNode; mode?: ShellMode }) {
  const me = useMe()
  const recovery = useImpersonationRecovery()
  const navigate = useNavigate()
  const { m } = useLocale()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const unauth =
    !(recovery || me.isLoading) && (isUnauthorized(me.error) || !(me.isError || me.data))
  const hardError = !me.isLoading && me.isError && !isUnauthorized(me.error)

  useEffect(() => {
    if (unauth) {
      void navigate({ to: '/login' })
    }
  }, [unauth, navigate])

  useDelegationRedirect(Boolean(!recovery && me.data?.impersonation?.active), pathname)

  if (recovery) {
    return <ImpersonationBanner recovery />
  }

  if (me.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="w-full max-w-sm flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <p className="text-center text-sm text-muted-foreground">{m.loading}</p>
        </div>
      </div>
    )
  }

  if (hardError) {
    return (
      <AuthLoadError delegated={Boolean(me.data?.impersonation)} retry={() => void me.refetch()} />
    )
  }

  if (unauth || !me.data) {
    return null
  }

  return (
    <AuthenticatedShell me={me.data} pathname={pathname} mode={mode}>
      {children}
    </AuthenticatedShell>
  )
}
