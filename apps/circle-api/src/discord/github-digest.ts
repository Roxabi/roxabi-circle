/**
 * Worker GitHub digest scrape-post is retired.
 *
 * `#daily-digest` stays. Veilleur tech briefing is the source; Lyra posts
 * news + repos as **one** message. Gateway still enforces bots-only top-level.
 *
 * This entry is the only scrape/post gate. Cron leftovers and
 * `POST /internal/github-digest` must return here without I/O.
 */

import type { Env } from '../types'

/** Compile-time off. No env / secret can re-arm scrape-post. */
export const GITHUB_DIGEST_SCRAPE_ENABLED = false

export type DigestRunResult = {
  ok: boolean
  skipped?: string
  postedId?: string
  picked?: string[]
  error?: string
  /** Candidates whose GitHub metadata could not be read (never evaluated). */
  metaFailures?: number
}

export async function runGithubDigest(
  _env: Env,
  _opts?: { now?: Date; skipTimeCheck?: boolean },
): Promise<DigestRunResult> {
  return { ok: true, skipped: 'disabled' }
}
