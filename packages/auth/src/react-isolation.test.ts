import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)))

function walkTs(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      if (name === 'react') continue
      walkTs(abs, out)
    } else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) {
      out.push(abs)
    }
  }
}

const SPEC_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
const PEER_BANNED = ['drizzle-orm', 'better-auth', '@kit/email']

function isPeerBanned(spec: string): boolean {
  return PEER_BANNED.some((pkgName) => spec === pkgName || spec.startsWith(`${pkgName}/`))
}

function resolveRelative(fromFile: string, spec: string): string {
  const base = join(dirname(fromFile), spec)
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
  const hit = candidates.find((c) => existsSync(c))
  if (!hit) throw new Error(`unresolved relative import ${spec} from ${fromFile}`)
  return hit
}

/** Reachability from an entry — not a flat src scan (`repos/*` may import drizzle). */
function walkFrom(entry: string): { banned: { file: string; spec: string }[]; visited: number } {
  const banned: { file: string; spec: string }[] = []
  const queue = [entry]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(SPEC_RE)) {
      const spec = match[1]
      if (!spec) continue
      if (isPeerBanned(spec)) {
        banned.push({ file, spec })
        continue
      }
      if (spec.startsWith('.')) queue.push(resolveRelative(file, spec))
    }
  }
  return { banned, visited: seen.size }
}

describe('Worker auth graph stays React-free', () => {
  it('non-react src must not import react, @kit/ui, or ./react', () => {
    const files: string[] = []
    walkTs(srcRoot, files)
    const banned = /from\s+['"](react|react-dom|@kit\/ui|\.\/react|@kit\/auth\/react)/
    const hits: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (banned.test(text)) hits.push(file)
    }
    expect(hits).toEqual([])
  })
})

describe('SPA barrels stay free of Worker-only peers', () => {
  it('factory graph reaches better-auth, drizzle-orm, and @kit/email (walker control)', () => {
    const factory = walkFrom(join(srcRoot, 'factory.ts'))
    expect(factory.visited).toBeGreaterThan(1)
    expect(factory.banned.map((h) => h.spec).sort()).toEqual(
      expect.arrayContaining(['better-auth/plugins', 'drizzle-orm/d1', '@kit/email']),
    )
  })

  it('root and react barrels do not reach drizzle-orm, better-auth, or @kit/email', () => {
    const root = walkFrom(join(srcRoot, 'index.ts'))
    const react = walkFrom(join(srcRoot, 'react/index.ts'))
    expect(root.visited).toBeGreaterThan(5)
    expect(react.visited).toBeGreaterThan(3)
    expect([...root.banned, ...react.banned]).toEqual([])
  })
})
