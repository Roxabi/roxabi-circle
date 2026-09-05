/**
 * Durable Object participation set: threads where Lyra has posted at least once.
 * Keyed per thread channel id. Not a kind cache — see lyra-thread.ts.
 */

import type { GatewayMessage } from './github-watch'

export const LYRA_THREAD_ACTIVE_PREFIX = 'lyra_thread_v1:'

export type ThreadActiveStorage = {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

export function lyraThreadActiveKey(threadChannelId: string): string {
  return `${LYRA_THREAD_ACTIVE_PREFIX}${threadChannelId}`
}

/** Discord includes `position` only for messages sent inside a thread. */
export function isGatewayMessageInThread(msg: Pick<GatewayMessage, 'position'>): boolean {
  return typeof msg.position === 'number'
}

/**
 * Thread id to mark when Lyra herself posts.
 * In-thread messages use channel_id; a starter message may carry `thread.id`.
 */
export function lyraPostedThreadId(
  msg: Pick<GatewayMessage, 'author' | 'channel_id' | 'position' | 'thread'>,
  lyraUserId: string,
): string | null {
  if (msg.author?.id !== lyraUserId) return null
  if (typeof msg.position === 'number' && msg.channel_id) return msg.channel_id
  const started = msg.thread?.id
  return typeof started === 'string' && started ? started : null
}

export async function rememberLyraThreadActive(
  storage: ThreadActiveStorage,
  threadChannelId: string,
): Promise<void> {
  if (!threadChannelId) return
  try {
    await storage.put(lyraThreadActiveKey(threadChannelId), true)
  } catch {
    /* participation write must not throw on the Gateway path */
  }
}

export async function loadLyraThreadActive(
  storage: ThreadActiveStorage,
  threadChannelId: string,
): Promise<boolean> {
  if (!threadChannelId) return false
  try {
    return (await storage.get(lyraThreadActiveKey(threadChannelId))) === true
  } catch {
    return false
  }
}

export async function prepareLyraThreadForward(input: {
  msg: GatewayMessage
  lyraUserId: string
  configuredGuildId?: string
  storage: ThreadActiveStorage
}): Promise<{ skip: true } | { skip: false; threadActive: boolean }> {
  const guildOk = !input.configuredGuildId || input.msg.guild_id === input.configuredGuildId
  if (input.msg.author?.id === input.lyraUserId) {
    const threadId = lyraPostedThreadId(input.msg, input.lyraUserId)
    if (threadId && guildOk) await rememberLyraThreadActive(input.storage, threadId)
    return { skip: true }
  }
  const threadActive =
    guildOk &&
    isGatewayMessageInThread(input.msg) &&
    (await loadLyraThreadActive(input.storage, input.msg.channel_id))
  return { skip: false, threadActive }
}
