import { describe, expect, it } from 'vitest'
import { AppError } from './errors'
import {
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  isRepresentableEpochMs,
  MAX_REPRESENTABLE_EPOCH_MS,
  MIN_REPRESENTABLE_EPOCH_MS,
  takeListPage,
} from './list-page'

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function expectInvalidCursor(cursor: string): string {
  try {
    decodeListCursor(cursor)
    expect.unreachable('decodeListCursor should reject an invalid cursor')
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    const appError = error as AppError
    expect(appError.code).toBe('VALIDATION_ERROR')
    expect(appError.status).toBe(400)
    expect(appError.message).not.toContain('createdAt')
    expect(appError.message).not.toContain('secretField')
    return appError.message
  }
}

describe('isRepresentableEpochMs', () => {
  it('accepts integer milliseconds within the Date representable range', () => {
    expect(isRepresentableEpochMs(0)).toBe(true)
    expect(isRepresentableEpochMs(1_754_000_000_123)).toBe(true)
    expect(isRepresentableEpochMs(MIN_REPRESENTABLE_EPOCH_MS)).toBe(true)
    expect(isRepresentableEpochMs(MAX_REPRESENTABLE_EPOCH_MS)).toBe(true)
  })

  it('rejects non-finite, fractional, and out-of-range values', () => {
    expect(isRepresentableEpochMs(Number.NaN)).toBe(false)
    expect(isRepresentableEpochMs(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isRepresentableEpochMs(Number.NEGATIVE_INFINITY)).toBe(false)
    expect(isRepresentableEpochMs(1.5)).toBe(false)
    expect(isRepresentableEpochMs(1e300)).toBe(false)
    expect(isRepresentableEpochMs(-1e300)).toBe(false)
    expect(isRepresentableEpochMs(MIN_REPRESENTABLE_EPOCH_MS - 1)).toBe(false)
    expect(isRepresentableEpochMs(MAX_REPRESENTABLE_EPOCH_MS + 1)).toBe(false)
  })
})

describe('clampListLimit', () => {
  it('defaults to 50 and clamps to the inclusive 1..100 range', () => {
    expect(clampListLimit(undefined)).toBe(50)
    expect(clampListLimit(0)).toBe(1)
    expect(clampListLimit(999)).toBe(100)
  })
})

describe('list cursor', () => {
  it('round-trips a Unicode keyset through an opaque cursor', () => {
    const keyset = {
      createdAt: 1_754_000_000_123,
      id: 'élément-日本語',
    }

    const cursor = encodeListCursor(keyset)

    expect(cursor).not.toContain(keyset.id)
    expect(decodeListCursor(cursor)).toEqual(keyset)
  })

  it('rejects malformed and non-keyset payloads with one generic validation message', () => {
    const malformedCursors = [
      '%%%not-base64%%%',
      base64Url('not JSON'),
      base64Url('[1, 2]'),
      base64Url('null'),
      base64Url('{"createdAt":1,"id":{"secretField":"value"}}'),
      base64Url('{"createdAt":true,"id":"abc"}'),
      base64Url('{"createdAt":1e400,"id":"abc"}'),
    ]

    const messages = malformedCursors.map(expectInvalidCursor)

    expect(new Set(messages).size).toBe(1)
    expect(messages[0]).toEqual(expect.any(String))
    expect(messages[0]?.length).toBeGreaterThan(0)
  })

  it('rejects the legacy public createdAt:id cursor format', () => {
    expectInvalidCursor('123:abc')
  })
})

describe('takeListPage', () => {
  const rows = [
    { createdAt: 30, id: 'trois' },
    { createdAt: 20, id: 'deux' },
    { createdAt: 10, id: 'un' },
  ]
  const keysetOf = (row: (typeof rows)[number]) => ({
    createdAt: row.createdAt,
    id: row.id,
  })

  it('returns no next cursor when exactly limit rows were fetched', () => {
    expect(takeListPage(rows.slice(0, 2), 2, keysetOf)).toEqual({
      items: rows.slice(0, 2),
      nextCursor: null,
    })
  })

  it('keeps limit rows and cursors from the last kept row when limit+1 were fetched', () => {
    const page = takeListPage(rows, 2, keysetOf)

    expect(page.items).toEqual(rows.slice(0, 2))
    expect(page.nextCursor).not.toBeNull()
    expect(decodeListCursor(page.nextCursor as string)).toEqual(keysetOf(rows[1]!))
  })
})
