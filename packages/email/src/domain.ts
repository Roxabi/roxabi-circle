/**
 * Mailbox + recipient domain helpers (shared Workers + Node SMTP).
 *
 * Envelope shape matches SMTP fail-closed: printable ASCII, exactly one `@`,
 * no spaces/commas/`<>`/header delimiters. Domain allowlist only runs after
 * a single valid mailbox is established (no last-@ spoof).
 */

/**
 * Fail-closed mailbox (addr-spec) after header scrub.
 * Same rules as Node SMTP envelope validation.
 */
export function isValidMailboxAddress(addr: string): boolean {
  if (addr.length === 0 || addr.length > 254) return false
  const at = addr.indexOf('@')
  if (at <= 0 || at !== addr.lastIndexOf('@') || at === addr.length - 1) return false
  for (let i = 0; i < addr.length; i++) {
    const c = addr.charCodeAt(i)
    // printable ASCII only (0x21–0x7e), exclude common SMTP/header delimiters
    if (c < 0x21 || c > 0x7e) return false
    if (
      c === 0x22 || // "
      c === 0x2c || // ,
      c === 0x3a || // :
      c === 0x3b || // ;
      c === 0x3c || // <
      c === 0x3e || // >
      c === 0x5c // \
    ) {
      return false
    }
  }
  return true
}

/** Extract domain from a single valid mailbox (after exactly one @). */
export function emailDomain(address: string): string | null {
  const s = address.trim().toLowerCase()
  if (!isValidMailboxAddress(s)) return null
  const at = s.indexOf('@')
  return s.slice(at + 1)
}

/**
 * Exact domain match (no parent-domain wildcard).
 * Invalid / multi-token mailboxes → not allowed (fail-closed).
 */
export function isRecipientDomainAllowed(to: string, allowDomains: string[]): boolean {
  if (allowDomains.length === 0) return true
  const domain = emailDomain(to)
  if (domain == null) return false
  const allow = new Set(allowDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))
  return allow.has(domain)
}
