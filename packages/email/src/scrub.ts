/**
 * Collapse Unicode line terminators to space; collapse runs of spaces.
 * Header-safe — prevents CR/LF/NEL/LS/PS injection into Subject/From/To.
 */
export function scrubHeaderLine(s: string): string {
  return s.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').replace(/ +/g, ' ')
}
