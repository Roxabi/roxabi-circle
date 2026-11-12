/**
 * Status-vs-lock gate for `docs/kit/standards/stack.md` (kit mode of check-stack-contract.ts).
 *
 * The doc is a descriptive contract: a markdown table with a `Statut` column declares each row
 * `livré` (shipped), `cible` (target), `option produit` (product choice) or `fermé` (closed
 * decision). A `Paquets` column, when present, names the npm packages of that row in backticks.
 * `livré` => every named package is a `bun.lock` package; any other status => none is. A stale
 * status therefore fails here instead of drifting.
 *
 * Packages are read from `bun.lock` `packages` entries (`name@version` in the first element), so
 * workspace packages (`@kit/auth@workspace:…`) and nested copies both count.
 * No table with `Statut`, no checked package, a status outside the set, or a `Paquets` token that
 * is not an npm name (a typo like `wrangler types`) fails closed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STACK_DOC = 'docs/kit/standards/stack.md'
const LOCK = 'bun.lock'
const STATUSES = ['livré', 'cible', 'option produit', 'fermé'] as const
const NPM_NAME = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/

/** Private-use sentinel standing in for `\\|` while a row is split on `|`. */
const ESCAPED_PIPE = '\uE000'

type Report = (message: string) => void

function splitRow(line: string): string[] {
  const cells = line
    .replaceAll('\\|', ESCAPED_PIPE)
    .split('|')
    .map((cell) => cell.replaceAll(ESCAPED_PIPE, '|').trim())
  return cells.slice(1, cells.at(-1) === '' ? -1 : undefined)
}

function lockPackageNames(root: string, report: Report): Set<string> | null {
  const path = join(root, LOCK)
  if (!existsSync(path)) {
    report(`${STACK_DOC}: missing ${LOCK}`)
    return null
  }
  let parsed: unknown
  try {
    parsed = Bun.JSONC.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    report(`${LOCK} unparseable: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
  const packages = (parsed as { packages?: unknown } | null)?.packages
  if (!packages || typeof packages !== 'object') {
    report(`${LOCK} has no packages map`)
    return null
  }
  const names = new Set<string>()
  for (const entry of Object.values(packages)) {
    const id = Array.isArray(entry) ? entry[0] : undefined
    if (typeof id !== 'string') continue
    const at = id.lastIndexOf('@')
    if (at > 0) names.add(id.slice(0, at))
  }
  return names
}

function tables(text: string): string[][] {
  const out: string[][] = []
  let current: string[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('|')) {
      current.push(line)
    } else if (current.length > 0) {
      out.push(current)
      current = []
    }
  }
  if (current.length > 0) out.push(current)
  return out
}

/** Checks the `Paquets` cell of one row against the lock; returns how many livré packages it checked. */
function checkPackages(
  label: string,
  status: string,
  cell: string,
  lock: Set<string>,
  report: Report,
): number {
  let checked = 0
  for (const [, name = ''] of cell.matchAll(/`([^`]+)`/g)) {
    if (!NPM_NAME.test(name)) {
      report(`${STACK_DOC} row "${label}": "${name}" is not an npm package name`)
    } else if (status === 'livré') {
      checked += 1
      if (!lock.has(name)) {
        report(`${STACK_DOC} row "${label}": livré package ${name} is not in ${LOCK}`)
      }
    } else if (lock.has(name)) {
      report(`${STACK_DOC} row "${label}": ${status} package ${name} is in ${LOCK} (stale status)`)
    }
  }
  return checked
}

/** Returns the number of livré packages checked, or null when the table has no `Statut` column. */
function checkTable(table: string[], lock: Set<string>, report: Report): number | null {
  const header = splitRow(table[0] ?? '').map((cell) => cell.toLowerCase())
  const statusCol = header.indexOf('statut')
  if (statusCol < 0) return null
  const packagesCol = header.indexOf('paquets')
  let checked = 0
  for (const line of table.slice(2)) {
    const cells = splitRow(line)
    const label = (cells[0] ?? '').replaceAll('*', '').trim() || line.slice(0, 40)
    const status = (cells[statusCol] ?? '').replaceAll('*', '').trim()
    if (!(STATUSES as readonly string[]).includes(status)) {
      report(
        `${STACK_DOC} row "${label}": status "${status}" must be one of ${STATUSES.join(' | ')}`,
      )
    } else if (packagesCol >= 0) {
      checked += checkPackages(label, status, cells[packagesCol] ?? '', lock, report)
    }
  }
  return checked
}

export function checkStackDocStatus(root: string, report: Report): void {
  const docPath = join(root, STACK_DOC)
  if (!existsSync(docPath)) {
    report(`missing ${STACK_DOC}`)
    return
  }
  const lock = lockPackageNames(root, report)
  if (lock === null) return

  let statusTables = 0
  let checkedLivre = 0
  for (const table of tables(readFileSync(docPath, 'utf8'))) {
    const checked = checkTable(table, lock, report)
    if (checked === null) continue
    statusTables += 1
    checkedLivre += checked
  }
  if (statusTables === 0) report(`${STACK_DOC}: no table with a Statut column`)
  else if (checkedLivre === 0) report(`${STACK_DOC}: no livré package was checked against ${LOCK}`)
}
