/**
 * Loopback classifier (not a hostname denylist): IPv4 127/8, IPv6 ::1,
 * IPv4-mapped / IPv4-compatible IPv6 after unmap, DNS `localhost` / RFC 6761
 * `.localhost`, trailing-dot FQDN forms, and unspecified `0.0.0.0` / `::`.
 * SSoT for token hrefs and BA `trustedOrigins` (M-09).
 */

function stripHostDecorations(hostname: string): string {
  let h = hostname.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  while (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

function isIpv4Loopback(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const octets: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false
    const n = Number(p)
    if (n > 255) return false
    octets.push(n)
  }
  return octets[0] === 127
}

function ipv4FromHextets(hiHex: string, loHex: string): string {
  const hi = Number.parseInt(hiHex, 16)
  const lo = Number.parseInt(loHex, 16)
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
}

/** IPv4-mapped IPv6 carrying a dotted or hex 32-bit suffix (`::ffff:7f00:2`). */
function ipv4FromMapped6(host: string): string | undefined {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (dotted) return dotted[1]
  const hex = /^(?:(?:0:){0,5}|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (!(hex?.[1] && hex[2])) return undefined
  return ipv4FromHextets(hex[1], hex[2])
}

/** IPv4-compatible IPv6 (`::a.b.c.d`). WHATWG may serialize as `::HHHH:HHHH` (`::1` excluded). */
function ipv4FromCompatible6(host: string): string | undefined {
  const dotted = /^::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (dotted) return dotted[1]
  const hex = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (!(hex?.[1] && hex[2])) return undefined
  return ipv4FromHextets(hex[1], hex[2])
}

export function isLoopbackHost(hostname: string): boolean {
  const host = stripHostDecorations(hostname)
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  const v4 = ipv4FromMapped6(host) ?? ipv4FromCompatible6(host)
  if (v4) return isIpv4Loopback(v4) || v4 === '0.0.0.0'
  return isIpv4Loopback(host) || host === '0.0.0.0' || host === '::' || host === '0:0:0:0:0:0:0:0'
}
