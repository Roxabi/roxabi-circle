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
import { PageHeader } from '../../components/app-shell'
import { apiFetch } from '../../lib/api'
import { useLocale } from '../../lib/locale'

type PlatformModule = {
  moduleId: string
  available: boolean
  label?: string
}

export function AdminModulesPage() {
  const { m } = useLocale()

  const modules = useQuery({
    queryKey: ['platform-modules'],
    queryFn: () => apiFetch<{ modules: PlatformModule[] }>('/api/platform/modules'),
  })

  return (
    <div>
      <PageHeader title={m.navModules} description={m.shellAdminSubtitle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.navModules}</CardTitle>
          <CardDescription>{m.modulesDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {modules.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : modules.data?.modules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.empty}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {modules.data?.modules.map((mod) => (
                <li
                  key={mod.moduleId}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{mod.moduleId}</span>
                  <Badge variant={mod.available ? 'secondary' : 'outline'} className="text-[10px]">
                    {mod.available ? m.moduleOn : m.moduleOff}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
