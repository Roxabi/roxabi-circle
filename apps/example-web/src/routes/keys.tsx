import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@gosilex/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'

type KeyMeta = {
  id: string
  subject: string
  createdAt: number
  revokedAt: number | null
}

/** Plaintext sk_ is shown once then auto-cleared. */
const PLAINTEXT_TTL_MS = 60_000

export function KeysPage() {
  const { m } = useLocale()
  const qc = useQueryClient()
  const [minted, setMinted] = useState<{ id: string; key: string } | null>(null)

  const keys = useQuery({
    queryKey: ['keys'],
    queryFn: () => apiFetch<{ keys: KeyMeta[] }>('/api/keys'),
  })

  useEffect(() => {
    if (!minted) return
    const t = window.setTimeout(() => setMinted(null), PLAINTEXT_TTL_MS)
    return () => window.clearTimeout(t)
  }, [minted])

  const mint = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; key: string }>('/api/keys', { method: 'POST', body: '{}' }),
    onSuccess: async (data) => {
      setMinted(data)
      toast.success(m.keyMinted)
      await qc.invalidateQueries({ queryKey: ['keys'] })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(m.keyRevoked)
      await qc.invalidateQueries({ queryKey: ['keys'] })
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const copy = async () => {
    if (!minted?.key) return
    try {
      await navigator.clipboard.writeText(minted.key)
      toast.success(m.copied)
      // Clear plaintext from UI after successful copy
      setMinted(null)
    } catch (e) {
      toast.error(m.error, { description: apiErrorToMessage(e, m) })
    }
  }

  const activeKeys = (keys.data?.keys ?? []).filter((k) => k.revokedAt == null)

  return (
    <div>
      <PageHeader title={m.keys} description={m.keysDesc} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" />
              {m.mintKey}
            </CardTitle>
            <CardDescription>{m.mintKeyDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => mint.mutate()} disabled={mint.isPending}>
              {m.mintKey}
            </Button>
            {minted ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {m.keyOnce}
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={minted.key} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={m.copyKey}
                    onClick={() => void copy()}
                  >
                    <Copy />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">id: {minted.id}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium">{m.keysList}</p>
              {keys.isLoading ? (
                <p className="text-xs text-muted-foreground">{m.loading}</p>
              ) : keys.isError ? (
                <p className="text-xs text-destructive">{m.loadFailed}</p>
              ) : activeKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">{m.emptyKeys}</p>
              ) : (
                <ul className="space-y-2">
                  {activeKeys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
                    >
                      <span className="truncate font-mono">{k.id.slice(0, 8)}…</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.revokeKey}
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (!window.confirm(m.confirmRevoke)) return
                          revoke.mutate(k.id)
                        }}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.bearerTitle}</CardTitle>
            <CardDescription>{m.bearerDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{m.bearerHelp}</p>
            <p>{m.bearerSessionNote}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
