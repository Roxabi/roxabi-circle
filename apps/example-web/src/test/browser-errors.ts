/** Shared helpers for browser / jsdom runtime contract checks. */

export function assertNoPageContractErrors(messages: string[]): void {
  const bad = messages.filter((m) =>
    /Base UI|MenuGroupContext|DialogRootContext|must be used within|TooltipProvider|Minified React error|TypeError|ReferenceError/i.test(
      m,
    ),
  )
  if (bad.length > 0) {
    throw new Error(`Runtime contract error(s):\n${bad.join('\n---\n')}`)
  }
}
