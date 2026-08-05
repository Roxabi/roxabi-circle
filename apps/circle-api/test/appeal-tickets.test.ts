import { describe, expect, it } from 'vitest'
import {
  decideTicketOpen,
  parseTicketUserIdFromChannelName,
  ticketChannelName,
} from '../src/discord/appeal-tickets'

describe('decideTicketOpen', () => {
  it('rejects members', () => {
    const d = decideTicketOpen({ isMember: true, existingTicketChannelId: null })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('is_member')
  })

  it('rejects second ticket', () => {
    const d = decideTicketOpen({
      isMember: false,
      existingTicketChannelId: '99',
    })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('already_open')
  })

  it('allows first ticket for non-member', () => {
    const d = decideTicketOpen({ isMember: false, existingTicketChannelId: null })
    expect(d.ok).toBe(true)
  })
})

describe('ticket channel naming', () => {
  it('round-trips user id', () => {
    const id = '389408866774810625'
    const name = ticketChannelName(id)
    expect(name).toBe(`appeal-${id}`)
    expect(parseTicketUserIdFromChannelName(name)).toBe(id)
  })

  it('rejects non-ticket names', () => {
    expect(parseTicketUserIdFromChannelName('general')).toBeNull()
    expect(parseTicketUserIdFromChannelName('appeal-nope')).toBeNull()
  })
})
