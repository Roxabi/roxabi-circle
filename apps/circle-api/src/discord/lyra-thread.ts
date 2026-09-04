/**
 * Resolve the Discord channel Lyra should answer in.
 * Top-level mentions open a public thread; in-thread mentions stay put.
 */

import { createThreadOnMessage, type GatewayMessage } from './github-watch'
import type { PrivilegeStorage } from './lyra-mention'

export const LYRA_THREAD_KIND_KEY = 'lyra_channel_kind_v1'
/** Discord caps thread names at 100 chars; leave room for the ellipsis. */
export const LYRA_THREAD_NAME_MAX = 90
export const LYRA_THREAD_ADOPT_ATTEMPTS = 3
export const LYRA_THREAD_ADOPT_DELAY_MS = 400

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_THREAD_TYPES = new Set<number>([10, 11, 12])
/**
 * The kind cache is a latency hint, not state worth keeping. Bound it so a guild
 * that accumulates threads cannot grow the stored record without limit.
 */
const KIND_CACHE_MAX = 64

export function lyraThreadTitle(content: string, authorUsername?: string): string {
  const stripped = content
    .replace(/<(?:@[!&]?|#)\d+>/g, ' ')
    .replace(/<a?:[^:]+:\d+>/g, ' ')
    .replace(/https?:\/\/[^\s<>]+/gi, ' ')

  const firstSentence = (stripped.split(/[.!?\n]/)[0] ?? stripped).replace(/\s+/g, ' ').trim()
  let cleaned = (firstSentence.length >= 12 ? firstSentence : stripped.replace(/\s+/g, ' ').trim())
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim()

  if (!cleaned) {
    const user = authorUsername?.trim() ?? ''
    return user ? `Question de ${user}` : 'Question Circle'
  }

  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  if (cleaned.length <= LYRA_THREAD_NAME_MAX) return cleaned

  const slice = cleaned.slice(0, LYRA_THREAD_NAME_MAX)
  const lastSpace = slice.lastIndexOf(' ')
  const base = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).replace(/[\uD800-\uDBFF]$/, '')
  return `${base}…`
}

export type LyraThreadTarget = {
  channelId: string
  created: boolean
  reason: 'existing_thread' | 'created' | 'adopted' | 'create_failed' | 'no_token'
}

export async function resolveLyraReplyThread(input: {
  token?: string
  msg: GatewayMessage
  storage: PrivilegeStorage
  fetchImpl?: typeof fetch
  /** A channel automation is opening the thread for this message: adopt it, do not race it. */
  adoptOnly?: boolean
  sleep?: (ms: number) => Promise<void>
}): Promise<LyraThreadTarget> {
  const { msg, storage } = input
  const channelId = msg.channel_id
  const fetchImpl = input.fetchImpl ?? fetch
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  if (typeof msg.position === 'number') {
    return { channelId, created: false, reason: 'existing_thread' }
  }

  const token = input.token?.trim() ?? ''
  if (!token) {
    return { channelId, created: false, reason: 'no_token' }
  }

  if (input.adoptOnly) {
    for (let attempt = 0; attempt < LYRA_THREAD_ADOPT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        try {
          await sleep(LYRA_THREAD_ADOPT_DELAY_MS)
        } catch {
          /* injected sleep must not abort the mention */
        }
      }
      if ((await fetchChannelThreadKind(token, msg.id, fetchImpl)) === 'thread') {
        return { channelId: msg.id, created: false, reason: 'adopted' }
      }
    }
  }

  const kind = await lookupChannelKind(token, channelId, storage, fetchImpl)
  if (kind === 'thread') {
    return { channelId, created: false, reason: 'existing_thread' }
  }

  const created = await createThreadOnMessage(
    token,
    channelId,
    msg.id,
    lyraThreadTitle(msg.content ?? '', msg.author?.username),
  ).catch((error: unknown) => ({ ok: false as const, error: String(error) }))
  if (created.ok) {
    return { channelId: created.threadId, created: true, reason: 'created' }
  }
  console.error('lyra-thread create failed', created.error)

  if ((await fetchChannelThreadKind(token, msg.id, fetchImpl)) === 'thread') {
    return { channelId: msg.id, created: false, reason: 'adopted' }
  }
  return { channelId, created: false, reason: 'create_failed' }
}

/**
 * GET /channels/{id} and classify. Shared by adopt polling, the kind-cache
 * miss path, and the post-create race-loser probe.
 */
async function fetchChannelThreadKind(
  token: string,
  channelId: string,
  fetchImpl: typeof fetch,
): Promise<'thread' | 'channel' | null> {
  try {
    const res = await fetchImpl(`${DISCORD_API}/channels/${channelId}`, {
      headers: { Authorization: `Bot ${token}` },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { type?: unknown }
    return DISCORD_THREAD_TYPES.has(Number(body.type)) ? 'thread' : 'channel'
  } catch {
    return null
  }
}

/**
 * Channel types never change, so the cache never needs invalidation.
 */
async function lookupChannelKind(
  token: string,
  channelId: string,
  storage: PrivilegeStorage,
  fetchImpl: typeof fetch,
): Promise<'thread' | 'channel'> {
  const raw = await storage
    .get<Record<string, 'thread' | 'channel'>>(LYRA_THREAD_KIND_KEY)
    .catch(() => undefined)
  const cache: Record<string, 'thread' | 'channel'> =
    raw && typeof raw === 'object' ? { ...raw } : {}
  const cached = cache[channelId]
  if (cached === 'thread' || cached === 'channel') return cached

  const resolved = await fetchChannelThreadKind(token, channelId, fetchImpl)
  if (!resolved) return 'channel'

  cache[channelId] = resolved
  const keys = Object.keys(cache)
  let bounded = cache
  if (keys.length > KIND_CACHE_MAX) {
    // Object key order is insertion order (snowflake ids are not array indices).
    bounded = {}
    for (const id of keys.slice(-Math.floor(keys.length / 2))) {
      const kept = cache[id]
      if (kept) bounded[id] = kept
    }
  }
  await storage.put(LYRA_THREAD_KIND_KEY, bounded).catch(() => undefined)
  return resolved
}
