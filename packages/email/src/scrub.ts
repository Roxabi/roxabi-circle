/**
 * Collapse Unicode line terminators to space; collapse runs of spaces.
 * Header-safe — prevents CR/LF/NEL/LS/PS injection into Subject/From/To.
 */
export function scrubHeaderLine(s: string): string {
  return s.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').replace(/ +/g, ' ')
}

/** String or `{ email, name? }` From address (CF / Resend shape). */
export type ScrubableAddress = string | { email: string; name?: string }

/** Scrub From (and optional display name) via {@link scrubHeaderLine}. */
export function scrubEmailAddress(from: ScrubableAddress): ScrubableAddress {
  if (typeof from === 'string') return scrubHeaderLine(from).trim()
  return {
    email: scrubHeaderLine(from.email).trim(),
    ...(from.name != null ? { name: scrubHeaderLine(from.name).trim() } : {}),
  }
}
