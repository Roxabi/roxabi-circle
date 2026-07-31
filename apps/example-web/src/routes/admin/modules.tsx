import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@gosilex/ui'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../../lib/api'
import { useLocale } from '../../lib/locale'

/** Matches `platformModulesService.listPlatformPublic` wire shape. */
type PlatformModuleState = {
  available: boolean
  configured: boolean
  configPath: string
}

type PlatformModulesResponse = {
  modules: Record<string, PlatformModuleState>
  requestId: string
}

export function AdminModulesPage() {
  const { m } = useLocale()

  const modules = useQuery({
    queryKey: ['platform-modules'],
    queryFn: () => apiFetch<PlatformModulesResponse>('/api/platform/modules'),
  })

  const entries = Object.entries(modules.data?.modules ?? {})

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
          ) : modules.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-12 text-center">
              <p className="text-sm font-medium text-destructive">{m.loadFailed}</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {apiErrorToMessage(modules.error, m)}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void modules.refetch()}>
                {m.retry}
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.empty}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {entries.map(([moduleId, mod]) => (
                <li
                  key={moduleId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{moduleId}</div>
                    {mod.configPath ? (
                      <div className="truncate text-xs text-muted-foreground">{mod.configPath}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {mod.configured ? null : (
                      <Badge variant="outline" className="text-[10px]">
                        {m.errIntegrationNotConfigured}
                      </Badge>
                    )}
                    <Badge
                      variant={mod.available ? 'secondary' : 'outline'}
                      className="text-[10px]"
                    >
                      {mod.available ? m.moduleOn : m.moduleOff}
                    </Badge>
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
