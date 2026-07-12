/**
 * Capture synchronous throws + window error/unhandledrejection during act.
 * Used to assert Base UI / React runtime contract errors (missing contexts, etc.).
 */
export function captureRuntimeErrors(run: () => void): Error[] {
  const errors: Error[] = []

  const onError = (event: ErrorEvent) => {
    if (event.error instanceof Error) errors.push(event.error)
    else if (event.message) errors.push(new Error(event.message))
    event.preventDefault()
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    if (reason instanceof Error) errors.push(reason)
    else errors.push(new Error(String(reason)))
    event.preventDefault()
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  // Base UI often logs + throws via React error boundary path / console
  const prevConsoleError = console.error
  console.error = (...args: unknown[]) => {
    const text = args.map(String).join(' ')
    if (/Base UI|MenuGroupContext|must be used within|Missing|Error:/i.test(text)) {
      errors.push(new Error(text))
    }
    prevConsoleError(...args)
  }

  try {
    run()
  } catch (e) {
    if (e instanceof Error) errors.push(e)
    else errors.push(new Error(String(e)))
  } finally {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    console.error = prevConsoleError
  }

  return errors
}

export function assertNoBaseUiContractErrors(errors: Error[]): void {
  const bad = errors.filter((e) =>
    /Base UI|MenuGroupContext|DialogRootContext|must be used within|TooltipProvider/i.test(
      e.message,
    ),
  )
  if (bad.length > 0) {
    throw new Error(
      `Base UI / component contract error(s):\n${bad.map((e) => e.message).join('\n---\n')}`,
    )
  }
}
