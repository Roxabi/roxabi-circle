import { describe, expect, it } from 'vitest'
import { parseInvitationId } from './invitation-id'

const valid = `inv_${'a'.repeat(32)}`

describe('parseInvitationId', () => {
  it('accepts inv_ + 32 lowercase hex', () => {
    expect(parseInvitationId(valid)).toBe(valid)
    expect(parseInvitationId(`  ${valid}  `)).toBe(valid)
  })

  it('rejects traversal, query, and wrong shape', () => {
    expect(parseInvitationId('../keys')).toBeNull()
    expect(parseInvitationId('inv_../keys')).toBeNull()
    expect(parseInvitationId(`${valid}?x=1`)).toBeNull()
    expect(parseInvitationId(`${valid}/accept`)).toBeNull()
    expect(parseInvitationId('inv_ABCDEF0123456789abcdef0123456789')).toBeNull()
    expect(parseInvitationId('inv_short')).toBeNull()
    expect(parseInvitationId('abc')).toBeNull()
    expect(parseInvitationId('')).toBeNull()
    expect(parseInvitationId(undefined)).toBeNull()
  })
})
