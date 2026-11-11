import {
  DropdownMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@kit/ui'
import { Link, type useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Boxes,
  Building2,
  FileText,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Palette,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMe } from '../lib/auth'
import type { useLocale } from '../lib/locale'
import { useOrgContext } from '../lib/org-context'
import { OrgSwitcher } from './org-switcher'

type ShellMode = 'app' | 'admin'

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

export function ShellBrand({
  mode,
  homeTo,
  subtitle,
  appTitle,
}: {
  mode: ShellMode
  homeTo: string
  subtitle: string
  appTitle: string
}) {
  const impersonation = useMe().data?.impersonation
  const { activeOrg } = useOrgContext()
  if (mode === 'app' && impersonation) {
    return (
      <div className="px-2 py-3 text-sm font-semibold">
        {activeOrg?.name ?? impersonation.organizationId}
      </div>
    )
  }
  if (mode === 'app') return <OrgSwitcher />
  return (
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
            <span className="truncate font-semibold">{appTitle}</span>
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function ShellNav({
  mode,
  m,
  showMembers,
  activeOrgId,
  delegated,
}: {
  mode: ShellMode
  m: ReturnType<typeof useLocale>['m']
  showMembers: boolean
  activeOrgId: string | null | undefined
  delegated: boolean
}) {
  if (mode === 'admin') {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{m.navAdmin}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <NavItem to="/admin" label={m.navAdminHome} icon={<LayoutDashboard />} />
            <NavItem to="/admin/orgs" label={m.navOrgs} icon={<Building2 />} />
            <NavItem to="/admin/users" label={m.navUsers} icon={<Users />} />
            <NavItem to="/admin/modules" label={m.navModules} icon={<Boxes />} />
            <NavItem to="/admin/flows" label={m.navFlows} icon={<GitBranch />} />
            <NavItem to="/admin/design-system" label={m.navDesignSystem} icon={<Palette />} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{m.navApp}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {!delegated ? (
            <>
              <NavItem to="/app" label={m.navAppHome} icon={<LayoutDashboard />} />
              <NavItem to="/app/notes" label={m.navNotes} icon={<FileText />} />
              <NavItem to="/app/items" label={m.navItems} icon={<Boxes />} />
            </>
          ) : null}
          <NavItem to="/app/tasks" label={m.navTasks} icon={<ListTodo />} />
          {!delegated ? <NavItem to="/app/keys" label={m.navKeys} icon={<KeyRound />} /> : null}
          {!delegated && showMembers && activeOrgId ? (
            <NavItem
              to={`/app/orgs/${activeOrgId}/members`}
              label={m.navMembers}
              icon={<Users />}
            />
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function ShellUserExtras({
  mode,
  platform,
  m,
  navigate,
  delegated,
}: {
  mode: ShellMode
  platform: boolean
  m: ReturnType<typeof useLocale>['m']
  navigate: ReturnType<typeof useNavigate>
  delegated: boolean
}) {
  return (
    <>
      {mode === 'app' ? (
        !delegated ? (
          <>
            <DropdownMenuItem onClick={() => void navigate({ to: '/app/changelog' })}>
              <Sparkles />
              {m.navChangelog}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void navigate({ to: '/app/settings' })}>
              <Settings />
              {m.settings}
            </DropdownMenuItem>
          </>
        ) : null
      ) : (
        <DropdownMenuItem onClick={() => void navigate({ to: '/admin/modules' })}>
          <Settings />
          {m.navModules}
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
    </>
  )
}
