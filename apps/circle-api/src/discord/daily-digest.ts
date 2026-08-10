/**
 * #daily-digest — top-level posts are for bots only (Lyra digests).
 * Humans discuss in a thread under the digest (same Gateway pattern as
 * #github-to-watch / #news-actu; Discord perms stay category-synced).
 */

import {
  createThreadOnMessage,
  deleteMessage,
  dmUser,
  type GatewayMessage,
  postNotice,
} from './github-watch'

export type DailyDigestAction =
  | { type: 'ignore'; reason: string }
  | { type: 'accept'; threadName: string }
  | { type: 'reject'; message: string }

const REJECT_MSG =
  'Dans **#daily-digest**, le top-level est réservé aux **digests bot**. Pour commenter → **ouvre un thread** sous le digest.'

/** Thread name from first line of digest content. */
export function threadNameFromDigest(content: string | null | undefined): string {
  const line = (content ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return 'Digest'
  // strip markdown heading markers
  const cleaned = line
    .replace(/^#+\s*/, '')
    .replace(/\*+/g, '')
    .trim()
  return (cleaned || 'Digest').slice(0, 100)
}

/** Real digests are long/embed-based; skip our reject notices and tiny bot pings. */
export function looksLikeDigestPost(msg: GatewayMessage): boolean {
  if (msg.embeds && msg.embeds.length > 0) return true
  const raw = (msg.content ?? '').trim()
  if (!raw) return false
  // Enforcement notices: "<@id> — …" ephemeral style (id may be snowflake)
  if (/^<@!?\w+>\s*[—–-]/.test(raw)) return false
  if (raw.includes('message retiré') || raw.includes('#daily-digest')) {
    // only treat as notice when it is a short moderation ping
    if (raw.length < 400 && /^<@/.test(raw)) return false
  }
  return raw.length >= 40
}

/**
 * Decide MESSAGE_CREATE for #daily-digest.
 * - Humans top-level → reject (use thread)
 * - Bots / webhooks with digest-like content → accept + open discussion thread
 * - Short bot messages (e.g. our own reject notices) → ignore
 * Thread channels have a different channel_id — never equals digestChannelId.
 */
export function planDailyDigestMessage(
  msg: GatewayMessage,
  digestChannelId: string,
  _botUserId?: string,
): DailyDigestAction {
  if (!digestChannelId) return { type: 'ignore', reason: 'no_channel_configured' }
  if (msg.channel_id !== digestChannelId) return { type: 'ignore', reason: 'other_channel' }

  const isBot = Boolean(msg.author?.bot) || Boolean(msg.webhook_id)

  if (isBot) {
    if (!looksLikeDigestPost(msg)) {
      return { type: 'ignore', reason: 'bot_notice_or_short' }
    }
    return {
      type: 'accept',
      threadName: threadNameFromDigest(msg.content),
    }
  }

  return { type: 'reject', message: REJECT_MSG }
}

/**
 * Enforce: bot digest → open thread; human top-level → delete + notice (+ DM).
 */
export async function enforceDailyDigest(input: {
  token: string
  msg: GatewayMessage
  action: DailyDigestAction
  noticeTtlMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<{ done: string }> {
  const { token, msg, action } = input
  if (action.type === 'ignore') return { done: `ignore:${action.reason}` }

  if (action.type === 'accept') {
    const t = await createThreadOnMessage(token, msg.channel_id, msg.id, action.threadName)
    return { done: t.ok ? `accept:thread:${t.threadId}` : `accept:thread_fail:${t.error}` }
  }

  await deleteMessage(token, msg.channel_id, msg.id)
  const who = msg.author?.id ? `<@${msg.author.id}>` : 'Hey'
  const noticeId = await postNotice(token, msg.channel_id, `${who} — ${action.message}`)

  if (msg.author?.id) {
    void dmUser(token, msg.author.id, `**#daily-digest** — message retiré.\n\n${action.message}`)
  }

  if (noticeId && input.noticeTtlMs && input.sleep) {
    await input.sleep(input.noticeTtlMs)
    await deleteMessage(token, msg.channel_id, noticeId)
  }

  return { done: 'reject:deleted' }
}
