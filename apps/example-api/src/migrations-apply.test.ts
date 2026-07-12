import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migDir = join(__dirname, '../migrations')

describe('D1 migrations greenfield apply', () => {
  it('applies 0001 then 0002 without duplicate-column failure', () => {
    const sqlite = new Database(':memory:')
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    expect(files).toContain('0001_init.sql')
    expect(files).toContain('0002_api_keys_prefix.sql')
    for (const name of files) {
      expect(() => sqlite.exec(readFileSync(join(migDir, name), 'utf8'))).not.toThrow()
    }
    const cols = sqlite.prepare(`PRAGMA table_info(api_keys)`).all() as { name: string }[]
    const names = cols.map((c) => c.name)
    expect(names).toEqual(
      expect.arrayContaining(['key_hash', 'key_prefix', 'name', 'expires_at', 'revoked_at']),
    )
    sqlite.close()
  })
})
