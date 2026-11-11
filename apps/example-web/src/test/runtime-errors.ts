import { vi } from 'vitest'

type ErrorMatcher = string | RegExp | ((error: Error) => boolean)

type CapturedError = {
  source: string
  error: Error
}

let captured: CapturedError[] = []
let allowed: ErrorMatcher[] = []
let previousConsoleError: typeof console.error | undefined
let capturedConsole: typeof console | undefined
let installedConsoleError: typeof console.error | undefined
let capturedWindow: typeof window | undefined
function accepts(error: Error, matcher: ErrorMatcher): boolean {
  if (typeof matcher === 'string') return error.message.includes(matcher)
  if (matcher instanceof RegExp) {
    if (!(matcher.global || matcher.sticky)) return matcher.test(error.message)
    const lastIndex = matcher.lastIndex
    matcher.lastIndex = 0
    try {
      return matcher.test(error.message)
    } finally {
      matcher.lastIndex = lastIndex
    }
  }
  return matcher(error)
}
function record(source: string, value: unknown): void {
  captured.push({ source, error: value instanceof Error ? value : new Error(String(value)) })
}

export function captureCaughtRenderError(error: unknown): void {
  record('caught render error', error)
  if (capturedConsole && previousConsoleError) {
    previousConsoleError.call(capturedConsole, error)
  } else {
    console.error(error)
  }
}

function onWindowError(event: ErrorEvent): void {
  record('window error', event.error ?? event.message)
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  record('unhandled rejection', event.reason)
}

export function beginRuntimeErrorCapture(): void {
  captured = []
  allowed = []
  const owner = console
  const previous = owner.error
  capturedConsole = owner
  previousConsoleError = previous
  installedConsoleError = (...args: unknown[]) => {
    const message = args
      .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)))
      .join(' ')
    record('console.error', new Error(message))
    previous.apply(owner, args)
  }
  owner.error = installedConsoleError
  capturedWindow = typeof window === 'undefined' ? undefined : window
  if (capturedWindow) {
    capturedWindow.addEventListener('error', onWindowError)
    capturedWindow.addEventListener('unhandledrejection', onUnhandledRejection)
  }
}

export function finishRuntimeErrorCapture(): void {
  capturedWindow?.removeEventListener('error', onWindowError)
  capturedWindow?.removeEventListener('unhandledrejection', onUnhandledRejection)
  if (capturedConsole && previousConsoleError && capturedConsole.error === installedConsoleError) {
    // A later spy can reinstall our wrapper after retiring this predecessor.
    if (vi.isMockFunction(previousConsoleError)) previousConsoleError.mockRestore()
    if (capturedConsole.error === installedConsoleError) {
      capturedConsole.error = previousConsoleError
    }
  }
  capturedWindow = undefined
  capturedConsole = undefined
  installedConsoleError = undefined
  previousConsoleError = undefined
  assertNoUndeclaredRuntimeErrors()
}

/** Declare one intentionally rendered negative error for the current test only. */
export function allowRuntimeError(matcher: ErrorMatcher): void {
  allowed.push(matcher)
}

/** Validate and drain the current ledger without ending capture. */
export function assertNoUndeclaredRuntimeErrors(): void {
  const unmatched = captured.filter(
    ({ error }) => !allowed.some((matcher) => accepts(error, matcher)),
  )
  const unused = allowed.filter((matcher) => !captured.some(({ error }) => accepts(error, matcher)))
  captured = []
  allowed = []
  if (unmatched.length > 0 || unused.length > 0) {
    const details = [
      ...unmatched.map(({ source, error }) => `${source}: ${error.message}`),
      ...unused.map((matcher) => `Expected runtime error was not observed: ${String(matcher)}`),
    ]
    throw new Error(`Undeclared runtime error(s):\n${details.join('\n')}`)
  }
}
