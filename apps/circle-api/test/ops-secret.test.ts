import { describe, expect, it } from 'vitest'
import { opsSecretOk } from '../src/lib/ops-secret'

function req(headers: Record<string, string>): Request {
  return new Request('https://circle.example/internal/x', { method: 'POST', headers })
}

describe('opsSecretOk', () => {
  it('rejects missing expected secret', () => {
    expect(opsSecretOk(req({ 'X-Ops-Secret': 'abc' }), undefined)).toBe(false)
    expect(opsSecretOk(req({ 'X-Ops-Secret': 'abc' }), '')).toBe(false)
  })

  it('accepts X-Ops-Secret exact match', () => {
    expect(opsSecretOk(req({ 'X-Ops-Secret': 's3cret' }), 's3cret')).toBe(true)
  })

  it('accepts Authorization Bearer', () => {
    expect(opsSecretOk(req({ Authorization: 'Bearer s3cret' }), 's3cret')).toBe(true)
  })

  it('rejects wrong value and length mismatch', () => {
    expect(opsSecretOk(req({ 'X-Ops-Secret': 'nope' }), 's3cret')).toBe(false)
    expect(opsSecretOk(req({ 'X-Ops-Secret': 's3cret!' }), 's3cret')).toBe(false)
    expect(opsSecretOk(req({}), 's3cret')).toBe(false)
  })
})
