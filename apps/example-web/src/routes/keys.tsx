import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@gosilex/ui'
import { useMutation } from '@tanstack/react-query'
import { Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'

export function KeysPage() {
  const { m } = useLocale()
  const [minted, setMinted] = useState<{ id: string; key: string } | null>(null)

  const mint = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; key: string }>('/api/keys', { method: 'POST', body: '{}' }),
    onSuccess: (data) => {
      setMinted(data)
      toast.success(m.keyMinted)
    },
    onError: (e) => toast.error(m.error, { description: String(e) }),
  })

  const copy = async () => {
    if (!minted?.key) return
    await navigator.clipboard.writeText(minted.key)
    toast.success(m.copied)
  }

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
                    onClick={() => void copy()}
                  >
                    <Copy />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">id: {minted.id}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bearer</CardTitle>
            <CardDescription>Authorization: Bearer sk_…</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              MCP tools / machine clients call the same Hono API with an{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">sk_</code> key minted here.
            </p>
            <p>UI sessions stay on HttpOnly cookies — no shared team key.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
