import { AppError, decodeListCursor, encodeListCursor } from '@kit/core'
import { keysetSchema } from './admission-validation'
import { parseRepositoryInput } from './validation'

export type AdmissionKeyset = {
  asOf: number
  lastCheckAt: number
  createdAt: number
  kind: 'user' | 'organization'
  id: string
}

export function parseAdmissionCursor(cursor: string, now: number): AdmissionKeyset {
  const keyset = parseRepositoryInput(keysetSchema, decodeListCursor(cursor))
  if (keyset.asOf !== now) throw AppError.validation('Invalid notifications input')
  return keyset
}

export function encodeAdmissionCursor(keyset: AdmissionKeyset): string {
  return encodeListCursor(keyset)
}
