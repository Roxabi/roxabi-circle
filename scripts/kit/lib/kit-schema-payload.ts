#!/usr/bin/env bun
/**
 * Identity of a kit D1 module file: the sha256 of its payload. A copy written by kit-schema-sync
 * carries exactly four `-- ` header lines (`-- kit-schema: <id>` first) and a blank line before the
 * kit source bytes; the payload is what follows. A file without that header hashes whole.
 * Returns null for a `-- kit-schema:` file whose header is malformed.
 *
 * Shared by kit-schema-sync.sh (CP-KIT-SCHEMA) and check-migrations-contract.ts
 * (CP-MIGRATION-CONTRACT): one definition of "this file is catalog module X".
 * CLI: `bun scripts/kit/lib/kit-schema-payload.ts <file>` prints the hex digest; exit 2 if malformed.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export function kitSchemaPayloadSha256(file: string): string | null {
  const buf = readFileSync(file)
  const text = buf.toString('utf8').replace(/\r\n/g, '\n')
  if (!text.startsWith('-- kit-schema: ')) return createHash('sha256').update(buf).digest('hex')
  const end = text.indexOf('\n\n')
  if (end < 0) return null
  const header = text.slice(0, end).split('\n')
  if (header.length !== 4 || !header.every((l) => l.startsWith('-- '))) return null
  return createHash('sha256')
    .update(text.slice(end + 2), 'utf8')
    .digest('hex')
}

if (import.meta.main) {
  const sha = kitSchemaPayloadSha256(process.argv[2] ?? '')
  if (sha === null) process.exit(2)
  process.stdout.write(sha)
}
