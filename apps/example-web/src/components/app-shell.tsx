import {
  DropdownMenuItem,
  DropdownMenuSeparator,
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
} from '@gosilex/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Boxes,
  Building2,
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
import { toast } from 'sonner'
import { canManageMembers, isPlatformActor, signOutAndClearSession, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { useOrgContext } from '../lib/org-context'
import { type Theme, useTheme } from '../lib/theme'
import { OrgSwitcher } from './org-switcher'

export type ShellMode = 'admin' | 'app'

/**
 * Active state for sidebar links.
 * Shell homes (`/admin`, `/app`) are prefixes of every nested route — exact match only,
 * otherwise "Accueil" stays lit on orgs/notes/etc.
 */
function isNavActive(pathname: string, to: string): boolean {
  if (pathname === to) return true
  if (to === '/' || to === '/admin' || to === '/app') return false
  return pathname.startsWith(`${to}/`)
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = isNavActive(pathname, to)
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
  if (pathname.startsWith('/admin/users')) return m.navUsers
  if (pathname.startsWith('/admin/modules')) return m.navModules
  if (pathname.startsWith('/admin')) return m.navAdminHome
  if (pathname.startsWith('/app')) return m.navAppHome
  return m.navDashboard
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
      await signOutAndClearSession(qc)
      toast.message(m.logout)
      await navigate({ to: '/login' })
    } catch {
      toast.error(m.error, { description: m.errUnauthorized })
    }
  }

  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system']
    const i = order.indexOf(theme)
    setTheme(order[(i + 1) % order.length]!)
  }
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : SunMoon
  const themeLabel =
    theme === 'dark' ? m.themeDark : theme === 'light' ? m.themeLight : m.themeSystem

  const displayName = me.data?.name ?? me.data?.email ?? me.data?.subject ?? m.account
  const initials = displayName.slice(0, 2).toUpperCase()
  const title = pageTitle(pathname, m)
  const homeTo = mode === 'admin' ? '/admin' : '/app'
  const subtitle = mode === 'admin' ? m.shellAdminSubtitle : m.shellAppSubtitle
  const platform = isPlatformActor(me.data)

  return (
    <>
      {/* sidebar-07: collapses to icons */}
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {mode === 'app' ? (
            <OrgSwitcher />
          ) : (
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
          )}
        </SidebarHeader>

        <SidebarContent>
          {mode === 'admin' ? (
            <SidebarGroup>
              <SidebarGroupLabel>{m.navAdmin}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItem to="/admin" label={m.navAdminHome} icon={<LayoutDashboard />} />
                  <NavItem to="/admin/orgs" label={m.navOrgs} icon={<Building2 />} />
                  <NavItem to="/admin/users" label={m.navUsers} icon={<Users />} />
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
              name: displayName,
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
