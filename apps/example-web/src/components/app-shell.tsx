import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  NavUser,
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
import { useHotkey } from '@tanstack/react-hotkeys'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Boxes,
  Building2,
  ChevronsUpDown,
  FileText,
  KeyRound,
  Languages,
  LayoutDashboard,
  Moon,
  Palette,
  Settings,
  Sun,
  SunMoon,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../lib/api'
import {
  canManageMembers,
  isPlatformActor,
  isUnauthorized,
  type MeResponse,
  meQueryKey,
  useMe,
} from '../lib/auth'
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

function pageTitle(pathname: string, m: ReturnType<typeof useLocale>['m']): string {
  if (pathname.startsWith('/app/notes') || pathname === '/notes') return m.navNotes
  if (pathname.startsWith('/app/keys') || pathname === '/keys') return m.navKeys
  if (pathname.includes('/members')) return m.navMembers
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

function orgRoleLabel(role: string, m: ReturnType<typeof useLocale>['m']): string {
  if (role === 'owner') return m.roleOwner
  if (role === 'admin') return m.roleAdmin
  if (role === 'reader') return m.roleReader
  return m.roleMember
}

/**
 * Header org switcher — same interaction pattern as sidebar-07 TeamSwitcher
 * (dropdown + logo tile + name/plan lines + chevrons + shortcuts).
 */
function OrgSwitcher({ className }: { className?: string }) {
  const { m } = useLocale()
  const { orgs, activeOrgId, activeOrg, setActiveOrgId } = useOrgContext()

  // ⌘/Ctrl+1…9 — first 9 orgs (same shortcuts shown as TeamSwitcher)
  useHotkey('Mod+1', () => {
    if (orgs[0]) setActiveOrgId(orgs[0].id)
  })
  useHotkey('Mod+2', () => {
    if (orgs[1]) setActiveOrgId(orgs[1].id)
  })
  useHotkey('Mod+3', () => {
    if (orgs[2]) setActiveOrgId(orgs[2].id)
  })
  useHotkey('Mod+4', () => {
    if (orgs[3]) setActiveOrgId(orgs[3].id)
  })
  useHotkey('Mod+5', () => {
    if (orgs[4]) setActiveOrgId(orgs[4].id)
  })
  useHotkey('Mod+6', () => {
    if (orgs[5]) setActiveOrgId(orgs[5].id)
  })
  useHotkey('Mod+7', () => {
    if (orgs[6]) setActiveOrgId(orgs[6].id)
  })
  useHotkey('Mod+8', () => {
    if (orgs[7]) setActiveOrgId(orgs[7].id)
  })
  useHotkey('Mod+9', () => {
    if (orgs[8]) setActiveOrgId(orgs[8].id)
  })

  if (orgs.length === 0) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>{m.orgPickerEmpty}</span>
    )
  }

  const current = activeOrg ?? orgs[0]!
  const initials = current.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className={cn(className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 gap-2 px-2 data-open:bg-muted"
              aria-label={m.orgPicker}
            />
          }
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="text-xs font-bold">{initials || 'OR'}</span>
          </div>
          <div className="grid max-w-40 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{current.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {orgRoleLabel(current.role, m)}
              {current.slug ? ` · ${current.slug}` : ''}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56" align="end" side="bottom" sideOffset={4}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {m.orgPicker}
            </DropdownMenuLabel>
            {orgs.map((org, index) => {
              const tile = org.name
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              const selected = org.id === (activeOrgId ?? current.id)
              return (
                <DropdownMenuItem
                  key={org.id}
                  className="gap-2 p-2"
                  onClick={() => setActiveOrgId(org.id)}
                  data-active={selected || undefined}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border text-[10px] font-semibold">
                    {tile || '·'}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{org.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {orgRoleLabel(org.role, m)}
                    </span>
                  </div>
                  {index < 9 ? <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** dashboard-01 inspired shell: brand header, grouped nav, user footer, site header. */
function ShellChrome({ mode, children }: { mode: ShellMode; children: ReactNode }) {
  const { m, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const me = useMe()
  const { activeOrgId } = useOrgContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const showMembers =
    mode === 'app' && Boolean(activeOrgId) && canManageMembers(me.data, activeOrgId ?? '')

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

  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system']
    const i = order.indexOf(theme)
    setTheme(order[(i + 1) % order.length]!)
  }
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : SunMoon
  const themeLabel =
    theme === 'dark' ? m.themeDark : theme === 'light' ? m.themeLight : m.themeSystem

  const initials = (me.data?.email ?? me.data?.subject ?? 'U').slice(0, 2).toUpperCase()
  const title = pageTitle(pathname, m)
  const homeTo = mode === 'admin' ? '/admin' : '/app'
  const subtitle = mode === 'admin' ? m.shellAdminSubtitle : m.shellAppSubtitle
  const platform = isPlatformActor(me.data)

  return (
    <>
      {/* sidebar-07: collapses to icons */}
      <Sidebar collapsible="icon">
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
                <SidebarMenu>
                  <NavItem to="/app" label={m.navAppHome} icon={<LayoutDashboard />} />
                  <NavItem to="/app/notes" label={m.navNotes} icon={<FileText />} />
                  <NavItem to="/app/keys" label={m.navKeys} icon={<KeyRound />} />
                  {showMembers && activeOrgId ? (
                    <NavItem
                      to={`/app/orgs/${activeOrgId}/members`}
                      label={m.navMembers}
                      icon={<Users />}
                    />
                  ) : null}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <NavUser
            user={{
              name: me.data?.email ?? me.data?.subject ?? m.account,
              email: me.data?.email ?? me.data?.subject ?? '',
              fallback: initials,
            }}
            logoutLabel={m.logout}
            onLogout={() => void logout()}
          >
            {mode === 'app' ? (
              <DropdownMenuItem onClick={() => void navigate({ to: '/app/settings' })}>
                <Settings />
                {m.settings}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => void navigate({ to: '/admin/settings/integrations/feedback' })}
              >
                <Settings />
                {m.integrationFeedbackTitle}
              </DropdownMenuItem>
            )}
            {platform && mode === 'admin' ? (
              <DropdownMenuItem onClick={() => void navigate({ to: '/app' })}>
                <LayoutDashboard />
                {m.switchToApp}
              </DropdownMenuItem>
            ) : null}
            {platform && mode === 'app' ? (
              <DropdownMenuItem onClick={() => void navigate({ to: '/admin' })}>
                <Building2 />
                {m.switchToAdmin}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}>
              <Languages />
              {m.language}: {locale === 'fr' ? 'FR' : 'EN'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={cycleTheme}>
              <ThemeIcon />
              {themeLabel}
            </DropdownMenuItem>
          </NavUser>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex w-full items-center gap-2 px-4 lg:gap-3 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <h1 className="text-sm font-medium">{title}</h1>
            {mode === 'app' ? <OrgSwitcher className="ml-auto" /> : null}
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
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-semibold">{m.error}</p>
        <p className="text-sm text-muted-foreground">{m.loadFailed}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void me.refetch()}>
            {m.retry}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigate({ to: '/login' })}
          >
            {m.login}
          </Button>
        </div>
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
