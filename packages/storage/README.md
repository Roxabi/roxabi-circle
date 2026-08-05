# `@kit/storage`

R2 helpers for Chemin A kit apps: safe keys, prefix-enforced client, light **PUT** presign.

## Surfaces

| Export | Role |
|--------|------|
| `joinObjectKey` / `assertObjectKey` | Path join; reject `..` / empty |
| `putObject` / `getObject` / `deleteObject` | Free helpers (key must be safe) |
| `StorageClient` | Prefix-enforced put/get/delete/head/list |
| `createPresignedUrl(signer, input)` | Validate key then sign via app `PresignSigner` |
| `createMockPresignSigner` | Local/CI mock (no CF account / secrets) |

## Presign (kit v1)

- **PUT only** (A25 light helper — no video multipart).
- Package **never** holds R2 secrets — apps inject a `PresignSigner` (mock or future S3/aws4fetch).
- Example app: `PRESIGN_MODE=mock` (default) · `s3` **fail-closed** until a real signer is wired.

```ts
import { createMockPresignSigner, createPresignedUrl } from '@kit/storage'

const signer = createMockPresignSigner()
const { url, headers, expiresAt } = await createPresignedUrl(signer, {
  key: 'demo/user/upload-id/file.bin',
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
