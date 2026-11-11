import { Button } from '@kit/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { signOutAndClearSession, useMe } from '../lib/auth'
import {
  clearImpersonationRecovery,
  refreshImpersonation,
  switchImpersonation,
  useImpersonationRecovery,
} from '../lib/impersonation'
import { useLocale } from '../lib/locale'

export function ImpersonationBanner({ recovery = false }: { recovery?: boolean }) {
  const { m } = useLocale()
  const me = useMe().data
  const recoveryInfo = useImpersonationRecovery()
  const info = recoveryInfo ?? me?.impersonation
  const [pending, setPending] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  if (!info) return null

  const stop = async () => {
    setPending(true)
    try {
      await switchImpersonation('stop', { impersonationId: info.id })
    } catch {
      toast.error(m.impersonationStopError)
    } finally {
      setPending(false)
    }
  }
  const logout = async () => {
    try {
      await signOutAndClearSession(qc)
      clearImpersonationRecovery()
      await navigate({ to: '/login' })
    } catch {
      toast.error(m.error, { description: m.errUnauthorized })
    }
  }
  const actor = info.actor.name || info.actor.email || info.actor.id
  const subject = info.subject.name || info.subject.email || info.subject.id
  const org =
    (recoveryInfo ? undefined : me?.orgs.find((item) => item.id === info.organizationId)?.name) ||
    info.organizationId

  return (
    <section
      role="status"
      className="flex flex-wrap items-center gap-3 border-b bg-amber-100 px-4 py-3 text-amber-950"
    >
      <div className="flex-1">
        <strong>{m.impersonationBanner}</strong>{' '}
        <span>
          {m.impersonationActor}: {actor} · {m.impersonationSubject}: {subject} ·{' '}
          {m.impersonationOrganization}: {org} ·{' '}
          {info.mode === 'read' ? m.impersonationReadMode : m.impersonationWriteMode}
        </span>
        {!info.active ? <p>{m.impersonationInactive}</p> : null}
      </div>
      <Button type="button" disabled={pending} onClick={() => void stop()}>
        {pending ? m.impersonationStopping : m.impersonationStop}
      </Button>
      {recoveryInfo ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshImpersonation().catch(() => toast.error(m.loadFailed))}
        >
          {m.retry}
        </Button>
      ) : null}
      {recovery ? (
        <Button type="button" variant="outline" onClick={() => void logout()}>
          {m.logout}
        </Button>
      ) : null}
    </section>
  )
}
