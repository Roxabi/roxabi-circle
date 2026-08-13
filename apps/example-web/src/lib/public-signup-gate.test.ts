import { describe, expect, it } from 'vitest'
import { optionalNextSearch } from './public-signup-gate'

describe('optionalNextSearch', () => {
  it('keeps a non-empty next string', () => {
    expect(optionalNextSearch({ next: '/invite/accept?invitationId=x' })).toEqual({
      next: '/invite/accept?invitationId=x',
    })
  })

  it('drops empty / missing / non-string next', () => {
    expect(optionalNextSearch({})).toEqual({})
    expect(optionalNextSearch({ next: '' })).toEqual({})
    expect(optionalNextSearch({ next: 1 })).toEqual({})
  })
})
