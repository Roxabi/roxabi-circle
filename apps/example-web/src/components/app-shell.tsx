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
  Boxes,
  Building2,
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
import { isPlatformActor, isUnauthorized, type MeResponse, meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { OrgProvider, useOrgContext } from '../lib/org-context'
import { type Theme, useTheme } from '../lib/theme'
import { FeedbackFab } from './feedback-fab'

export type ShellMode = 'admin' | 'app'

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = pathname === to || (to !== '/' && pathname.startsWith(`${to}/`)) || pathname === to
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
  if (pathname.startsWith('/app/notes') || pathname === '/notes') return m.navNotes
  if (pathname.startsWith('/app/keys') || pathname === '/keys') return m.navKeys
  if (pathname.startsWith('/app/settings') || pathname.startsWith('/settings')) return m.navSettings
  if (pathname.startsWith('/admin/design-system') || pathname.startsWith('/design-system')) {
    return m.navDesignSystem
  }
  if (pathname.startsWith('/admin/orgs')) return m.navOrgs
  if (pathname.startsWith('/admin/modules')) return m.navModules
  if (pathname.startsWith('/admin')) return m.navAdminHome
  if (pathname.startsWith('/app')) return m.navAppHome
  return m.navDashboard
}

function OrgPicker() {
  const { m } = useLocale()
  const { orgs, activeOrgId, setActiveOrgId } = useOrgContext()
  if (orgs.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">{m.orgPickerEmpty}</div>
  }
  return (
    <div className="px-2 py-1">
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {m.orgPicker}
        <select
          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground"
          value={activeOrgId ?? ''}
          onChange={(e) => setActiveOrgId(e.target.value || null)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.role})
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** dashboard-01 inspired shell: brand header, grouped nav, user footer, site header. */
function ShellChrome({ mode, children }: { mode: ShellMode; children: ReactNode }) {
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
      await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
    } catch {
      /* still clear client cache */
    }
    await qc.invalidateQueries({ queryKey: meQueryKey })
    qc.removeQueries({ queryKey: meQueryKey })
    toast.message(m.logout)
    await navigate({ to: '/login' })
  }

  const initials = (me.data?.email ?? me.data?.subject ?? 'U').slice(0, 2).toUpperCase()
  const title = pageTitle(pathname, m)
  const homeTo = mode === 'admin' ? '/admin' : '/app'
  const subtitle = mode === 'admin' ? m.shellAdminSubtitle : m.shellAppSubtitle
  const platform = isPlatformActor(me.data)

  return (
    <>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="data-[slot=sidebar-menu-button]:p-1.5!"
                render={<Link to={homeTo} />}
              >
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-xs font-bold">GX</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{m.appTitle}</span>
                  <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {mode === 'admin' ? (
            <SidebarGroup>
              <SidebarGroupLabel>{m.navAdmin}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItem to="/admin" label={m.navAdminHome} icon={<LayoutDashboard />} />
                  <NavItem to="/admin/orgs" label={m.navOrgs} icon={<Building2 />} />
                  <NavItem to="/admin/modules" label={m.navModules} icon={<Boxes />} />
                  <NavItem to="/admin/design-system" label={m.navDesignSystem} icon={<Palette />} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>{m.navApp}</SidebarGroupLabel>
              <SidebarGroupContent>
                <OrgPicker />
                <SidebarMenu>
                  <NavItem to="/app" label={m.navAppHome} icon={<LayoutDashboard />} />
                  <NavItem to="/app/notes" label={m.navNotes} icon={<FileText />} />
                  <NavItem to="/app/keys" label={m.navKeys} icon={<KeyRound />} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>{m.navSecondary}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mode === 'app' ? (
                  <NavItem to="/app/settings" label={m.navSettings} icon={<Settings />} />
                ) : (
                  <NavItem
                    to="/admin/settings/integrations/feedback"
                    label={m.integrationFeedbackTitle}
                    icon={<Settings />}
                  />
                )}
                {platform && mode === 'admin' ? (
                  <NavItem to="/app" label={m.switchToApp} icon={<LayoutDashboard />} />
                ) : null}
                {platform && mode === 'app' ? (
                  <NavItem to="/admin" label={m.switchToAdmin} icon={<Building2 />} />
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
                {me.data?.platformRole ? (
                  <Badge variant="outline" className="text-[10px]">
                    {me.data.platformRole}
                  </Badge>
                ) : null}
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
                    <span className="truncate font-medium">
                      {me.data?.email ?? me.data?.subject ?? '—'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {me.data?.platformRole ?? me.data?.role ?? m.account}
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
                      <div>{me.data?.email ?? me.data?.subject ?? '—'}</div>
                      {me.data?.platformRole ? (
                        <Badge variant="outline" className="text-[10px]">
                          {me.data.platformRole}
                        </Badge>
                      ) : me.data?.role ? (
                        <Badge variant="outline" className="text-[10px]">
                          {me.data.role}
                        </Badge>
                      ) : null}
                    </div>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() =>
                        void navigate({ to: mode === 'admin' ? '/admin' : '/app/settings' })
                      }
                    >
                      <Settings className="size-4" />
                      {mode === 'admin' ? m.navAdmin : m.settings}
                    </DropdownMenuItem>
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

export function AppShell({ children, mode = 'app' }: { children: ReactNode; mode?: ShellMode }) {
  return (
    <SidebarProvider>
      <ShellChrome mode={mode}>{children}</ShellChrome>
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

/** BO gate: platform staff | super_admin only. */
export function PlatformGate({ children }: { children: ReactNode }) {
  const me = useMe()
  const navigate = useNavigate()
  const { m } = useLocale()
  const forbidden = !me.isLoading && !isPlatformActor(me.data)

  useEffect(() => {
    if (forbidden) {
      toast.error(m.forbiddenPlatform, { description: m.forbiddenPlatformDesc })
      void navigate({ to: '/app' })
    }
  }, [forbidden, navigate, m.forbiddenPlatform, m.forbiddenPlatformDesc])

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
        <p className="text-lg font-semibold">{m.forbiddenPlatform}</p>
        <p className="text-sm text-muted-foreground">{m.forbiddenPlatformDesc}</p>
      </div>
    )
  }

  return children
}

/** @deprecated Use PlatformGate for BO. Alias kept for older imports. */
export function AdminGate({ children }: { children: ReactNode }) {
  return <PlatformGate>{children}</PlatformGate>
}

export function AuthGate({ children, mode = 'app' }: { children: ReactNode; mode?: ShellMode }) {
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
    <OrgProvider me={me.data as MeResponse}>
      <AppShell mode={mode}>{children}</AppShell>
      <FeedbackFab />
    </OrgProvider>
  )
}
