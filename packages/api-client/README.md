# `@gosilex/api-client`

Isomorphic HTTP helper for GOSILEX kit apps: `fetch` + kit error envelope + cookie credentials.

## Install (workspace)

```json
"@gosilex/api-client": "workspace:*"
```

## Usage

```ts
import { createApiClient, ApiError, apiErrorToMessage } from '@gosilex/api-client'

const { apiFetch } = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  credentials: 'include', // default
  onUnauthorized: () => { /* clear session / redirect */ },
})

try {
  const me = await apiFetch<{ subject: string }>('/api/me')
} catch (e) {
  if (e instanceof ApiError) {
    toast.error(apiErrorToMessage(e, {
      fallback: 'Error',
      messages: { UNAUTHORIZED: 'Please sign in' },
    }))
  }
}
```

## Non-goals

- React Query hooks / toast UI
- Route constants or product paths
- Hardcoded FR/EN strings (i18n stays in the app)
- Cookie parsing (Better Auth owns sessions)

See epic #18 / child #81 and `example-web` `src/lib/api.ts` for the app wrapper pattern.
