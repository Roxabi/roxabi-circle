import { cn } from '@gosilex/ui'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import {
  type HealthResponse,
  healthQueryKey,
  isLocalBannerEnvironment,
  shouldShowEnvBanner,
} from '../lib/health'
import { useLocale } from '../lib/locale'

export function EnvBanner() {
  const { m } = useLocale()
  const { data } = useQuery({
    queryKey: healthQueryKey,
    queryFn: () => apiFetch<HealthResponse>('/health'),
    staleTime: 60_000,
    retry: 1,
  })

  const environment = data?.environment
  if (!shouldShowEnvBanner(environment)) return null

  const isLocal = isLocalBannerEnvironment(environment)
  const label = environment?.toLowerCase() === 'staging' ? m.envBannerStaging : m.envBannerLocal

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'w-full shrink-0 px-4 py-2 text-center text-sm font-medium',
        isLocal
          ? 'bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50'
          : 'bg-orange-600 text-white',
      )}
    >
      <span>{label}</span>
      {isLocal && data?.demoLogin ? (
        <span className="mt-0.5 block text-xs font-normal sm:mt-0 sm:inline sm:ml-2 sm:text-sm">
          {m.envBannerAdmin}:{' '}
          <code className="rounded bg-black/10 px-1 font-mono text-[0.85em] dark:bg-black/20">
            {data.demoLogin.email}
          </code>
          {' · '}
          <code className="rounded bg-black/10 px-1 font-mono text-[0.85em] dark:bg-black/20">
            {data.demoLogin.password}
          </code>
        </span>
      ) : null}
    </div>
  )
}
