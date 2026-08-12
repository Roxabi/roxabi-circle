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

/**
 * Reject empty keys and `..` segments on free helpers.
 * Prefer {@link StorageClient} for prefix-enforced product keys.
 */
export function assertObjectKey(key: string): void {
  if (!key?.trim()) {
    throw new StorageError('PATH_TRAVERSAL', 'empty object key rejected')
  }
  pushPathSegments([], key)
}

/**
 * @deprecated Prefer {@link StorageClient} (prefix-enforced). Free helper —
 * no base-prefix isolation; escape hatch for demos / low-level wiring only.
 */
export async function putObject(
  bucket: KitR2Bucket,
  key: string,
  body: KitR2Body,
  options?: { httpMetadata?: { contentType?: string } },
): Promise<unknown> {
  assertObjectKey(key)
  return bucket.put(key, body, options)
}

/**
 * @deprecated Prefer {@link StorageClient} (prefix-enforced). Free helper —
 * no base-prefix isolation; escape hatch for demos / low-level wiring only.
 */
export async function getObject(bucket: KitR2Bucket, key: string): Promise<KitR2ObjectBody | null> {
  assertObjectKey(key)
  return bucket.get(key)
}

/**
 * @deprecated Prefer {@link StorageClient} (prefix-enforced). Free helper —
 * no base-prefix isolation; escape hatch for demos / low-level wiring only.
 */
export async function deleteObject(bucket: KitR2Bucket, key: string): Promise<void> {
  assertObjectKey(key)
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

  /**
   * Preferred product presign path: join `parts` under `basePrefix`, assert prefix,
   * then sign via {@link createPresignedUrl}. Prefer this over free-form keys +
   * `createPresignedUrl` so signed URLs cannot escape the product prefix.
   */
  async presign(
    signer: PresignSigner,
    input: {
      parts: string[]
      method?: PresignMethod
      /** seconds — clamped to [60, 3600]; default 300 */
      expiresIn?: number
      contentType?: string
    },
  ): Promise<PresignResult & { key: string }> {
    const key = this.key(...input.parts)
    this.assertUnderPrefix(key)
    const result = await createPresignedUrl(signer, {
      key,
      method: input.method ?? 'PUT',
      expiresIn: input.expiresIn ?? 300,
      contentType: input.contentType,
    })
    return { ...result, key }
  }
}

// ── Light presign (A25 kit — PUT only; secrets never in package) ─────────────

export type PresignMethod = 'PUT'

export type PresignInput = {
  key: string
  method: PresignMethod
  /** seconds — clamped to [60, 3600] */
  expiresIn: number
  contentType?: string
}

export type PresignResult = {
  url: string
  method: PresignMethod
  headers?: Record<string, string>
  expiresAt: number
}

export type PresignSigner = {
  sign(input: PresignInput): Promise<PresignResult>
}

function clampExpiresIn(seconds: number): number {
  if (!Number.isFinite(seconds)) return 300
  return Math.min(3600, Math.max(60, Math.floor(seconds)))
}

/**
 * Low-level presign: validate key safety then delegate to an app-provided signer
 * (S3 or mock). Package never holds R2 secrets.
 *
 * **Advanced / custom keys** (not deprecated). Path-safe only — does **not**
 * enforce a product prefix. Prefer {@link StorageClient.presign} so keys are
 * joined under `basePrefix`; use this only when you already have a full key
 * (e.g. from `client.key` or a trusted store).
 */
export async function createPresignedUrl(
  signer: PresignSigner,
  input: PresignInput,
): Promise<PresignResult> {
  assertObjectKey(input.key)
  if (input.method !== 'PUT') {
    throw new StorageError('IO', 'only PUT presign is supported in kit v1')
  }
  const expiresIn = clampExpiresIn(input.expiresIn)
  return signer.sign({
    key: input.key,
    method: 'PUT',
    expiresIn,
    contentType: input.contentType,
  })
}

/** Deterministic mock signer for local/CI — does not contact Cloudflare. */
export function createMockPresignSigner(opts?: {
  baseUrl?: string
  store?: Map<string, string>
}): PresignSigner {
  const baseUrl = opts?.baseUrl ?? 'https://presign.mock.local'
  const store = opts?.store
  return {
    async sign(input) {
      const expiresAt = Date.now() + input.expiresIn * 1000
      const url = `${baseUrl}/${encodeURIComponent(input.key)}?mock=1&exp=${expiresAt}`
      if (store) store.set(input.key, url)
      return {
        url,
        method: 'PUT',
        headers: input.contentType ? { 'Content-Type': input.contentType } : undefined,
        expiresAt,
      }
    },
  }
}
