/** Minimal R2 surface used by kit helpers (avoids workers-types DOM conflicts in packages). */
export type KitR2Body = string | ArrayBuffer | ArrayBufferView

export type KitR2Bucket = {
  put(
    key: string,
    value: KitR2Body,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  get(key: string): Promise<KitR2ObjectBody | null>
  delete(key: string): Promise<void>
  head?(key: string): Promise<{ key: string } | null>
  list?(opts?: { prefix?: string; limit?: number }): Promise<{
    objects: { key: string }[]
  }>
}

export type KitR2ObjectBody = {
  key: string
  text(): Promise<string>
}

export class StorageError extends Error {
  readonly code: 'PATH_TRAVERSAL' | 'OUTSIDE_PREFIX' | 'IO'
  constructor(code: StorageError['code'], message: string) {
    super(message)
    this.name = 'StorageError'
    this.code = code
  }
}

/** Append path segments, rejecting empty / `.` / `..` (including inside prefix). */
function pushPathSegments(target: string[], part: string): void {
  for (const seg of part.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      throw new StorageError('PATH_TRAVERSAL', 'path traversal rejected')
    }
    target.push(seg)
  }
}

/**
 * Join path segments under a product/demo prefix.
 * Rejects traversal in **prefix and parts** (e.g. `demo/../x`).
 */
export function joinObjectKey(prefix: string, ...parts: string[]): string {
  const segments: string[] = []
  pushPathSegments(segments, prefix)
  for (const part of parts) {
    pushPathSegments(segments, part)
  }
  return segments.join('/')
}

export async function putObject(
  bucket: KitR2Bucket,
  key: string,
  body: KitR2Body,
  options?: { httpMetadata?: { contentType?: string } },
): Promise<unknown> {
  return bucket.put(key, body, options)
}

export async function getObject(bucket: KitR2Bucket, key: string): Promise<KitR2ObjectBody | null> {
  return bucket.get(key)
}

export async function deleteObject(bucket: KitR2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}

/**
 * Prefix-enforced R2 client — every key is joined under `basePrefix`.
 * Prefer this over free put/get/delete to avoid accidental cross-prefix writes.
 */
export class StorageClient {
  constructor(
    private readonly bucket: KitR2Bucket,
    private readonly basePrefix: string,
  ) {
    if (!basePrefix || basePrefix.includes('..')) {
      throw new StorageError('PATH_TRAVERSAL', 'invalid base prefix')
    }
  }

  key(...parts: string[]): string {
    return joinObjectKey(this.basePrefix, ...parts)
  }

  private assertUnderPrefix(key: string): void {
    const root = this.basePrefix.replace(/\/+$/, '')
    if (key !== root && !key.startsWith(`${root}/`)) {
      throw new StorageError('OUTSIDE_PREFIX', 'key outside base prefix')
    }
  }

  async put(
    parts: string[],
    body: KitR2Body,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<string> {
    const key = this.key(...parts)
    this.assertUnderPrefix(key)
    await this.bucket.put(key, body, options)
    return key
  }

  async get(parts: string[]): Promise<KitR2ObjectBody | null> {
    const key = this.key(...parts)
    this.assertUnderPrefix(key)
    return this.bucket.get(key)
  }

  async delete(parts: string[]): Promise<void> {
    const key = this.key(...parts)
    this.assertUnderPrefix(key)
    await this.bucket.delete(key)
  }

  async head(parts: string[]): Promise<{ key: string } | null> {
    const key = this.key(...parts)
    this.assertUnderPrefix(key)
    if (typeof this.bucket.head === 'function') {
      return this.bucket.head(key)
    }
    const obj = await this.bucket.get(key)
    return obj ? { key: obj.key } : null
  }

  async list(opts?: { subPrefix?: string; limit?: number }): Promise<{ key: string }[]> {
    const prefix = opts?.subPrefix
      ? this.key(...opts.subPrefix.split('/').filter(Boolean))
      : joinObjectKey(this.basePrefix)
    this.assertUnderPrefix(prefix)
    if (typeof this.bucket.list === 'function') {
      const res = await this.bucket.list({ prefix: `${prefix}/`, limit: opts?.limit })
      return res.objects.map((o) => ({ key: o.key }))
    }
    return []
  }
}
