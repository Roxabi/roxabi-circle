/**
 * Forward #github-to-watch repo URLs to a dedicated Grok Bot webhook
 * (fire-and-forget). Separate from @Lyra mentions. Does not open a Gateway.
 */

import type { GatewayMessage } from './github-watch'

export const GITHUB_WATCH_DIGEST_SOURCE = 'github-to-watch' as const

export const GITHUB_WATCH_DIGEST_PAYLOAD_KEYS = [
  'source',
  'guildId',
  'channelId',
  'messageId',
  'url',
  'authorId',
  'authorUsername',
] as const

export type GithubWatchDigestPayload = {
  source: typeof GITHUB_WATCH_DIGEST_SOURCE
  guildId: string
  channelId: string
  messageId: string
  url: string
  authorId: string
  authorUsername: string
}

export type GithubWatchDigestAction =
  | { type: 'ignore'; reason: string }
  | { type: 'forward'; payload: GithubWatchDigestPayload }

export type GithubWatchDigestRuntime = {
  webhookUrl?: string | null
  webhookSecret?: string | null
  watchChannelId?: string
  configuredGuildId?: string
  botUserId?: string
  waitUntil?: (promise: Promise<unknown>) => void
  fetchImpl?: typeof fetch
}

/** GitHub first-path segments that are never an owner/repo pair. */
const RESERVED_OWNERS = new Set([
  'about',
  'account',
  'apps',
  'codespaces',
  'collections',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'pricing',
  'pulls',
  'readme',
  'search',
  'settings',
  'signup',
  'site',
  'sponsors',
  'teams',
  'topics',
  'users',
])

const GITHUB_LINK_RE = /https?:\/\/(?:www\.)?github\.com\/[^\s<>()]+/gi
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_RE = /^[A-Za-z0-9._-]+$/

/**
 * Canonical `https://github.com/owner/repo`, or null when the URL is not a repo root
 * (issues, PRs, trees, gists, reserved marketing paths, extra segments).
 */
export function normalizeGithubRepoUrl(input: string): string | null {
  const href = input.trim()
  if (!href) return null
  try {
    const u = new URL(href)
    const host = u.hostname.toLowerCase()
    if (host !== 'github.com' && host !== 'www.github.com') return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length !== 2) return null
    const owner = parts[0]
    let repo = parts[1]
    if (!owner || !repo) return null
    if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4)
    if (!repo || repo === '.' || repo === '..') return null
    if (RESERVED_OWNERS.has(owner.toLowerCase())) return null
    if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null
    return `https://github.com/${owner}/${repo}`
  } catch {
    return null
  }
}

/** First github.com/owner/repo URL in message content, normalized. */
export function extractGithubRepoUrl(content: string | null | undefined): string | null {
  const matches = (content ?? '').match(GITHUB_LINK_RE) ?? []
  for (const raw of matches) {
    const repo = normalizeGithubRepoUrl(raw.replace(/[.,);]+$/g, ''))
    if (repo) return repo
  }
  return null
}

export function planGithubWatchDigestForward(input: {
  msg: GatewayMessage
  webhookUrl?: string | null
  watchChannelId?: string
  configuredGuildId?: string
  botUserId?: string
}): GithubWatchDigestAction {
  const webhookUrl = input.webhookUrl?.trim() ?? ''
  if (!webhookUrl) return { type: 'ignore', reason: 'no_webhook' }

  const watchChannelId = input.watchChannelId?.trim() ?? ''
  if (!watchChannelId) return { type: 'ignore', reason: 'no_channel_configured' }

  const msg = input.msg
  if (msg.channel_id !== watchChannelId) return { type: 'ignore', reason: 'other_channel' }

  const guildId = msg.guild_id ?? ''
  if (!guildId) return { type: 'ignore', reason: 'no_guild' }
  if (input.configuredGuildId && guildId !== input.configuredGuildId) {
    return { type: 'ignore', reason: 'other_guild' }
  }
  if (msg.webhook_id) return { type: 'ignore', reason: 'webhook' }
  if (msg.author?.bot) return { type: 'ignore', reason: 'bot' }
  if (input.botUserId && msg.author?.id === input.botUserId) {
    return { type: 'ignore', reason: 'self' }
  }
  if (!msg.author?.id) return { type: 'ignore', reason: 'no_author' }

  const url = extractGithubRepoUrl(msg.content)
  if (!url) return { type: 'ignore', reason: 'no_repo' }

  return {
    type: 'forward',
    payload: {
      source: GITHUB_WATCH_DIGEST_SOURCE,
      guildId,
      channelId: msg.channel_id,
      messageId: msg.id,
      url,
      authorId: msg.author.id,
      authorUsername: msg.author.username ?? '',
    },
  }
}

export async function postGithubWatchDigestWebhook(
  url: string,
  payload: GithubWatchDigestPayload,
  fetchImpl: typeof fetch = fetch,
  senderKey?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = senderKey?.trim() ?? ''
  if (key) headers.Authorization = `Bearer ${key}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error('github-watch-digest webhook status', res.status)
  }
}

/** Decide + POST in the background. Caller must not await this on the Gateway path. */
export function scheduleGithubWatchDigestForward(
  runtime: GithubWatchDigestRuntime,
  msg: GatewayMessage,
): void {
  const task = runGithubWatchDigestForward(runtime, msg).catch(() => {
    console.error('github-watch-digest webhook failed')
  })
  if (runtime.waitUntil) runtime.waitUntil(task)
  else void task
}

async function runGithubWatchDigestForward(
  runtime: GithubWatchDigestRuntime,
  msg: GatewayMessage,
): Promise<void> {
  const webhookUrl = runtime.webhookUrl?.trim() ?? ''
  const webhookSecret = runtime.webhookSecret?.trim() ?? ''
  if (!webhookUrl || !webhookSecret) return

  const action = planGithubWatchDigestForward({
    msg,
    webhookUrl,
    watchChannelId: runtime.watchChannelId,
    configuredGuildId: runtime.configuredGuildId,
    botUserId: runtime.botUserId,
  })
  if (action.type !== 'forward') return

  await postGithubWatchDigestWebhook(webhookUrl, action.payload, runtime.fetchImpl, webhookSecret)
}
