import type { Messages } from '../messages/fr'

type TitleRule = { test: (pathname: string) => boolean; key: keyof Messages }

const TITLE_RULES: TitleRule[] = [
  { test: (p) => p.startsWith('/app/items'), key: 'navItems' },
  { test: (p) => p.startsWith('/app/tasks'), key: 'navTasks' },
  { test: (p) => p.startsWith('/app/notes') || p === '/notes', key: 'navNotes' },
  { test: (p) => p.startsWith('/app/keys') || p === '/keys', key: 'navKeys' },
  { test: (p) => p.includes('/members'), key: 'navMembers' },
  {
    test: (p) => p.startsWith('/app/settings') || p.startsWith('/settings'),
    key: 'navSettings',
  },
  { test: (p) => p.startsWith('/app/changelog'), key: 'navChangelog' },
  {
    test: (p) => p.startsWith('/admin/design-system') || p.startsWith('/design-system'),
    key: 'navDesignSystem',
  },
  { test: (p) => p.startsWith('/admin/orgs'), key: 'navOrgs' },
  { test: (p) => p.startsWith('/admin/users'), key: 'navUsers' },
  { test: (p) => p.startsWith('/admin/modules'), key: 'navModules' },
  { test: (p) => p.startsWith('/admin/flows'), key: 'navFlows' },
  { test: (p) => p.startsWith('/admin'), key: 'navAdminHome' },
  { test: (p) => p.startsWith('/app'), key: 'navAppHome' },
]

export function pageTitle(pathname: string, m: Messages): string {
  for (const rule of TITLE_RULES) {
    if (rule.test(pathname)) return m[rule.key]
  }
  return m.navDashboard
}
