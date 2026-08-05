import { Button, Skeleton } from '@kit/ui'
import { useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { isPlatformActor, isUnauthorized, type MeResponse, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { OrgProvider } from '../lib/org-context'
import { AppShell, type ShellMode } from './app-shell'
import { FeedbackFab } from './feedback-fab'

/** BO gate: platform staff | super_admin only. */
export function PlatformGate({ children }: { children: ReactNode }) {
  const me = useMe()
  const navigate = useNavigate()
  const { m } = useLocale()
  const forbidden = !me.isLoading && !isPlatformActor(me.data)

  useEffect(() => {
    if (forbidden) {
      toast.error(m.forbiddenPlatform, { description: m.forbiddenPlatformDesc })
      void navigate({ to: '/app' })
    }
  }, [forbidden, navigate, m.forbiddenPlatform, m.forbiddenPlatformDesc])

  if (me.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{m.loading}</p>
      </div>
    )
  }

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

/** @deprecated Use PlatformGate for BO. Alias kept for older imports. */
export function AdminGate({ children }: { children: ReactNode }) {
  return <PlatformGate>{children}</PlatformGate>
}

export function AuthGate({ children, mode = 'app' }: { children: ReactNode; mode?: ShellMode }) {
  const me = useMe()
  const navigate = useNavigate()
  const { m } = useLocale()
  const unauth = !me.isLoading && (isUnauthorized(me.error) || (!me.isError && !me.data))
  const hardError = !me.isLoading && me.isError && !isUnauthorized(me.error)

  useEffect(() => {
    if (unauth) {
      void navigate({ to: '/login' })
    }
  }, [unauth, navigate])

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
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-semibold">{m.error}</p>
        <p className="text-sm text-muted-foreground">{m.loadFailed}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void me.refetch()}>
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
    )
  }

  if (unauth || !me.data) {
    return null
  }

  return (
    <OrgProvider me={me.data as MeResponse}>
      <AppShell mode={mode}>{children}</AppShell>
      <FeedbackFab />
    </OrgProvider>
  )
}
