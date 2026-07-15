import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  Skeleton,
} from '@gosilex/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette,
  Settings,
  Sun,
  SunMoon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../lib/api'
import { isAdmin, isUnauthorized, meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { type Theme, useTheme } from '../lib/theme'
import { FeedbackFab } from './feedback-fab'

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = pathname === to || (to !== '/' && pathname.startsWith(to))
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={label} render={<Link to={to} />}>
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function ThemeCycleButton() {
  const { theme, setTheme } = useTheme()
  const { m } = useLocale()
  const order: Theme[] = ['light', 'dark', 'system']
  const next = () => {
    const i = order.indexOf(theme)
    setTheme(order[(i + 1) % order.length]!)
  }
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : SunMoon
  const label = theme === 'dark' ? m.themeDark : theme === 'light' ? m.themeLight : m.themeSystem
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={next}
      title={label}
      aria-label={label}
    >
      <Icon />
    </Button>
  )
}

function pageTitle(pathname: string, m: ReturnType<typeof useLocale>['m']): string {
  if (pathname.startsWith('/notes')) return m.navNotes
  if (pathname.startsWith('/keys')) return m.navKeys
  if (pathname.startsWith('/settings')) return m.navSettings
  if (pathname.startsWith('/design-system')) return m.navDesignSystem
  return m.navDashboard
}

/** dashboard-01 inspired shell: brand header, grouped nav, user footer, site header. */
function ShellChrome({ children }: { children: ReactNode }) {
  const { m, locale, setLocale } = useLocale()
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: boolean }>('/health'),
    refetchInterval: 30_000,
  })

  const logout = async () => {
    try {
      const health = await apiFetch<{ authAdapter?: string }>('/health')
      if (health.authAdapter === 'better-auth') {
        await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
      } else {
        await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' })
      }
    } catch {
      /* still clear client cache */
    }
    await qc.invalidateQueries({ queryKey: meQueryKey })
    qc.removeQueries({ queryKey: meQueryKey })
    toast.message(m.logout)
    await navigate({ to: '/login' })
  }

  const initials = (me.data?.subject ?? 'U').slice(0, 2).toUpperCase()
  const title = pageTitle(pathname, m)

  return (
    <>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="data-[slot=sidebar-menu-button]:p-1.5!"
                render={<Link to="/" />}
              >
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-xs font-bold">GX</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{m.appTitle}</span>
                  <span className="truncate text-xs text-muted-foreground">{m.appSubtitle}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{m.navPlatform}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/" label={m.navDashboard} icon={<LayoutDashboard />} />
                <NavItem to="/notes" label={m.navNotes} icon={<FileText />} />
                <NavItem to="/keys" label={m.navKeys} icon={<KeyRound />} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>{m.navSecondary}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/settings" label={m.navSettings} icon={<Settings />} />
                {isAdmin(me.data) ? (
                  <NavItem to="/design-system" label={m.navDesignSystem} icon={<Palette />} />
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-1 py-1">
                <Badge
                  variant={health.data?.ok ? 'secondary' : 'destructive'}
                  className="text-[10px]"
                >
                  {health.data?.ok ? m.online : m.offline}
                </Badge>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      className="aria-expanded:bg-muted data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{me.data?.subject ?? '—'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {me.data?.role ?? m.account}
                    </span>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{m.account}</DropdownMenuLabel>
                    <div className="space-y-0.5 px-2 pb-1 text-xs text-muted-foreground">
                      <div>{me.data?.subject ?? '—'}</div>
                      {me.data?.role ? (
                        <Badge variant="outline" className="text-[10px]">
                          {me.data.role}
                        </Badge>
                      ) : null}
                    </div>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => void navigate({ to: '/settings' })}>
                      <Settings className="size-4" />
                      {m.settings}
                    </DropdownMenuItem>
                    {isAdmin(me.data) ? (
                      <DropdownMenuItem onClick={() => void navigate({ to: '/design-system' })}>
                        <Palette className="size-4" />
                        {m.navDesignSystem}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => void logout()}>
                      <LogOut className="size-4" />
                      {m.logout}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex w-full items-center gap-2 px-4 lg:gap-3 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
            <h1 className="text-sm font-medium">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-1 sm:flex">
                <Button
                  type="button"
                  size="sm"
                  variant={locale === 'fr' ? 'secondary' : 'ghost'}
                  onClick={() => setLocale('fr')}
                >
                  FR
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={locale === 'en' ? 'secondary' : 'ghost'}
                  onClick={() => setLocale('en')}
                >
                  EN
                </Button>
              </div>
              <ThemeCycleButton />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col">
          <main className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">{children}</div>
          </main>
        </div>
      </SidebarInset>
    </>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <ShellChrome>{children}</ShellChrome>
    </SidebarProvider>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function AdminGate({ children }: { children: ReactNode }) {
  const me = useMe()
  const navigate = useNavigate()
  const { m } = useLocale()
  const forbidden = !me.isLoading && !isAdmin(me.data)

  useEffect(() => {
    if (forbidden) {
      void navigate({ to: '/' })
    }
  }, [forbidden, navigate])

  if (me.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{m.loading}</p>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold">{m.forbidden}</p>
        <p className="text-sm text-muted-foreground">{m.forbiddenDesc}</p>
      </div>
    )
  }

  return children
}

export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe()
  const navigate = useNavigate()
  const { m } = useLocale()
  const unauth = !me.isLoading && (isUnauthorized(me.error) || (!me.isError && !me.data))
  const hardError = !me.isLoading && me.isError && !isUnauthorized(me.error)

  useEffect(() => {
    if (unauth) {
      void navigate({ to: '/login' })
    }
  }, [unauth, navigate])

  if (me.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="w-full max-w-sm flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <p className="text-center text-sm text-muted-foreground">{m.loading}</p>
        </div>
      </div>
    )
  }

  if (hardError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold">{m.error}</p>
        <p className="text-sm text-muted-foreground">{m.loadFailed}</p>
      </div>
    )
  }

  if (unauth || !me.data) {
    return null
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <FeedbackFab />
    </>
  )
}
