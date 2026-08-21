#!/usr/bin/env bun
/**
 * Print a table from coverage/<pkg>/coverage-summary.json (Vitest json-summary).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const covRoot = path.join(root, 'coverage')

function pct(metric) {
  if (!metric || typeof metric.pct !== 'number') return '  n/a'
  return `${metric.pct.toFixed(1).padStart(5)}%`
}

const entries = []
try {
  for (const name of await readdir(covRoot)) {
    const summaryPath = path.join(covRoot, name, 'coverage-summary.json')
    try {
      await stat(summaryPath)
      const json = JSON.parse(await readFile(summaryPath, 'utf8'))
      const t = json.total
      entries.push({
        name,
        statements: t.statements,
        branches: t.branches,
        functions: t.functions,
        lines: t.lines,
      })
    } catch {
      /* skip incomplete */
    }
  }
} catch {
  console.log('No coverage/ directory yet.')
  process.exit(0)
}

entries.sort((a, b) => a.name.localeCompare(b.name))

console.log('')
console.log('Coverage summary (statements / branches / funcs / lines)')
console.log('─'.repeat(72))
console.log(
  `${'package'.padEnd(18)} ${'stmts'.padStart(7)} ${'branch'.padStart(7)} ${'funcs'.padStart(7)} ${'lines'.padStart(7)}  html`,
)
console.log('─'.repeat(72))
for (const e of entries) {
  console.log(
    `${e.name.padEnd(18)} ${pct(e.statements)} ${pct(e.branches)} ${pct(e.functions)} ${pct(e.lines)}  coverage/${e.name}/index.html`,
  )
}
console.log('─'.repeat(72))
