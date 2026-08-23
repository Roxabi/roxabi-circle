#!/usr/bin/env bun
/**
 * CP-EXTRACT compose proof — temp @kit/* app, migrations, tsc, org-scoped Hono 200/404.
 *
 * Env: EXTRACT_ROOT — monorepo root.
 * Exit: 0 pass · 1 fail
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: gate script override
const ROOT = resolve(process.env.EXTRACT_ROOT ?? join(import.meta.dirname, '../..'))
const MIG_DIR = join(ROOT, 'apps/example-api/migrations')
const API_PKG = join(ROOT, 'apps/example-api/package.json')
const requireApi = createRequire(API_PKG)

function findBunStoreModules(prefix: string): string {
  const bunDir = join(ROOT, 'node_modules/.bun')
  if (!existsSync(bunDir)) throw new Error('node_modules/.bun missing — run bun install')
  for (const ent of readdirSync(bunDir)) {
    if (ent.startsWith(prefix)) return join(bunDir, ent, 'node_modules')
  }
  throw new Error(`bun package not found: ${prefix}`)
}

function resolveDep(spec: string): string {
  return dirname(requireApi.resolve(`${spec}/package.json`))
}

function pkgSrc(pkg: string, sub: string): string {
  return join(ROOT, 'packages', pkg, 'src', sub)
}

function kitPaths(): Record<string, string[]> {
  const nm = resolveDep('hono')
  const drizzle = resolveDep('drizzle-orm')
  return {
    '@kit/auth/hono': [pkgSrc('auth', 'hono.ts')],
    '@kit/auth/schema': [pkgSrc('auth', 'better-auth-schema.ts')],
    '@kit/auth/repos/orgs': [pkgSrc('auth', 'repos/orgs.ts')],
    '@kit/auth/repos/platform-roles': [pkgSrc('auth', 'repos/platform-roles.ts')],
    '@kit/db': [pkgSrc('db', 'index.ts')],
    '@kit/core': [pkgSrc('core', 'index.ts')],
    '@kit/types': [pkgSrc('types', 'index.ts')],
    hono: [join(nm, 'dist/types/index.d.ts')],
    'drizzle-orm': [join(drizzle, 'index.d.ts')],
    'drizzle-orm/*': [join(drizzle, '*')],
    'drizzle-orm/d1': [join(drizzle, 'd1/index.d.ts')],
    'drizzle-orm/sqlite-core': [join(drizzle, 'sqlite-core/index.d.ts')],
    zod: [join(resolveDep('zod'), 'index.d.cts')],
  }
}

const SQLITE_SHIM = `declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      get(...args: unknown[]): unknown
      run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint }
      all(...args: unknown[]): unknown[]
      values(...args: unknown[]): unknown[][]
    }
    close(): void
  }
}
`

const PROOF_APP = `import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { Hono } from 'hono'
import { createOrgMiddleware, type OrgMiddlewareEnv } from '@kit/auth/hono'
import * as orgsRepo from '@kit/auth/repos/orgs'
import * as platformRolesRepo from '@kit/auth/repos/platform-roles'
import { kitAuthSchema } from '@kit/auth/schema'
import { createDb } from '@kit/db'


const MIG_DIR = process.env.KIT_MIG_DIR!

function applyMigrations(sqlite: Database) {
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const name of readdirSync(MIG_DIR).filter((f: string) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIG_DIR, name), 'utf8'))
  }
}

function makeD1(sqlite: Database) {
  function stmt(sql: string) {
    let binds: unknown[] = []
    const s = {
      bind(...args: unknown[]) {
        binds = args
        return s
      },
      async first() {
        return sqlite.prepare(sql).get(...binds) ?? null
      },
      async run() {
        const info = sqlite.prepare(sql).run(...binds)
        return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } }
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...binds), success: true }
      },
      async raw() {
        return sqlite.prepare(sql).values(...binds) as unknown[][]
      },
    }
    return s
  }
  return {
    prepare(sql: string) {
      return stmt(sql)
    },
    async batch(stmts: { all?: () => Promise<unknown>; run?: () => Promise<unknown> }[]) {
      const out: unknown[] = []
      for (const s of stmts) {
        if (s.all) out.push(await s.all())
        else if (s.run) out.push(await s.run())
      }
      return out
    },
    async exec(query: string) {
      sqlite.exec(query)
      return { count: 1, duration: 0 }
    },
  }
}

export async function runComposeProof(): Promise<void> {
  const sqlite = new Database(':memory:')
  applyMigrations(sqlite)
  sqlite.exec(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('user-1', 'User', 'user@kit.local', 0, 0, 0)",
  )
  const db = createDb(makeD1(sqlite) as never, kitAuthSchema)
  const now = new Date(0)
  await orgsRepo.insertOrganization(db, {
    id: 'org-a',
    name: 'Org A',
    slug: 'org-a',
    kind: 'client',
    status: 'active',
    createdAt: now,
  })
  await orgsRepo.insertOrganization(db, {
    id: 'org-b',
    name: 'Org B',
    slug: 'org-b',
    kind: 'client',
    status: 'active',
    createdAt: now,
  })
  await orgsRepo.insertMember(db, {
    id: 'm1',
    organizationId: 'org-a',
    userId: 'user-1',
    role: 'member',
    createdAt: now,
  })

  const orgMw = createOrgMiddleware({
    findOrgById: orgsRepo.findOrgById,
    findMembership: async (db, orgId, subject) => {
      const row = await orgsRepo.findMembership(db as never, orgId, subject)
      if (!row) return null
      return { role: row.role as 'member' }
    },
    getPlatformRole: platformRolesRepo.getPlatformRole,
    resolveModuleAccess: async () => true,
    isModuleEffective: async () => true,
  })

  const app = new Hono<OrgMiddlewareEnv>()
  app.use('*', async (c, next) => {
    c.set('db', db)
    c.set('subject', 'user-1')
    await next()
  })
  app.get('/orgs/:orgId/ping', orgMw.requireOrgContext(), (c) => c.json({ orgId: c.get('orgId') }))
  app.onError((err, c) => {
    const raw = err && typeof err === 'object' && 'status' in err ? (err as { status: unknown }).status : 500
    const status = raw === 404 || raw === 401 || raw === 403 || raw === 400 ? raw : 500
    return c.json({ message: err instanceof Error ? err.message : 'error' }, status)
  })

  const ok = await app.request('/orgs/org-a/ping')
  if (ok.status !== 200) throw new Error('expected 200 for org-a, got ' + ok.status)

  const denied = await app.request('/orgs/org-b/ping')
  if (denied.status !== 404) throw new Error('expected 404 for org-b, got ' + denied.status)

  sqlite.close()
}

await runComposeProof()
`

async function main(): Promise<void> {
  mkdirSync(join(ROOT, '.tmp'), { recursive: true })
  const tmp = mkdtempSync(join(ROOT, '.tmp', 'kit-compose-proof-'))
  try {
    writeFileSync(join(tmp, 'proof-app.ts'), PROOF_APP)
    writeFileSync(join(tmp, 'bun-sqlite.d.ts'), SQLITE_SHIM)
    const nodeTypes = join(findBunStoreModules('@types+node@'), '@types')
    writeFileSync(
      join(tmp, 'tsconfig.tsc.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            lib: ['ES2022', 'DOM'],
            typeRoots: [nodeTypes],
            types: ['node'],
            paths: kitPaths(),
          },
          include: ['proof-app.ts', 'bun-sqlite.d.ts'],
        },
        null,
        2,
      ),
    )

    const tsc = spawnSync('bun', ['x', 'tsc', '--noEmit', '-p', join(tmp, 'tsconfig.tsc.json')], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    if (tsc.status !== 0) {
      console.error('extract-compose-proof: typecheck failed')
      console.error(tsc.stdout)
      console.error(tsc.stderr)
      process.exit(1)
    }
    const runFile = join(ROOT, 'apps/example-api/.extract-compose-proof-run.ts')
    writeFileSync(runFile, PROOF_APP)
    const run = spawnSync('bun', [runFile], {
      cwd: join(ROOT, 'apps/example-api'),
      encoding: 'utf8',
      env: { ...process.env, KIT_MIG_DIR: MIG_DIR },
    })
    rmSync(runFile, { force: true })
    if (run.status !== 0) {
      console.error('extract-compose-proof: runtime proof failed')
      console.error(run.stdout)
      console.error(run.stderr)
      process.exit(1)
    }

    console.log('extract-compose-proof: OK (typecheck + org 200/404)')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

await main().catch((err) => {
  console.error('extract-compose-proof:', err instanceof Error ? err.message : err)
  process.exit(1)
})
