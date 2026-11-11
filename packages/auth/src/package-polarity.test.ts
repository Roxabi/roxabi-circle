import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  devDependencies?: Record<string, string>
}

describe('optional peers', () => {
  it.each(['drizzle-orm', '@kit/email'] as const)(
    '%s is an optional peer, not a hard dependency',
    (name) => {
      expect(pkg.dependencies).not.toHaveProperty(name)
      expect(pkg.peerDependencies).toHaveProperty(name)
      expect(pkg.peerDependenciesMeta?.[name]?.optional).toBe(true)
      expect(pkg.devDependencies).toHaveProperty(name)
    },
  )
})
