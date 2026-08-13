/**
 * SSoT for kit demo fixtures (local seed + ensureDemoUsers + docs).
 * No product/share domain — examples only.
 */

export type KitRole = 'admin' | 'user'

export type SeedUser = {
  id: string
  email: string
  /** Plaintext for local/demo only — never store as-is. */
  password: string
  role: KitRole
}

export type SeedNote = {
  id: string
  subject: string
  title: string
  body: string
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: 'user_demo',
    email: 'demo@kit.local',
    password: 'demo-password-change-me',
    role: 'admin',
  },
  {
    id: 'user_b',
    email: 'demo-b@kit.local',
    password: 'demo-password-b-change-me',
    role: 'user',
  },
] as const

export const SEED_NOTES: readonly SeedNote[] = [
  {
    id: 'note_seed_welcome',
    subject: 'user_demo',
    title: 'Welcome to the kit',
    body: 'Seeded note for demo@kit.local — try /notes and /design-system (admin).',
  },
  {
    id: 'note_seed_admin',
    subject: 'user_demo',
    title: 'Admin tip',
    body: 'role=admin · design system at /design-system · dual auth cookie + sk_.',
  },
  {
    id: 'note_seed_user_b',
    subject: 'user_b',
    title: 'User B note',
    body: 'Belongs to demo-b@kit.local — subject-scoped (IDOR isolation demo).',
  },
] as const

export type SeedItem = {
  id: string
  subject: string
  code: string
  label: string
  description: string
}

export const SEED_ITEMS: readonly SeedItem[] = [
  {
    id: 'item_seed_catalog_a',
    subject: 'user_demo',
    code: 'demo-sku',
    label: 'Demo catalog item',
    description: 'MasterData pattern seed — /app/items',
  },
  {
    id: 'item_seed_catalog_b',
    subject: 'user_demo',
    code: 'demo-sku-2',
    label: 'Second catalog row',
    description: 'List filter demo',
  },
  {
    id: 'item_seed_user_b',
    subject: 'user_b',
    code: 'user-b-sku',
    label: 'User B item',
    description: 'IDOR isolation seed for demo-b',
  },
] as const

export const DEMO_EMAIL = SEED_USERS[0]!.email
export const DEMO_PASSWORD = SEED_USERS[0]!.password
export const DEMO_EMAIL_B = SEED_USERS[1]!.email
export const DEMO_PASSWORD_B = SEED_USERS[1]!.password

/** Kit demo RBAC: primary demo user is admin; everyone else is user. */
export function roleForSubject(subject: string): KitRole {
  const u = SEED_USERS.find((x) => x.id === subject)
  return u?.role ?? 'user'
}
