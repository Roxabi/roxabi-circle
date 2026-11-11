#!/usr/bin/env bun
/**
 * Bare issue/PR references (`#N`) are ambiguous across the two repositories that number their
 * issues independently. Tracked Markdown and the comments and messages of code and config must write
 * `owner/repo#N` or a full URL. `bun run doc:check` runs this next to check-doc-hygiene.ts; the
 * detector (scripts/kit/lib/bare-issue-ref.cjs) is the one commitlint.config.cjs uses for commits.
 *
 * Scope: tracked + untracked-not-ignored files. Out of scope: applied D1 migrations (any .sql
 * under a migrations directory): their bytes are sha256-pinned by the kit-schema catalog, so a
 * comment edit would break every product that synced them.
 * A line carrying `qualified-refs:ignore` is data (a fixture), not a reference.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, resolve } from 'node:path'

// CommonJS on purpose: commitlint.config.cjs requires the same file.
const { findBareRefs } = createRequire(import.meta.url)('./lib/bare-issue-ref.cjs') as {
  findBareRefs: (text: string, options?: { markdown?: boolean }) => { index: number; ref: string }[]
}

const ROOT = realpathSync(
  resolve(process.env.QUALIFIED_REFS_ROOT ?? join(import.meta.dirname, '../..')),
)
const SCANNED: Record<string, true> = {
  '.md': true,
  '.ts': true,
  '.tsx': true,
  '.mts': true,
  '.cts': true,
  '.js': true,
  '.mjs': true,
  '.cjs': true,
  '.sh': true,
  '.yml': true,
  '.yaml': true,
  '.toml': true,
  '.json': true,
  '.jsonc': true,
  '.sql': true,
  '.sem': true,
  '.txt': true,
}
const APPLIED_MIGRATION = /(?:^|\/)migrations\/[^/]+\.sql$/
const IGNORE_MARKER = 'qualified-refs:ignore'

function listFiles(): string[] {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  if (result.status !== 0) {
    console.error(`check-qualified-refs: git ls-files failed in ${ROOT}: ${result.stderr.trim()}`)
    process.exit(2)
  }
  return result.stdout
    .split('\0')
    .filter((file) => file !== '' && SCANNED[extname(file)] === true)
    .filter((file) => !APPLIED_MIGRATION.test(file))
    .sort()
}

function main(): void {
  const violations: string[] = []
  let scanned = 0
  for (const file of listFiles()) {
    const path = join(ROOT, file)
    if (!existsSync(path)) continue // tracked but deleted in the working tree
    scanned += 1
    const markdown = file.endsWith('.md')
    const lines = readFileSync(path, 'utf8').split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(IGNORE_MARKER)) continue
      for (const hit of findBareRefs(lines[index], { markdown })) {
        violations.push(
          `${file}:${index + 1}: bare issue reference ${hit.ref} — write owner/repo${hit.ref} or a full URL`,
        )
      }
    }
  }
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation)
    console.error(`check-qualified-refs: FAIL (${violations.length} bare reference(s))`)
    process.exitCode = 1
    return
  }
  console.log(`check-qualified-refs: OK (${scanned} files, 0 bare references)`)
}

main()
