import { describe, expect, it } from 'vitest'
import { deleteObject, getObject, joinObjectKey, type KitR2Bucket, putObject } from './index'

function memoryBucket(): KitR2Bucket & { keys: () => string[] } {
  const store = new Map<string, string>()
  return {
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value))
      return { key }
    },
    async get(key) {
      const body = store.get(key)
      if (body === undefined) return null
      return {
        key,
        async text() {
          return body
        },
      }
    },
    async delete(key) {
      store.delete(key)
    },
    keys: () => [...store.keys()],
  }
}

describe('joinObjectKey', () => {
  it('joins under demo prefix', () => {
    expect(joinObjectKey('demo', 'note-1', 'file.txt')).toBe('demo/note-1/file.txt')
  })

  it('rejects path traversal', () => {
    expect(() => joinObjectKey('demo', '../secret')).toThrow(/traversal/)
  })

  it('rejects nested .. segments', () => {
    expect(() => joinObjectKey('demo', 'a/../../b')).toThrow(/traversal/)
  })
})

describe('R2 put/get/delete round-trip under demo/', () => {
  it('writes and reads attachment via putObject/getObject', async () => {
    const bucket = memoryBucket()
    const key = joinObjectKey('demo', 'note-xyz', 'attachment.txt')
    expect(key.startsWith('demo/')).toBe(true)
    expect(key.startsWith('share/')).toBe(false)

    await putObject(bucket, key, 'payload-bytes', {
      httpMetadata: { contentType: 'text/plain' },
    })
    const obj = await getObject(bucket, key)
    expect(obj).not.toBeNull()
    expect(await obj!.text()).toBe('payload-bytes')
    expect(bucket.keys()).toEqual([key])

    await deleteObject(bucket, key)
    expect(await getObject(bucket, key)).toBeNull()
  })
})
