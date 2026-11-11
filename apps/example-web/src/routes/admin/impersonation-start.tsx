import {
  Button,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage } from '../../lib/api'
import { useMe } from '../../lib/auth'
import { switchImpersonation } from '../../lib/impersonation'
import { useLocale } from '../../lib/locale'

export function ImpersonationStart({ userId }: { userId: string }) {
  const { m } = useLocale()
  const me = useMe()
  const navigate = useNavigate()
  const [organizationId, setOrganizationId] = useState('')
  const [mode, setMode] = useState<'read' | 'write'>('read')
  const permissions = me.data?.impersonationPermissions
  const start = useMutation({
    mutationFn: () =>
      switchImpersonation('start', {
        organizationId,
        subjectUserId: userId,
        mode: permissions?.[mode] ? mode : permissions?.read ? 'read' : 'write',
      }),
    onSuccess: () => void navigate({ to: '/app/tasks' }),
    onError: (error) => toast.error(m.error, { description: apiErrorToMessage(error, m) }),
  })
  if (
    !me.data ||
    me.data.impersonation ||
    me.data.subject === userId ||
    !(permissions?.read || permissions?.write)
  )
    return null
  const effectiveMode = permissions?.[mode] ? mode : permissions?.read ? 'read' : 'write'
  const orgItems = me.data.orgs
    .filter((org) => org.status === 'active')
    .map((org) => ({ value: org.id, label: org.name }))
  const modeItems = [
    ...(permissions?.read ? [{ value: 'read', label: m.impersonationRead }] : []),
    ...(permissions?.write ? [{ value: 'write', label: m.impersonationWrite }] : []),
  ]
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field className="w-auto">
        <FieldLabel htmlFor={`impersonation-org-${userId}`}>
          {m.impersonationOrganization}
        </FieldLabel>
        <Select
          items={orgItems}
          value={organizationId || null}
          onValueChange={(value) => setOrganizationId(value ?? '')}
        >
          <SelectTrigger id={`impersonation-org-${userId}`} className="min-w-40">
            <SelectValue placeholder={m.impersonationSelectOrganization} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {orgItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor={`impersonation-mode-${userId}`}>{m.impersonationMode}</FieldLabel>
        <Select
          items={modeItems}
          value={effectiveMode}
          onValueChange={(value) => setMode(value === 'write' ? 'write' : 'read')}
        >
          <SelectTrigger id={`impersonation-mode-${userId}`} className="min-w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {modeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!organizationId || start.isPending}
        onClick={() => start.mutate()}
      >
        {m.impersonationStart}
      </Button>
    </div>
  )
}
