const CAUSE_WALK_LIMIT = 8
const EXTENDED_MARKER = '(extended: '

function isUniqueExtended(code: string): boolean {
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
}

type DriverFields = {
  message: string | undefined
  cause: unknown
}

function readDriverFields(value: object): DriverFields {
  let message: string | undefined
  let cause: unknown
  if ('message' in value && typeof value.message === 'string') message = value.message
  if ('cause' in value) cause = value.cause
  return { message, cause }
}

function extendedConstraint(message: string): string | undefined {
  const at = message.lastIndexOf(EXTENDED_MARKER)
  if (at < 0 || !message.endsWith(')')) return undefined
  const code = message.slice(at + EXTENDED_MARKER.length, -1)
  return code.startsWith('SQLITE_CONSTRAINT_') ? code : undefined
}

/**
 * True when `err` is a D1 unique violation, including a PRIMARY KEY duplicate.
 *
 * Workerd does not set `.code`. It throws
 * `D1_ERROR: <sqlite message>: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_X)`
 * with `cause` set to `Error(<sqlite message>)`. SQLite phrases both UNIQUE and
 * PRIMARY KEY failures as `UNIQUE constraint failed:`.
 *
 * One procedure: the `(extended: …)` suffix on a `D1_ERROR:` message decides
 * when present; otherwise the engine prefix must start a cause message.
 * Drizzle's `params:` text is never an identity.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < CAUSE_WALK_LIMIT && current != null; depth++) {
    if (typeof current !== 'object') return false
    const { message, cause } = readDriverFields(current)
    if (message?.startsWith('D1_ERROR: ')) {
      const extended = extendedConstraint(message)
      if (extended) return isUniqueExtended(extended)
    } else if (message?.startsWith('UNIQUE constraint failed:')) {
      return true
    }
    current = cause
  }
  return false
}

/**
 * Rethrow shape for in-memory D1 doubles. better-sqlite3 sets `.code`; workerd does not.
 */
export function toWorkerdD1Error(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  let code: string | undefined
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    code = err.code
  }
  const suffix = code?.startsWith('SQLITE_CONSTRAINT_')
    ? `: SQLITE_CONSTRAINT (extended: ${code})`
    : code
      ? `: ${code}`
      : ''
  return new Error(`D1_ERROR: ${message}${suffix}`, { cause: new Error(message) })
}

/** Run a better-sqlite3 call and rethrow the workerd D1 shape. */
export function callSqlite<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    throw toWorkerdD1Error(err)
  }
}
