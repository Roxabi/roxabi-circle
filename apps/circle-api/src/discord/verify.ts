/**
 * Discord Interactions Ed25519 verification (Web Crypto).
 * https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0) throw new Error('invalid hex length')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export async function verifyDiscordRequest(
  request: Request,
  publicKeyHex: string,
): Promise<{ ok: true; body: string } | { ok: false; status: number }> {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  if (!signature || !timestamp || !publicKeyHex) {
    return { ok: false, status: 401 }
  }

  const body = await request.text()
  const message = new TextEncoder().encode(timestamp + body)

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKeyHex),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(signature),
      message,
    )
    if (!valid) return { ok: false, status: 401 }
    return { ok: true, body }
  } catch {
    return { ok: false, status: 401 }
  }
}
