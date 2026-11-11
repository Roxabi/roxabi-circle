import { canInviteRole, isOrgRoleKey } from '@kit/auth'
import {
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
} from '@kit/ui'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage } from '../lib/api'
import { useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { useInviteMember, useOrgRoles } from '../lib/org-members'
import { orgRoleLabel } from '../lib/org-role'
import { inviteMemberSchema } from '../lib/schemas'

function buildAssignableRoleItems(args: {
  actor: string
  roles: { key: string; name: string }[] | undefined
  m: ReturnType<typeof useLocale>['m']
  roleNameByKey: Map<string, string>
}): Array<{ value: string; label: string }> {
  const assignable = (key: string): boolean => {
    if (key === 'owner') return false
    if (isOrgRoleKey(key)) return canInviteRole(args.actor, key)
    return args.actor === 'owner' || args.actor === 'admin'
  }
  const fromApi = (args.roles ?? [])
    .filter((r) => assignable(r.key))
    .map((r) => ({
      value: r.key,
      label: orgRoleLabel(r.key, args.m, args.roleNameByKey),
    }))
  if (fromApi.length > 0) return fromApi
  const items: Array<{ value: string; label: string }> = []
  if (canInviteRole(args.actor, 'admin')) items.push({ value: 'admin', label: args.m.roleAdmin })
  if (canInviteRole(args.actor, 'member')) items.push({ value: 'member', label: args.m.roleMember })
  if (canInviteRole(args.actor, 'reader')) items.push({ value: 'reader', label: args.m.roleReader })
  return items
}

export function OrgMembersInviteCard({
  orgId,
  roleNameByKey,
}: {
  orgId: string
  roleNameByKey: Map<string, string>
}) {
  const { m } = useLocale()
  const me = useMe()
  const org = me.data?.orgs?.find((o) => o.id === orgId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const roles = useOrgRoles(orgId, true)
  const invite = useInviteMember(orgId)
  const inviterRole = org?.role ?? ''
  const roleItems = useMemo(
    () =>
      buildAssignableRoleItems({
        actor: inviterRole,
        roles: roles.data?.roles,
        m,
        roleNameByKey,
      }),
    [roles.data?.roles, inviterRole, m, roleNameByKey],
  )
  useEffect(() => {
    if (roleItems.length === 0) return
    if (!roleItems.some((i) => i.value === role)) {
      setRole(roleItems[0]!.value)
    }
  }, [roleItems, role])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.inviteTitle}</CardTitle>
        <CardDescription>{m.inviteDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            const parsed = inviteMemberSchema.safeParse({ email, role })
            if (!parsed.success) {
              toast.error(m.error, {
                description: parsed.error.flatten().fieldErrors.email?.[0]
                  ? m.errEmailInvalid
                  : m.errValidation,
              })
              return
            }
            invite.mutate(parsed.data, {
              onSuccess: () => {
                toast.success(m.inviteSent)
                setEmail('')
              },
              onError: (err) => toast.error(m.error, { description: apiErrorToMessage(err, m) }),
            })
          }}
        >
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
                if (typeof v === 'string' && v) setRole(v)
              }}
            >
              <SelectTrigger id="invite-role" className="w-full min-w-28" aria-label={m.inviteRole}>
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
          <Button type="submit" disabled={invite.isPending || !email.trim()}>
            {m.inviteSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
