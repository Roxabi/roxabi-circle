# `@kit/storage`

R2 helpers for Chemin A kit apps: safe keys, prefix-enforced client, light **PUT** presign.

## Surfaces

| Export | Role |
|--------|------|
| `joinObjectKey` / `assertObjectKey` | Path join; reject `..` / empty |
| `StorageClient` | Prefix-enforced put/get/delete/head/list/**presign** — **product path** |
| `StorageClient.presign(signer, { parts, … })` | Preferred product presign (prefix-safe key + sign) |
| `createPresignedUrl(signer, input)` | Advanced: path-safe sign only — **no** prefix; full trusted keys |
| `createMockPresignSigner` | Local/CI mock (no CF account / secrets) |

There are **no** free `putObject` / `getObject` / `deleteObject` helpers. Every I/O goes through
`StorageClient` so writes stay under `basePrefix`.

## Presign (kit v1)

- **Preferred path:** `client.presign(signer, { parts })` — builds the key under
  `basePrefix`, asserts prefix, then signs. Returns `{ url, method, headers?, expiresAt, key }`.
- **Advanced:** `createPresignedUrl(signer, { key, … })` — validates path safety only
  (no product prefix). Use when you already hold a full trusted key (e.g. from `client.key`).
- **PUT only** (A25 light helper — no video multipart).
- Package **never** holds R2 secrets — apps inject a `PresignSigner` (mock or future S3/aws4fetch).
- Example app: `PRESIGN_MODE=mock` (default) · `s3` **fail-closed** until a real signer is wired.

```ts
import { createMockPresignSigner, StorageClient } from '@kit/storage'

const client = new StorageClient(bucket, 'demo')
const signer = createMockPresignSigner()

// Preferred: prefix-safe parts → key + sign
const { url, headers, expiresAt, key } = await client.presign(signer, {
  parts: ['user', 'upload-id', 'file.bin'],
  expiresIn: 300,
  contentType: 'application/octet-stream',
})

// Advanced (custom full key — no prefix enforcement):
// import { createPresignedUrl } from '@kit/storage'
// await createPresignedUrl(signer, { key, method: 'PUT', expiresIn: 300 })
```

Demo HTTP (auth required):

```bash
# after cookie session on $API (see root README Kit patterns B6)
curl -sS -b /tmp/kit-cj -c /tmp/kit-cj -X POST "$API/api/uploads/presign" \
  -H 'content-type: application/json' -H "Origin: $ORIGIN" \
  -d '{"filename":"file.bin","contentType":"application/octet-stream","size":1024}'

curl -sS -b /tmp/kit-cj -c /tmp/kit-cj -X POST "$API/api/uploads/<uploadId>/complete" \
  -H 'content-type: application/json' -H "Origin: $ORIGIN" \
  -d '{"key":"<key from presign>"}'
```

See `apps/example-api` routes `uploads` + tests `uploads.test.ts`.
