/**
 * Content-address digests for plans / registry tool sets.
 * FNV-1a 32-bit hex — **index only**, not cryptographic integrity.
 */

/** Stable JSON-like stringify (sorted object keys) for digest input. Not MCP `stableJsonWire` — do not lift a shared stringify to `@kit/core` (M-04). */
export function stableDigestInput(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableDigestInput(v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableDigestInput(obj[k])}`).join(',')}}`
}

/** FNV-1a 32-bit → 8-char hex. Not a crypto integrity control. */
export function fnv1a32Hex(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * SHA-256 hex of raw bytes. Republish identity is this over UTF-8 `yaml_source`.
 * Not a replacement for `digestPlan` (FNV-1a index only).
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy)
  const view = new Uint8Array(digest)
  let hex = ''
  for (const byte of view) hex += byte.toString(16).padStart(2, '0')
  return hex
}
