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
}

export type KitR2ObjectBody = {
  key: string
  text(): Promise<string>
}

/** Join path segments under a product/demo prefix. Rejects traversal. */
export function joinObjectKey(prefix: string, ...parts: string[]): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '')
  const segments: string[] = []
  for (const part of parts) {
    for (const seg of part.split('/')) {
      if (!seg || seg === '.') continue
      if (seg === '..') {
        throw new Error('path traversal rejected')
      }
      segments.push(seg)
    }
  }
  return [cleanPrefix, ...segments].filter(Boolean).join('/')
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
