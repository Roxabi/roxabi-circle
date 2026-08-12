import { describe, expect, it } from 'vitest'
import {
  createMockPresignSigner,
  createPresignedUrl,
  deleteObject,
  getObject,
  joinObjectKey,
  type KitR2Bucket,
  putObject,
  StorageClient,
  StorageError,
} from './index'

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
    async head(key) {
      return store.has(key) ? { key } : null
    },
    async list(opts) {
      const p = opts?.prefix ?? ''
      const objects = [...store.keys()]
        .filter((k) => k.startsWith(p))
        .slice(0, opts?.limit ?? 1000)
        .map((key) => ({ key }))
      return { objects }
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

  it('rejects traversal in prefix', () => {
    expect(() => joinObjectKey('demo/../other', 'a')).toThrow(/traversal/)
    expect(() => joinObjectKey('../escape', 'a')).toThrow(/traversal/)
  })
})

describe('free helpers reject unsafe keys', () => {
  it('rejects path traversal on putObject/getObject/deleteObject', async () => {
    const bucket = memoryBucket()
    await expect(putObject(bucket, 'demo/../secret', 'x')).rejects.toThrow(/traversal/)
    await expect(getObject(bucket, '../escape')).rejects.toThrow(/traversal/)
    await expect(deleteObject(bucket, 'a/../../b')).rejects.toThrow(/traversal/)
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

describe('StorageClient', () => {
  it('forces base prefix on put/get/list/head', async () => {
    const bucket = memoryBucket()
    const client = new StorageClient(bucket, 'demo')
    const key = await client.put(['n1', 'a.txt'], 'hello')
    expect(key).toBe('demo/n1/a.txt')
    expect(await (await client.get(['n1', 'a.txt']))!.text()).toBe('hello')
    expect(await client.head(['n1', 'a.txt'])).toEqual({ key: 'demo/n1/a.txt' })
    const listed = await client.list({ subPrefix: 'n1' })
    expect(listed.some((o) => o.key === 'demo/n1/a.txt')).toBe(true)
  })

  it('rejects invalid base prefix', () => {
    expect(() => new StorageClient(memoryBucket(), 'a/../b')).toThrow(StorageError)
  })

  it('presign builds key under prefix and calls signer', async () => {
    const client = new StorageClient(memoryBucket(), 'demo')
    const signedKeys: string[] = []
    const signer = {
      async sign(input: { key: string; method: 'PUT'; expiresIn: number; contentType?: string }) {
        signedKeys.push(input.key)
        return {
          url: `https://mock.test/${encodeURIComponent(input.key)}`,
          method: 'PUT' as const,
          headers: input.contentType ? { 'Content-Type': input.contentType } : undefined,
          expiresAt: Date.now() + input.expiresIn * 1000,
        }
      },
    }

    const res = await client.presign(signer, {
      parts: ['user', 'u1', 'file.bin'],
      expiresIn: 300,
      contentType: 'application/octet-stream',
    })

    expect(res.key).toBe('demo/user/u1/file.bin')
    expect(signedKeys).toEqual(['demo/user/u1/file.bin'])
    expect(res.method).toBe('PUT')
    expect(res.url).toContain(encodeURIComponent('demo/user/u1/file.bin'))
    expect(res.headers?.['Content-Type']).toBe('application/octet-stream')
  })

  it('presign rejects path traversal in parts', async () => {
    const client = new StorageClient(memoryBucket(), 'demo')
    const signer = createMockPresignSigner()
    await expect(client.presign(signer, { parts: ['../secret'], expiresIn: 300 })).rejects.toThrow(
      /traversal/,
    )
  })
})

describe('createPresignedUrl', () => {
  it('rejects unsafe keys before sign', async () => {
    const signer = createMockPresignSigner()
    await expect(
      createPresignedUrl(signer, {
        key: 'demo/../secret',
        method: 'PUT',
        expiresIn: 300,
      }),
    ).rejects.toThrow(/traversal/)
  })

  it('returns mock PUT url with clamped expiry', async () => {
    const signer = createMockPresignSigner({ baseUrl: 'https://mock.test' })
    const res = await createPresignedUrl(signer, {
      key: 'demo/user/u1/file.bin',
      method: 'PUT',
      expiresIn: 10,
      contentType: 'application/octet-stream',
    })
    expect(res.method).toBe('PUT')
    expect(res.url).toContain('https://mock.test/')
    expect(res.headers?.['Content-Type']).toBe('application/octet-stream')
    // expiresIn 10 → clamped to 60s
    expect(res.expiresAt).toBeGreaterThan(Date.now() + 50_000)
  })
})
