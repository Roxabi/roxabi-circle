export async function hashVerificationIdentifier(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identifier))
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '')
}

export function resetPasswordIdentifier(token: string): Promise<string> {
  return hashVerificationIdentifier(`reset-password:${token}`)
}
