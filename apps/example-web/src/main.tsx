import { ThemeProvider, Toaster, TooltipProvider, useTheme } from '@kit/ui'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { apiErrorToMessage, HttpError } from './lib/api'
import { onSessionUnauthorized } from './lib/auth'
import { defaultLocale, t } from './lib/i18n'
import { configureImpersonation } from './lib/impersonation'
import { LocaleProvider } from './lib/locale'
import { routeTree } from './routeTree'
import './index.css'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      onSessionUnauthorized(queryClient, error, query.queryKey)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      onSessionUnauthorized(queryClient, error)
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
        if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
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
configureImpersonation(queryClient, () => router.invalidate())

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
    <ThemeProvider storageKey="kit.theme">
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
