/** Same X-Ops-Secret / Bearer compare as circle-api opsSecretOk. */
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
