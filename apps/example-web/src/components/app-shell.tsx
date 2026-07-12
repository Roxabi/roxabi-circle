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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
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
    <Button type="button" variant="outline" size="icon-sm" onClick={next} title={label}>
      <Icon />
    </Button>
  )
}

function ShellChrome({ children }: { children: ReactNode }) {
  const { m, locale, setLocale } = useLocale()
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: boolean }>('/health'),
    refetchInterval: 30_000,
  })

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' })
    } catch {
      /* still clear client cache */
    }
    await qc.invalidateQueries({ queryKey: meQueryKey })
    qc.removeQueries({ queryKey: meQueryKey })
    toast.message(m.logout)
    await navigate({ to: '/login' })
  }

  const initials = (me.data?.subject ?? 'U').slice(0, 2).toUpperCase()

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
              GX
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold">{m.appTitle}</div>
              <div className="truncate text-[11px] text-muted-foreground">{m.appSubtitle}</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/" label={m.navDashboard} icon={<LayoutDashboard />} />
                <NavItem to="/notes" label={m.navNotes} icon={<FileText />} />
                <NavItem to="/keys" label={m.navKeys} icon={<KeyRound />} />
                <NavItem to="/settings" label={m.navSettings} icon={<Settings />} />
                {isAdmin(me.data) ? (
                  <NavItem to="/design-system" label={m.navDesignSystem} icon={<Palette />} />
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Badge
            variant={health.data?.ok ? 'secondary' : 'destructive'}
            className="w-full justify-center group-data-[collapsible=icon]:px-0"
          >
            {health.data?.ok ? m.online : m.offline}
          </Badge>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <div className="flex flex-1 items-center justify-end gap-2">
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="rounded-full">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
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
                  {isAdmin(me.data) ? (
                    <DropdownMenuItem onClick={() => void navigate({ to: '/design-system' })}>
                      <Palette className="size-4" />
                      {m.navDesignSystem}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => void navigate({ to: '/settings' })}>
                    <Settings className="size-4" />
                    {m.settings}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void logout()}>
                    <LogOut className="size-4" />
                    {m.logout}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
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
        <div className="w-full max-w-sm space-y-3">
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

  return <AppShell>{children}</AppShell>
}
