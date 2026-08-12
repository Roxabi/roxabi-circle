# `@kit/storage`

R2 helpers for Chemin A kit apps: safe keys, prefix-enforced client, light **PUT** presign.

## Surfaces

| Export | Role |
|--------|------|
| `joinObjectKey` / `assertObjectKey` | Path join; reject `..` / empty |
| `putObject` / `getObject` / `deleteObject` | Free helpers (key must be safe) — **escape hatch** |
| `StorageClient` | Prefix-enforced put/get/delete/head/list — **prefer this** |
| `createPresignedUrl(signer, input)` | Validate key then sign via app `PresignSigner` |
| `createMockPresignSigner` | Local/CI mock (no CF account / secrets) |

## Free helpers = escape hatch

`putObject` / `getObject` / `deleteObject` / unprefixed `createPresignedUrl` only
reject empty/`..` keys — they do **not** scope writes under a product prefix.

**Products should use `StorageClient`** so every key is joined under `basePrefix`
and cannot stray outside it. Free helpers remain for demos, tests, and rare
low-level wiring; they are marked `@deprecated` in favor of the client.

For presign, pass keys from `client.key(...parts)` (not raw strings) so signed
URLs stay under the same prefix as put/get/delete.

## Presign (kit v1)

- **PUT only** (A25 light helper — no video multipart).
- Package **never** holds R2 secrets — apps inject a `PresignSigner` (mock or future S3/aws4fetch).
- Example app: `PRESIGN_MODE=mock` (default) · `s3` **fail-closed** until a real signer is wired.

```ts
import {
  createMockPresignSigner,
  createPresignedUrl,
  StorageClient,
} from '@kit/storage'

const client = new StorageClient(bucket, 'demo')
const signer = createMockPresignSigner()
const { url, headers, expiresAt } = await createPresignedUrl(signer, {
  key: client.key('user', 'upload-id', 'file.bin'), // prefer StorageClient.key
  method: 'PUT',
  expiresIn: 300,
  contentType: 'application/octet-stream',
})
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
