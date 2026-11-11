import { describe, expect, it } from 'vitest'
import {
  createMockPresignSigner,
  createPresignedUrl,
  joinObjectKey,
  type KitR2Bucket,
  type PresignInput,
  type PresignResult,
  type PresignSigner,
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
        body: new Blob([body]).stream(),
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

  it('rejects empty and current-dir segments (no silent elision)', () => {
    expect(() => joinObjectKey('demo', '.', 'file.txt')).toThrow(/empty or current-dir/)
    expect(() => joinObjectKey('demo', '', 'file.txt')).toThrow(/empty or current-dir/)
    expect(() => joinObjectKey('demo', 'a/./b')).toThrow(/empty or current-dir/)
    expect(() => joinObjectKey('demo', 'a//b')).toThrow(/empty or current-dir/)
    expect(() => joinObjectKey('.', 'file.txt')).toThrow(/empty or current-dir/)
  })
})

describe('StorageClient', () => {
  it('forces base prefix on put/get/list/head/delete', async () => {
    const bucket = memoryBucket()
    const client = new StorageClient(bucket, 'demo')
    const key = await client.put(['n1', 'a.txt'], 'hello')
    expect(key).toBe('demo/n1/a.txt')
    expect(await (await client.get(['n1', 'a.txt']))!.text()).toBe('hello')
    expect(await client.head(['n1', 'a.txt'])).toEqual({ key: 'demo/n1/a.txt' })
    const listed = await client.list({ subPrefix: 'n1' })
    expect(listed.some((o) => o.key === 'demo/n1/a.txt')).toBe(true)
    await client.delete(['n1', 'a.txt'])
    expect(await client.get(['n1', 'a.txt'])).toBeNull()
    expect(bucket.keys()).toEqual([])
  })

  it('rejects path traversal in parts (put/get/delete)', async () => {
    const client = new StorageClient(memoryBucket(), 'demo')
    await expect(client.put(['../secret'], 'x')).rejects.toThrow(/traversal/)
    await expect(client.get(['../escape'])).rejects.toThrow(/traversal/)
    await expect(client.delete(['a/../../b'])).rejects.toThrow(/traversal/)
  })

  it('round-trips attachment under demo/ via client only', async () => {
    const bucket = memoryBucket()
    const client = new StorageClient(bucket, 'demo')
    const key = await client.put(['note-xyz', 'attachment.txt'], 'payload-bytes', {
      httpMetadata: { contentType: 'text/plain' },
    })
    expect(key).toBe('demo/note-xyz/attachment.txt')
    expect(key.startsWith('demo/')).toBe(true)
    expect(key.startsWith('share/')).toBe(false)

    const obj = await client.get(['note-xyz', 'attachment.txt'])
    expect(obj).not.toBeNull()
    expect(await obj!.text()).toBe('payload-bytes')
    expect(bucket.keys()).toEqual([key])

    await client.delete(['note-xyz', 'attachment.txt'])
    expect(await client.get(['note-xyz', 'attachment.txt'])).toBeNull()
  })

  it('rejects invalid base prefix', () => {
    expect(() => new StorageClient(memoryBucket(), 'a/../b')).toThrow(StorageError)
    expect(() => new StorageClient(memoryBucket(), '.')).toThrow(StorageError)
    expect(() => new StorageClient(memoryBucket(), '')).toThrow(StorageError)
    expect(() => new StorageClient(memoryBucket(), 'demo/.')).toThrow(StorageError)
  })

  it('list rejects empty or current-dir subPrefix (does not widen)', async () => {
    const client = new StorageClient(memoryBucket(), 'demo')
    await expect(client.list({ subPrefix: '.' })).rejects.toThrow(/empty or current-dir/)
    await expect(client.list({ subPrefix: 'n1/.' })).rejects.toThrow(/empty or current-dir/)
    await expect(client.list({ subPrefix: '' })).rejects.toThrow(/empty or current-dir/)
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

describe('createPresignedUrl (prefix required)', () => {
  it('rejects unsafe keys before sign', async () => {
    const signer = createMockPresignSigner()
    await expect(
      createPresignedUrl(signer, {
        key: 'demo/../secret',
        prefix: 'demo',
        method: 'PUT',
        expiresIn: 300,
      }),
    ).rejects.toThrow(/traversal/)
  })

  it('rejects key outside prefix', async () => {
    const signer: PresignSigner = createMockPresignSigner()
    const input: PresignInput = {
      key: 'other/user/u1/file.bin',
      prefix: 'demo',
      method: 'PUT',
      expiresIn: 300,
    }
    await expect(createPresignedUrl(signer, input)).rejects.toThrow(StorageError)
    await expect(
      createPresignedUrl(signer, {
        key: 'other/user/u1/file.bin',
        prefix: 'demo',
        method: 'PUT',
        expiresIn: 300,
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_PREFIX' })
  })

  it('returns mock PUT url with clamped expiry', async () => {
    const signer = createMockPresignSigner({ baseUrl: 'https://mock.test' })
    const res: PresignResult = await createPresignedUrl(signer, {
      key: 'demo/user/u1/file.bin',
      prefix: 'demo',
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
