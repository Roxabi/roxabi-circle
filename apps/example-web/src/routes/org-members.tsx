import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from '@gosilex/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { canManageMembers, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'

type Member = { id: string; userId: string; role: string; createdAt?: string | number | Date }
type Invitation = {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string | null
}

export function OrgMembersPage() {
  const { m } = useLocale()
  const me = useMe()
  const qc = useQueryClient()
  const { orgId } = useParams({ strict: false }) as { orgId: string }
  const canManage = canManageMembers(me.data, orgId)
  const org = me.data?.orgs?.find((o) => o.id === orgId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'reader'>('member')

  const members = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => apiFetch<{ members: Member[] }>(`/api/orgs/${orgId}/members`),
    enabled: Boolean(orgId) && canManage,
  })

  const invitations = useQuery({
    queryKey: ['org-invitations', orgId],
    queryFn: () => apiFetch<{ invitations: Invitation[] }>(`/api/orgs/${orgId}/invitations`),
    enabled: Boolean(orgId) && canManage,
  })

  const invite = useMutation({
    mutationFn: () =>
      apiFetch(`/api/orgs/${orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      }),
    onSuccess: async () => {
      toast.success(m.inviteSent)
      setEmail('')
      await qc.invalidateQueries({ queryKey: ['org-invitations', orgId] })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const cancel = useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch(`/api/orgs/${orgId}/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(m.inviteCanceled)
      await qc.invalidateQueries({ queryKey: ['org-invitations', orgId] })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  if (!canManage) {
    return (
      <div>
        <PageHeader title={m.navMembers} description={m.forbiddenDesc} />
        <p className="text-sm text-muted-foreground">{m.inviteNoPermission}</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={m.navMembers} description={org ? `${org.name} · ${org.slug}` : orgId} />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.inviteTitle}</CardTitle>
            <CardDescription>{m.inviteDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="invite-email">{m.email}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-role">{m.inviteRole}</Label>
                <select
                  id="invite-role"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  {org?.role === 'owner' ? <option value="admin">admin</option> : null}
                  <option value="member">member</option>
                  <option value="reader">reader</option>
                </select>
              </div>
              <Button
                type="button"
                disabled={invite.isPending || !email.trim()}
                onClick={() => invite.mutate()}
              >
                {m.inviteSubmit}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.invitePending}</CardTitle>
          </CardHeader>
          <CardContent>
            {invitations.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : invitations.data?.invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.inviteEmpty}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {invitations.data?.invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{inv.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {inv.role}
                        {inv.expiresAt
                          ? ` · exp ${new Date(inv.expiresAt).toLocaleDateString()}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {inv.status}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(inv.id)}
                      >
                        {m.inviteCancel}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.membersList}</CardTitle>
          </CardHeader>
          <CardContent>
            {members.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {members.data?.members.map((mem) => (
                  <li
                    key={mem.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs">{mem.userId}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {mem.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
