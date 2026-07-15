import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminGate, AuthGate } from './components/app-shell'
import { EnvBanner } from './components/env-banner'
import { RouteErrorComponent } from './components/route-error'
import { apiFetch } from './lib/api'
import { isAdmin, isUnauthorized, type MeResponse, meQueryKey } from './lib/auth'
import { DashboardPage } from './routes/dashboard'
import { DesignSystemPage } from './routes/design-system'
import { ForgotPasswordPage } from './routes/forgot-password'
import { IntegrationFeedbackPage } from './routes/integration-feedback'
import { KeysPage } from './routes/keys'
import { LoginPage } from './routes/login'
import { NotesPage } from './routes/notes'
import { SettingsPage } from './routes/settings'

export type RouterContext = {
  queryClient: QueryClient
}

async function ensureMe(queryClient: QueryClient): Promise<MeResponse> {
  return queryClient.ensureQueryData({
    queryKey: meQueryKey,
    queryFn: () => apiFetch<MeResponse>('/api/me'),
  })
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="flex min-h-svh flex-col">
      <EnvBanner />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  ),
  errorComponent: RouteErrorComponent,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    try {
      await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) {
        throw redirect({ to: '/login' })
      }
      // Hard API errors: enter shell; AuthGate shows loadFailed UI.
    }
  },
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: DashboardPage,
})

const notesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/notes',
  component: NotesPage,
})

const keysRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/keys',
  component: KeysPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: SettingsPage,
})

const integrationFeedbackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings/integrations/feedback',
  beforeLoad: async ({ context }) => {
    let me: MeResponse
    try {
      me = await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) throw redirect({ to: '/login' })
      throw e
    }
    if (!isAdmin(me)) throw redirect({ to: '/settings' })
  },
  component: () => (
    <AdminGate>
      <IntegrationFeedbackPage />
    </AdminGate>
  ),
})

const designSystemRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/design-system',
  beforeLoad: async ({ context }) => {
    let me: MeResponse
    try {
      me = await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) throw redirect({ to: '/login' })
      throw e
    }
    if (!isAdmin(me)) throw redirect({ to: '/' })
  },
  component: () => (
    <AdminGate>
      <DesignSystemPage />
    </AdminGate>
  ),
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotPasswordRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    notesRoute,
    keysRoute,
    settingsRoute,
    integrationFeedbackRoute,
    designSystemRoute,
  ]),
])
