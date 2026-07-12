import { Toaster, TooltipProvider } from '@gosilex/ui'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { ApiError, apiErrorToMessage } from './lib/api'
import { meQueryKey } from './lib/auth'
import { LocaleProvider } from './lib/locale'
import { ThemeProvider, useTheme } from './lib/theme'
import { routeTree } from './routeTree'
import './index.css'

function clearSessionQueries(client: QueryClient) {
  client.removeQueries({ queryKey: meQueryKey })
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionQueries(queryClient)
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionQueries(queryClient)
      }
      // Skip toast when mutation already defines onError (avoids double toasts).
      if (mutation.options.onError) return
      toast.error(apiErrorToMessage(error))
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
          <TooltipProvider>
            <RouterProvider router={router} />
            <ThemedToaster />
          </TooltipProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
