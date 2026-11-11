/**
 * Minimal read-only GitHub REST client for the guard (data only: it never executes anything it
 * fetches). `fetch` is injected so the self-test runs with no network.
 */
import type { FetchFn } from './registry.ts'

type ApiResult = { status: number; body: unknown }

export interface GitHubApi {
  /** JSON GET. Any status is returned (404 / 422 are answers, not errors); network errors throw. */
  get(path: string): Promise<ApiResult>
  /** Raw file bytes as text at a ref; undefined on 404. */
  raw(path: string): Promise<string | undefined>
}

export function createGitHubApi(
  token: string | undefined,
  fetchFn: FetchFn = (u, i) => fetch(u, i),
): GitHubApi {
  const headers = (accept: string): Record<string, string> => ({
    accept,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'kit-deps-guard',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  })
  const url = (path: string) => `https://api.github.com${path}`

  return {
    async get(path) {
      const res = await fetchFn(url(path), {
        headers: headers('application/vnd.github+json'),
        signal: AbortSignal.timeout(60_000),
      })
      const text = await res.text()
      return { status: res.status, body: text ? JSON.parse(text) : null }
    },
    async raw(path) {
      const res = await fetchFn(url(path), {
        headers: headers('application/vnd.github.raw+json'),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.status === 404) return
      if (!res.ok) throw new Error(`GitHub raw ${path}: HTTP ${res.status}`)
      return res.text()
    },
  }
}
