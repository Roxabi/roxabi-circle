import { hashPassword } from 'better-auth/crypto'

// Synthetic fixtures sharing a password also share its salt within this module instance.
const credentials = new Map<string, Promise<string>>()

export const hashFixtureCredential: typeof hashPassword = (password) => {
  const existing = credentials.get(password)
  if (existing) return existing

  const pending = hashPassword(password).catch((error: unknown) => {
    if (credentials.get(password) === pending) credentials.delete(password)
    throw error
  })
  credentials.set(password, pending)
  return pending
}
