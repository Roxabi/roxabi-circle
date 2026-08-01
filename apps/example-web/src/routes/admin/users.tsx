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
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../../lib/api'
import { useLocale } from '../../lib/locale'

type AdminUser = {
  id: string
  email: string
  name: string
  platformRole: string | null
  createdAt: string
}

type OrgRow = {
  id: string
  name: string
  slug: string
}

export function AdminUsersPage() {
  const { m } = useLocale()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [platformRole, setPlatformRole] = useState<'' | 'staff' | 'super_admin'>('')
  const [orgId, setOrgId] = useState('')
  const [orgRole, setOrgRole] = useState('member')
  const [sendEmail, setSendEmail] = useState(true)

  const users = useQuery({
    queryKey: ['admin-users', q],
    queryFn: () =>
      apiFetch<{ users: AdminUser[] }>(
        `/api/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      ),
  })

  const orgs = useQuery({
    queryKey: ['orgs'],
    queryFn: () => apiFetch<{ orgs: OrgRow[] }>('/api/orgs'),
  })

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          platformRole: platformRole || null,
          memberships:
            orgId.trim().length > 0 ? [{ orgId: orgId.trim(), role: orgRole }] : undefined,
          sendEmail,
        }),
      }),
    onSuccess: async () => {
      toast.success(m.adminUserCreated)
      setEmail('')
      setName('')
      setPlatformRole('')
      setOrgId('')
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e) => {
      toast.error(m.error, { description: apiErrorToMessage(e, m) })
    },
  })

  const resend = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/resend-welcome`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => toast.success(m.adminUserWelcomeResent),
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title={m.navUsers} description={m.adminUsersDesc} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.adminUserCreateTitle}</CardTitle>
          <CardDescription>{m.adminUserCreateDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) create.mutate()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-email">{m.email}</Label>
              <Input
                id="admin-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-name">{m.adminUserName}</Label>
              <Input
                id="admin-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-plane">{m.adminUserPlane}</Label>
              <select
                id="admin-user-plane"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={platformRole}
                onChange={(e) => setPlatformRole(e.target.value as '' | 'staff' | 'super_admin')}
                aria-label={m.adminUserPlane}
              >
                <option value="">{m.adminUserPlaneClient}</option>
                <option value="staff">staff</option>
                <option value="super_admin">super_admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-org">{m.adminUserOrg}</Label>
              <select
                id="admin-user-org"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                aria-label={m.adminUserOrg}
              >
                <option value="">{m.adminUserOrgNone}</option>
                {(orgs.data?.orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </option>
                ))}
              </select>
            </div>
            {orgId ? (
              <div className="space-y-1.5">
                <Label htmlFor="admin-user-role">{m.inviteRole}</Label>
                <select
                  id="admin-user-role"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={orgRole}
                  onChange={(e) => setOrgRole(e.target.value)}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                  <option value="reader">reader</option>
                </select>
              </div>
            ) : null}
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="admin-user-send"
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="size-4 rounded border"
              />
              <Label htmlFor="admin-user-send">{m.adminUserSendEmail}</Label>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={create.isPending || !email.trim()}>
                {m.adminUserSubmit}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{m.navUsers}</CardTitle>
            <CardDescription>
              {users.isLoading ? m.loading : `${users.data?.users.length ?? 0} user(s)`}
            </CardDescription>
          </div>
          <Input
            className="max-w-xs"
            placeholder={m.adminUserSearch}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={m.adminUserSearch}
          />
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : users.isError ? (
            <p className="text-sm text-destructive">{apiErrorToMessage(users.error, m)}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(users.data?.users ?? []).map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.platformRole ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {u.platformRole}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        client
                      </Badge>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(u.id)}
                    >
                      {m.adminUserResend}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
