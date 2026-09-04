/**
 * Resolve the Discord channel Lyra should answer in.
 * Top-level mentions open a public thread; in-thread mentions stay put.
 */

import { createThreadOnMessage, type GatewayMessage } from './github-watch'
import type { PrivilegeStorage } from './lyra-mention'

export const LYRA_THREAD_KIND_KEY = 'lyra_channel_kind_v1'
/** Discord caps thread names at 100 chars; leave room for the ellipsis. */
export const LYRA_THREAD_NAME_MAX = 90

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_THREAD_TYPES = new Set<number>([10, 11, 12])
/**
 * The kind cache is a latency hint, not state worth keeping. Bound it so a guild
 * that accumulates threads cannot grow the stored record without limit.
 */
const KIND_CACHE_MAX = 64

export function lyraThreadTitle(content: string, authorUsername?: string): string {
  const stripped = content
    .replace(/<(?:@!?|&|#)\d+>/g, ' ')
    .replace(/<a?:[^:]+:\d+>/g, ' ')
    .replace(/https?:\/\/[^\s<>]+/gi, ' ')

  const firstChunk = stripped.split(/[.!?\n]/)[0] ?? stripped
  const firstClean = firstChunk.replace(/\s+/g, ' ').trim()
  const source = firstClean.length >= 12 ? firstChunk : stripped
  let cleaned = source
    .replace(/\s+/g, ' ')
    .trim()
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
  const base = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return `${base}…`
}

export type LyraThreadTarget = {
  channelId: string
  created: boolean
  reason: 'existing_thread' | 'created' | 'create_failed' | 'no_token'
}

export async function resolveLyraReplyThread(input: {
  token?: string
  msg: GatewayMessage
  storage: PrivilegeStorage
  fetchImpl?: typeof fetch
}): Promise<LyraThreadTarget> {
  const { msg, storage } = input
  const channelId = msg.channel_id

  if (msg.position !== undefined) {
    return { channelId, created: false, reason: 'existing_thread' }
  }

  const token = input.token?.trim() ?? ''
  if (!token) {
    return { channelId, created: false, reason: 'no_token' }
  }

  const kind = await lookupChannelKind(token, channelId, storage, input.fetchImpl ?? fetch)
  if (kind === 'thread') {
    return { channelId, created: false, reason: 'existing_thread' }
  }

  const created = await createThreadOnMessage(
    token,
    channelId,
    msg.id,
    lyraThreadTitle(msg.content ?? '', msg.author?.username),
  )
  if (created.ok) {
    return { channelId: created.threadId, created: true, reason: 'created' }
  }
  console.error('lyra-thread create failed', created.error)
  return { channelId, created: false, reason: 'create_failed' }
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
  const raw = await storage.get<Record<string, 'thread' | 'channel'>>(LYRA_THREAD_KIND_KEY)
  const cache: Record<string, 'thread' | 'channel'> =
    raw && typeof raw === 'object' ? { ...raw } : {}
  const cached = cache[channelId]
  if (cached === 'thread' || cached === 'channel') return cached

  let resolved: 'thread' | 'channel' | null = null
  try {
    const res = await fetchImpl(`${DISCORD_API}/channels/${channelId}`, {
      headers: { Authorization: `Bot ${token}` },
    })
    if (res.ok) {
      const body = (await res.json()) as { type?: unknown }
      resolved = DISCORD_THREAD_TYPES.has(Number(body.type)) ? 'thread' : 'channel'
    }
  } catch {
    resolved = null
  }

  if (!resolved) return 'channel'

  cache[channelId] = resolved
  const bounded = Object.keys(cache).length > KIND_CACHE_MAX ? { [channelId]: resolved } : cache
  await storage.put(LYRA_THREAD_KIND_KEY, bounded)
  return resolved
}
