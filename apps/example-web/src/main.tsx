import { Toaster, TooltipProvider } from '@gosilex/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LocaleProvider } from './lib/locale'
import { ThemeProvider, useTheme } from './lib/theme'
import { routeTree } from './routeTree'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
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
