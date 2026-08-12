/** Extract domain from an email address (after last @). */
export function emailDomain(address: string): string | null {
  const s = address.trim().toLowerCase()
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return null
  return s.slice(at + 1)
}

/** Exact domain match (no parent-domain wildcard). */
export function isRecipientDomainAllowed(to: string, allowDomains: string[]): boolean {
  if (allowDomains.length === 0) return true
  const domain = emailDomain(to)
  if (domain == null) return false
  const allow = new Set(allowDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))
  return allow.has(domain)
}
