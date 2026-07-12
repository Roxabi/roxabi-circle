import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { AdminGate, AuthGate } from './components/app-shell'
import { DashboardPage } from './routes/dashboard'
import { DesignSystemPage } from './routes/design-system'
import { KeysPage } from './routes/keys'
import { LoginPage } from './routes/login'
import { NotesPage } from './routes/notes'
import { SettingsPage } from './routes/settings'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
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

const designSystemRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/design-system',
  component: () => (
    <AdminGate>
      <DesignSystemPage />
    </AdminGate>
  ),
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([indexRoute, notesRoute, keysRoute, settingsRoute, designSystemRoute]),
])
