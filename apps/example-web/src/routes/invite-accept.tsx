import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gosilex/ui'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { isUnauthorized, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'

function inviteLoginNext(invitationId: string): string {
  return `/invite/accept?invitationId=${encodeURIComponent(invitationId)}`
}

export function InviteAcceptPage() {
  const { m } = useLocale()
  const navigate = useNavigate()
  const me = useMe()
  const search = useSearch({ strict: false }) as { invitationId?: string }
  const invitationId = search.invitationId?.trim() ?? ''
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (me.isLoading || !invitationId) return
    if (isUnauthorized(me.error) || (!me.data && !me.isError)) {
      void navigate({
        to: '/login',
        search: { next: inviteLoginNext(invitationId) },
      })
    }
  }, [me.isLoading, me.error, me.data, me.isError, navigate, invitationId])

  const accept = useMutation({
    mutationFn: () =>
      apiFetch<{ org: { name: string }; membership: { role: string } }>(
        `/api/invitations/${invitationId}/accept`,
        { method: 'POST', body: '{}' },
      ),
    onSuccess: async (data) => {
      setDone(true)
      toast.success(m.inviteAccepted, { description: data.org.name })
      await navigate({ to: '/app' })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  if (!invitationId) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{m.inviteAcceptTitle}</CardTitle>
            <CardDescription>{m.inviteAcceptMissing}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/app" />}>{m.navAppHome}</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (me.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
        {m.loading}
      </div>
    )
  }

  if (me.isError && !isUnauthorized(me.error)) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{m.error}</CardTitle>
            <CardDescription>{m.loadFailed}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{apiErrorToMessage(me.error, m)}</p>
            <Button type="button" variant="secondary" onClick={() => void me.refetch()}>
              {m.retry}
            </Button>
            <Button
              type="button"
              variant="outline"
              render={<Link to="/login" search={{ next: inviteLoginNext(invitationId) }} />}
            >
              {m.login}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!me.data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
        {m.loading}
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{m.inviteAcceptTitle}</CardTitle>
          <CardDescription>
            {m.inviteAcceptDesc} · {me.data.email ?? me.data.subject}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button type="button" disabled={accept.isPending || done} onClick={() => accept.mutate()}>
            {m.inviteAcceptSubmit}
          </Button>
          <Button type="button" variant="outline" render={<Link to="/app" />}>
            {m.navAppHome}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
