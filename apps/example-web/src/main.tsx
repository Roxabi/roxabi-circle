import { Toaster, TooltipProvider } from '@kit/ui'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { ApiError, apiErrorToMessage } from './lib/api'
import { meQueryKey } from './lib/auth'
import { defaultLocale, t } from './lib/i18n'
import { LocaleProvider } from './lib/locale'
import { ThemeProvider, useTheme } from './lib/theme'
import { routeTree } from './routeTree'
import './index.css'

/**
 * On 401 from a *protected* resource, re-check session — but never
 * `removeQueries(['me'])` while `useMe` is mounted: that drops the query,
 * observers re-fetch immediately → 401 → remove → infinite GET /api/me loop
 * (and can wipe a good session if a late 401 lands after login).
 */
function onSessionUnauthorized(error: unknown, sourceQueryKey?: readonly unknown[]) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  // Anonymous bootstrap: LoginPage / AuthGate already treat me-error as logged-out.
  if (sourceQueryKey?.[0] === meQueryKey[0]) return
  void queryClient.invalidateQueries({ queryKey: meQueryKey })
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      onSessionUnauthorized(error, query.queryKey)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      onSessionUnauthorized(error)
      // Skip toast when mutation already defines onError (avoids double toasts).
      if (mutation.options.onError) return
      // Catalog map for ErrorCode (default locale; local mutation onError usually wins).
      toast.error(apiErrorToMessage(error, t(defaultLocale)))
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false
        }
        return failureCount < 1
      },
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster theme={resolved} richColors closeButton position="bottom-right" />
}

const root = document.getElementById('root')
if (!root) throw new Error('root missing')

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <HotkeysProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
              <ThemedToaster />
            </TooltipProvider>
          </HotkeysProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
