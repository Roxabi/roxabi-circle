import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@kit/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Boxes, Building2, Palette } from 'lucide-react'
import { PageHeader } from '../../components/app-shell'
import { apiFetch } from '../../lib/api'
import { useMe } from '../../lib/auth'
import { useLocale } from '../../lib/locale'

export function AdminHomePage() {
  const { m } = useLocale()
  const me = useMe()

  const orgs = useQuery({
    queryKey: ['orgs'],
    queryFn: () => apiFetch<{ orgs: { id: string; name: string; slug: string }[] }>('/api/orgs'),
  })

  return (
    <div>
      <PageHeader title={m.navAdmin} description={m.shellAdminSubtitle} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Building2 className="size-4" />
              {m.navOrgs}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {orgs.isLoading ? <Skeleton className="h-9 w-12" /> : (orgs.data?.orgs.length ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/admin/orgs" className="text-sm font-medium text-primary hover:underline">
              {m.navOrgs} →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Boxes className="size-4" />
              {m.navModules}
            </CardDescription>
            <CardTitle className="text-base font-medium">{m.navPlatform}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/admin/modules" className="text-sm font-medium text-primary hover:underline">
              {m.navModules} →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Palette className="size-4" />
              {m.navDesignSystem}
            </CardDescription>
            <CardTitle className="text-base font-medium">
              {me.data?.platformRole ? (
                <Badge variant="outline">{me.data.platformRole}</Badge>
              ) : (
                '—'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/admin/design-system"
              className="text-sm font-medium text-primary hover:underline"
            >
              {m.navDesignSystem} →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{m.account}</CardTitle>
          <CardDescription>{m.session}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <div>
            {m.email}: {me.data?.email ?? '—'}
          </div>
          <div>
            {m.me}: <span className="font-mono text-xs">{me.data?.subject}</span>
          </div>
          <div>platformRole: {me.data?.platformRole ?? 'null'}</div>
          <div>
            {m.authMethod}: {me.data?.authMethod ?? '—'}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
