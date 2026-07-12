import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { HomePage } from './routes/home'
import { LoginPage } from './routes/login'

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <Outlet />
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

export const routeTree = rootRoute.addChildren([indexRoute, loginRoute])
