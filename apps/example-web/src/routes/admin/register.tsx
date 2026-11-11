import { type AnyRoute, createRoute, notFound, Outlet, redirect } from '@tanstack/react-router'
import { AuthGate, PlatformGate } from '../../components/auth-gates'
import { ensureMe, isPlatformActor, isUnauthorized, type MeResponse } from '../../lib/auth'
import { isFlowRunId } from '../../lib/flows'
import { useLocale } from '../../lib/locale'
import { DesignSystemPage } from '../design-system'
import { AdminFlowRunPage } from './flow-run'
import { AdminFlowsPage } from './flows'
import { AdminHomePage } from './home'
import { AdminModulesPage } from './modules'
import { AdminOrgsPage } from './orgs'
import { AdminUsersPage } from './users'

export function FlowRunNotFound() {
  const { m } = useLocale()
  return (
    <div
      role="alert"
      data-denial="not_found"
      className="py-12 text-center text-sm text-destructive"
    >
      {m.errNotFound}
    </div>
  )
}

/** ADR-0005 D6 */
export function createAdminRoute<TParent extends AnyRoute>(parent: TParent) {
  const adminLayoutRoute = createRoute({
    getParentRoute: () => parent,
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
  const adminFlowsRoute = createRoute({
    getParentRoute: () => adminLayoutRoute,
    path: 'flows',
    component: AdminFlowsPage,
  })
  const adminFlowRunRoute = createRoute({
    getParentRoute: () => adminLayoutRoute,
    path: 'flows/runs/$runId',
    params: {
      parse: ({ runId }) => {
        if (!isFlowRunId(runId)) throw notFound()
        return { runId }
      },
      stringify: ({ runId }) => ({ runId }),
    },
    notFoundComponent: FlowRunNotFound,
    component: function AdminFlowRunRoute() {
      const { runId } = adminFlowRunRoute.useParams()
      return <AdminFlowRunPage runId={runId} />
    },
  })
  const adminDesignSystemRoute = createRoute({
    getParentRoute: () => adminLayoutRoute,
    path: 'design-system',
    component: DesignSystemPage,
  })

  return adminLayoutRoute.addChildren([
    adminIndexRoute,
    adminOrgsRoute,
    adminUsersRoute,
    adminModulesRoute,
    adminFlowsRoute,
    adminFlowRunRoute,
    adminDesignSystemRoute,
  ])
}
