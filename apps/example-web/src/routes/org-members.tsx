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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { orgRoleLabel } from '../lib/org-role'

type Member = { id: string; userId: string; role: string; createdAt?: string | number | Date }
type Invitation = {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string | null
}
type ModuleAccess = 'write' | 'read' | 'disabled'
type OrgRoleRow = {
  id: string
  key: string
  name: string
  isSystem: boolean
  grants: Array<{ moduleId: string; access: ModuleAccess }>
}

const ACCESS_ITEMS = [
  { value: 'write', label: 'write' },
  { value: 'read', label: 'read' },
  { value: 'disabled', label: 'disabled' },
] as const

export function OrgMembersPage() {
  const { m } = useLocale()
  const me = useMe()
  const qc = useQueryClient()
  const { orgId } = useParams({ strict: false }) as { orgId: string }
  const canManage = canManageMembers(me.data, orgId)
  const org = me.data?.orgs?.find((o) => o.id === orgId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'reader'>('member')
  const [newRoleKey, setNewRoleKey] = useState('')
  const [newRoleName, setNewRoleName] = useState('')

  const roleItems = (
    [
      ...(org?.role === 'owner'
        ? ([{ value: 'admin' as const, label: m.roleAdmin }] as const)
        : []),
      { value: 'member' as const, label: m.roleMember },
      { value: 'reader' as const, label: m.roleReader },
    ] as const
  ).map((r) => ({ value: r.value, label: r.label }))

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

  const roles = useQuery({
    queryKey: ['org-roles', orgId],
    queryFn: () => apiFetch<{ roles: OrgRoleRow[] }>(`/api/orgs/${orgId}/roles`),
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

  const createRole = useMutation({
    mutationFn: () =>
      apiFetch(`/api/orgs/${orgId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ key: newRoleKey.trim(), name: newRoleName.trim() }),
      }),
    onSuccess: async () => {
      toast.success(m.roleCreated)
      setNewRoleKey('')
      setNewRoleName('')
      await qc.invalidateQueries({ queryKey: ['org-roles', orgId] })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const patchGrant = useMutation({
    mutationFn: (input: { roleId: string; moduleId: string; access: ModuleAccess }) =>
      apiFetch(`/api/orgs/${orgId}/roles/${input.roleId}/grants/${input.moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ access: input.access }),
      }),
    onSuccess: async () => {
      toast.success(m.grantUpdated)
      await qc.invalidateQueries({ queryKey: ['org-roles', orgId] })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const deleteRole = useMutation({
    mutationFn: (roleId: string) =>
      apiFetch(`/api/orgs/${orgId}/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(m.roleDeleted)
      await qc.invalidateQueries({ queryKey: ['org-roles', orgId] })
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
                <Select
                  items={roleItems}
                  value={role}
                  onValueChange={(v) => {
                    if (v === 'admin' || v === 'member' || v === 'reader') setRole(v)
                  }}
                >
                  <SelectTrigger
                    id="invite-role"
                    className="w-full min-w-28"
                    aria-label={m.inviteRole}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roleItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
            ) : invitations.isError ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-8 text-center">
                <p className="text-sm font-medium text-destructive">{m.loadFailed}</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {apiErrorToMessage(invitations.error, m)}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void invitations.refetch()}>
                  {m.retry}
                </Button>
              </div>
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
                        {orgRoleLabel(inv.role, m)}
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
            ) : members.isError ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-8 text-center">
                <p className="text-sm font-medium text-destructive">{m.loadFailed}</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {apiErrorToMessage(members.error, m)}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void members.refetch()}>
                  {m.retry}
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {members.data?.members.map((mem) => (
                  <li
                    key={mem.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs">{mem.userId}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {orgRoleLabel(mem.role, m)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.orgRolesTitle}</CardTitle>
            <CardDescription>{m.orgRolesDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="role-key">{m.orgRoleKey}</Label>
                <Input
                  id="role-key"
                  value={newRoleKey}
                  onChange={(e) => setNewRoleKey(e.target.value)}
                  placeholder="lead"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role-name">{m.orgRoleName}</Label>
                <Input
                  id="role-name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Lead"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                disabled={createRole.isPending || !newRoleKey.trim() || !newRoleName.trim()}
                onClick={() => createRole.mutate()}
              >
                {m.orgRoleCreate}
              </Button>
            </div>

            {roles.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : roles.isError ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-8 text-center">
                <p className="text-sm font-medium text-destructive">{m.loadFailed}</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {apiErrorToMessage(roles.error, m)}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void roles.refetch()}>
                  {m.retry}
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {(roles.data?.roles ?? []).map((r) => (
                  <li key={r.id} className="space-y-2 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.key}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.isSystem ? (
                          <Badge variant="outline" className="text-[10px]">
                            {m.orgRoleSystem}
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={deleteRole.isPending}
                            onClick={() => deleteRole.mutate(r.id)}
                          >
                            {m.delete}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(r.grants.length > 0
                        ? r.grants
                        : [{ moduleId: 'feedback', access: 'read' as const }]
                      ).map((g) => {
                        const accessItems = ACCESS_ITEMS.map((a) => ({
                          value: a.value,
                          label: a.label,
                        }))
                        return (
                          <div
                            key={`${r.id}-${g.moduleId}`}
                            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1"
                          >
                            <span className="font-mono text-[11px]">{g.moduleId}</span>
                            <Select
                              items={accessItems}
                              value={g.access}
                              onValueChange={(v) => {
                                if (v === 'write' || v === 'read' || v === 'disabled') {
                                  patchGrant.mutate({
                                    roleId: r.id,
                                    moduleId: g.moduleId,
                                    access: v,
                                  })
                                }
                              }}
                              disabled={r.isSystem || patchGrant.isPending}
                            >
                              <SelectTrigger
                                className="h-7 w-[6.5rem] text-xs"
                                aria-label={`${g.moduleId} access`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {ACCESS_ITEMS.map((a) => (
                                    <SelectItem key={a.value} value={a.value}>
                                      {a.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>
                        )
                      })}
                    </div>
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
