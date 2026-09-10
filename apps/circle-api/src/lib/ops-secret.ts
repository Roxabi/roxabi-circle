/**
 * Shared ops auth for /internal/* (Gateway ensure, digest, voice-record spike).
 * Header X-Ops-Secret or Authorization: Bearer … vs GATEWAY_OPS_SECRET.
 * Length leak is accepted for this ops header.
 */
export function opsSecretOk(request: Request, expected: string | undefined): boolean {
  if (!expected) return false
  const header =
    request.headers.get('X-Ops-Secret') ??
    request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (header.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
