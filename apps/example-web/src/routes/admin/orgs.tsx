import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@gosilex/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PageHeader } from '../../components/app-shell'
import { apiFetch } from '../../lib/api'
import { useLocale } from '../../lib/locale'

type OrgRow = {
  id: string
  name: string
  slug: string
  kind: string
  status: string
  role: string | null
}

export function AdminOrgsPage() {
  const { m } = useLocale()

  const orgs = useQuery({
    queryKey: ['orgs'],
    queryFn: () => apiFetch<{ orgs: OrgRow[] }>('/api/orgs'),
  })

  return (
    <div>
      <PageHeader
        title={m.navOrgs}
        description={`${m.shellAdminSubtitle} · staff = memberships · super = catalogue`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.navOrgs}</CardTitle>
          <CardDescription>
            {orgs.isLoading ? m.loading : `${orgs.data?.orgs.length ?? 0} org(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {orgs.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : orgs.data?.orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.orgPickerEmpty}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {orgs.data?.orgs.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.slug} · {o.kind} · {o.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {o.role ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {o.role}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        catalogue
                      </Badge>
                    )}
                    {o.role ? (
                      <Link to="/app" className="text-xs font-medium text-primary hover:underline">
                        {m.switchToApp} →
                      </Link>
                    ) : null}
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
