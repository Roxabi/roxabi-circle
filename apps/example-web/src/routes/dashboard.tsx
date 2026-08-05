import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kit/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Activity, FileText, KeyRound, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'

export function DashboardPage() {
  const { m } = useLocale()
  const me = useMe()

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: boolean; service?: string; requestId: string }>('/health'),
  })

  const notes = useQuery({
    queryKey: ['notes'],
    queryFn: () => apiFetch<{ notes: { id: string }[] }>('/api/notes'),
  })

  const sendEmail = useMutation({
    mutationFn: () => apiFetch('/api/demo/email', { method: 'POST', body: '{}' }),
    onSuccess: () => toast.success(m.emailSent),
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  return (
    <div>
      <PageHeader title={m.dashboard} description={m.appSubtitle} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="size-4" />
              {m.health}
            </CardDescription>
            <CardTitle className="text-xl">
              {health.isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : health.data?.ok ? (
                <Badge variant="secondary">{m.online}</Badge>
              ) : (
                <Badge variant="destructive">{m.offline}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {health.data?.requestId ?? '—'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="size-4" />
              {m.notes}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {notes.isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                (notes.data?.notes.length ?? 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/app/notes" className="text-sm font-medium text-primary hover:underline">
              {m.navNotes} →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{m.session}</CardDescription>
            <CardTitle className="truncate text-base font-medium">
              {me.data?.subject ?? '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {m.authMethod}: {me.data?.authMethod ?? '—'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Mail className="size-4" />
              {m.email}
            </CardDescription>
            <CardTitle className="text-base font-medium">{m.mailpit}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="outline"
              disabled={sendEmail.isPending}
              onClick={() => sendEmail.mutate()}
            >
              {m.sendEmail}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.navKeys}</CardTitle>
            <CardDescription>{m.keysDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/app/keys" />} variant="secondary">
              <KeyRound className="size-4" />
              {m.mintKey}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.settings}</CardTitle>
            <CardDescription>{m.settingsDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/app/settings" />} variant="outline">
              {m.navSettings}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
