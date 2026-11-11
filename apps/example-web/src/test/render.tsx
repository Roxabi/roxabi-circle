import { ThemeProvider, TooltipProvider } from '@kit/ui'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type AnyRoute, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { type RenderOptions, type RenderResult, render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import type { MeResponse } from '../lib/auth'
import { LocaleProvider } from '../lib/locale'
import { OrgProvider } from '../lib/org-context'
import { createTestQueryClient } from './query-client'
import { captureCaughtRenderError } from './runtime-errors'

type ProviderOptions = {
  queryClient?: QueryClient
  me?: MeResponse
}

function AppProviders({ children, queryClient, me }: ProviderOptions & { children: ReactNode }) {
  const content = me === undefined ? children : <OrgProvider me={me}>{children}</OrgProvider>
  return (
    <ThemeProvider storageKey="kit.theme">
      <LocaleProvider>
        <QueryClientProvider client={queryClient ?? createTestQueryClient()}>
          <HotkeysProvider>
            <TooltipProvider>{content}</TooltipProvider>
          </HotkeysProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}

export function renderWithAppProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
): RenderResult {
  const { queryClient = createTestQueryClient(), me, onCaughtError, ...renderOptions } = options
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders queryClient={queryClient} me={me}>
        {children}
      </AppProviders>
    ),
    ...renderOptions,
    onCaughtError: onCaughtError
      ? (error, info) => {
          captureCaughtRenderError(error)
          onCaughtError(error, info)
        }
      : captureCaughtRenderError,
  })
}

export function createTestRouter<TRouteTree extends AnyRoute>(
  routeTree: TRouteTree,
  path: string,
  queryClient = createTestQueryClient(),
) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  })
}
