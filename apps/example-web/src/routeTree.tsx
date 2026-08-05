import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { AuthGate, PlatformGate } from './components/auth-gates'
import { EnvBanner } from './components/env-banner'
import { RouteErrorComponent } from './components/route-error'
import { apiFetch } from './lib/api'
import {
  defaultHomePath,
  isPlatformActor,
  isUnauthorized,
  type MeResponse,
  meQueryKey,
} from './lib/auth'
import { AdminHomePage } from './routes/admin/home'
import { AdminModulesPage } from './routes/admin/modules'
import { AdminOrgsPage } from './routes/admin/orgs'
import { AdminUsersPage } from './routes/admin/users'
import { ChangelogPage } from './routes/changelog'
import { DashboardPage } from './routes/dashboard'
import { DesignSystemPage } from './routes/design-system'
import { ForgotPasswordPage } from './routes/forgot-password'
import { InviteAcceptPage } from './routes/invite-accept'
import { ItemsPage } from './routes/items'
import { KeysPage } from './routes/keys'
import { LoginPage } from './routes/login'
import { NotesPage } from './routes/notes'
import { OrgMembersPage } from './routes/org-members'
import { ResetPasswordPage } from './routes/reset-password'
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
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    if (typeof search.next === 'string' && search.next.length > 0) {
      return { next: search.next }
    }
    return {}
  },
  component: LoginPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
  component: ResetPasswordPage,
})

const inviteAcceptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/accept',
  validateSearch: (search: Record<string, unknown>) => ({
    invitationId: typeof search.invitationId === 'string' ? search.invitationId : undefined,
  }),
  component: InviteAcceptPage,
})

/** Authenticated layout without shell — used for `/` redirect only. */
const authedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: async ({ context }) => {
    try {
      await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) {
        throw redirect({ to: '/login' })
      }
    }
  },
  component: () => <Outlet />,
})

/** Index: platform → /admin, else /app */
const indexRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    let me: MeResponse
    try {
      me = await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) throw redirect({ to: '/login' })
      throw e
    }
    throw redirect({ to: defaultHomePath(me) })
  },
  component: () => null,
})

// ── Client shell `/app/*` ──────────────────────────────────────────
// TanStack Router: path routes get an id from `path` — do not set both `id` + `path`.
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  beforeLoad: async ({ context }) => {
    try {
      await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) {
        throw redirect({ to: '/login' })
      }
    }
  },
  component: () => (
    <AuthGate mode="app">
      <Outlet />
    </AuthGate>
  ),
})

const appIndexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: DashboardPage,
})

const appNotesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'notes',
  component: NotesPage,
})

const appItemsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'items',
  component: ItemsPage,
})

const appKeysRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'keys',
  component: KeysPage,
})

const appChangelogRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'changelog',
  component: ChangelogPage,
})

const appSettingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'settings',
  component: SettingsPage,
})

const appOrgMembersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'orgs/$orgId/members',
  component: OrgMembersPage,
})

// ── Back-office shell `/admin/*` ───────────────────────────────────
const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  beforeLoad: async ({ context }) => {
    let me: MeResponse
    try {
      me = await ensureMe(context.queryClient)
    } catch (e) {
      if (isUnauthorized(e)) throw redirect({ to: '/login' })
      throw e
    }
    if (!isPlatformActor(me)) {
      throw redirect({ to: '/app' })
    }
  },
  component: () => (
    <AuthGate mode="admin">
      <PlatformGate>
        <Outlet />
      </PlatformGate>
    </AuthGate>
  ),
})

const adminIndexRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/',
  component: AdminHomePage,
})

const adminOrgsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'orgs',
  component: AdminOrgsPage,
})

const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'users',
  component: AdminUsersPage,
})

const adminModulesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'modules',
  component: AdminModulesPage,
})

const adminDesignSystemRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'design-system',
  component: DesignSystemPage,
})

// ── Legacy redirects ───────────────────────────────────────────────
function legacyRedirect(from: string, to: string) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: from,
    beforeLoad: () => {
      throw redirect({ to })
    },
    component: () => null,
  })
}

const legacyNotes = legacyRedirect('/notes', '/app/notes')
const legacyKeys = legacyRedirect('/keys', '/app/keys')
const legacySettings = legacyRedirect('/settings', '/app/settings')
const legacyDesignSystem = legacyRedirect('/design-system', '/admin/design-system')

export const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  inviteAcceptRoute,
  authedLayoutRoute.addChildren([indexRoute]),
  appLayoutRoute.addChildren([
    appIndexRoute,
    appNotesRoute,
    appItemsRoute,
    appKeysRoute,
    appSettingsRoute,
    appChangelogRoute,
    appOrgMembersRoute,
  ]),
  adminLayoutRoute.addChildren([
    adminIndexRoute,
    adminOrgsRoute,
    adminUsersRoute,
    adminModulesRoute,
    adminDesignSystemRoute,
  ]),
  legacyNotes,
  legacyKeys,
  legacySettings,
  legacyDesignSystem,
])
