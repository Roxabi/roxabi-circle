import { describe, expect, it } from 'vitest'
import { type ListPage, listQuerySchema } from './list'

describe('listQuerySchema', () => {
  it('coerces a URL limit string to an integer', () => {
    expect(listQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 })
  })

  it.each([0, 101, 1.5])('rejects an invalid limit: %s', (limit) => {
    expect(listQuerySchema.safeParse({ limit }).success).toBe(false)
  })

  it('accepts a cursor up to 512 characters and rejects a longer cursor', () => {
    expect(listQuerySchema.safeParse({ cursor: 'a'.repeat(512) }).success).toBe(true)
    expect(listQuerySchema.safeParse({ cursor: 'a'.repeat(513) }).success).toBe(false)
  })

  it('accepts q when present and leaves it optional', () => {
    expect(listQuerySchema.parse({ q: 'kit' })).toEqual({ q: 'kit' })
    expect(listQuerySchema.parse({})).toEqual({})
  })
})

describe('ListPage', () => {
  it('describes the generic items and nullable cursor envelope', () => {
    const page = {
      items: [{ id: 'item-1' }],
      nextCursor: null,
    } satisfies ListPage<{ id: string }>

    expect(page).toEqual({
      items: [{ id: 'item-1' }],
      nextCursor: null,
    })
  })
})
