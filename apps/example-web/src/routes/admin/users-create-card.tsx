import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@kit/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../../lib/api'
import { hasPlatformRole, useMe } from '../../lib/auth'
import { useLocale } from '../../lib/locale'
import { type CreateAdminUserValues, createAdminUserSchema } from '../../lib/schemas'

type OrgRow = { id: string; name: string; slug: string }

function tryParseCreateAdminUser(
  input: {
    email: string
    name: string
    platformRole: '' | 'staff' | 'super_admin'
    orgId: string
    orgRole: string
    canAssignPlatformRole: boolean
  },
  m: ReturnType<typeof useLocale>['m'],
): CreateAdminUserValues | null {
  const orgId = input.orgId.trim()
  const parsed = createAdminUserSchema.safeParse({
    email: input.email,
    name: input.name.trim() || undefined,
    // Never send platformRole from staff UI (server would 403 anyway)
    platformRole: input.canAssignPlatformRole ? input.platformRole || null : null,
    orgId: orgId || undefined,
    orgRole: orgId ? input.orgRole : undefined,
  })
  if (parsed.success) return parsed.data
  toast.error(m.error, {
    description: parsed.error.flatten().fieldErrors.email?.[0]
      ? m.errEmailInvalid
      : m.errValidation,
  })
  return null
}

export function AdminUsersCreateCard() {
  const { m } = useLocale()
  const qc = useQueryClient()
  const me = useMe()
  const canAssignPlatformRole = hasPlatformRole(me.data, 'super_admin')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [platformRole, setPlatformRole] = useState<'' | 'staff' | 'super_admin'>('')
  const [orgId, setOrgId] = useState('')
  const [orgRole, setOrgRole] = useState('member')
  const [sendEmail, setSendEmail] = useState(true)

  const orgs = useQuery({
    queryKey: ['orgs'],
    queryFn: () => apiFetch<{ orgs: OrgRow[] }>('/api/orgs'),
  })

  const create = useMutation({
    mutationFn: (input: CreateAdminUserValues) =>
      apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          name: input.name,
          platformRole: input.platformRole ?? null,
          memberships: input.orgId ? [{ orgId: input.orgId, role: input.orgRole }] : undefined,
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

  return (
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
            const parsed = tryParseCreateAdminUser(
              { email, name, platformRole, orgId, orgRole, canAssignPlatformRole },
              m,
            )
            if (parsed) create.mutate(parsed)
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
          {canAssignPlatformRole ? (
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-plane">{m.adminUserPlane}</Label>
              <select
                id="admin-user-plane"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={platformRole}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || v === 'staff' || v === 'super_admin') setPlatformRole(v)
                }}
                aria-label={m.adminUserPlane}
              >
                <option value="">{m.adminUserPlaneClient}</option>
                <option value="staff">staff</option>
                <option value="super_admin">super_admin</option>
              </select>
            </div>
          ) : null}
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
  )
}
