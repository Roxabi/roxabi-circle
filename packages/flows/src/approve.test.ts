import { describe, expect, it } from 'vitest'
import { flowApprovalEventType } from './approve'

describe('flowApprovalEventType', () => {
  it('differs per task id and stays inside the CF event-type charset', async () => {
    const gate = await flowApprovalEventType('gate')
    const other = await flowApprovalEventType('gate2')
    expect(gate).not.toBe(other)
    expect(gate).toMatch(/^[A-Za-z0-9_-]{1,100}$/)
    expect(other).toMatch(/^[A-Za-z0-9_-]{1,100}$/)
  })
})
