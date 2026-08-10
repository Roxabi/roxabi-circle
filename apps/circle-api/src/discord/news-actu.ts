/**
 * #news-actu — top-level posts must be a single http(s) link.
 * Discussion goes in a thread under that message (same pattern as github-to-watch).
 */

import {
  createThreadOnMessage,
  deleteMessage,
  dmUser,
  type GatewayMessage,
  postNotice,
} from './github-watch'

/** Any http(s) URL (scheme required). Trailing punctuation stripped later. */
export const ANY_URL_RE = /https?:\/\/[^\s<>()]+/gi

export type NewsActuVerdict =
  | { ok: true; url: string; caption: string }
  | {
      ok: false
      code: 'no_url' | 'multiple_urls' | 'caption_too_long' | 'empty'
      message: string
    }

const MAX_CAPTION = 120

/**
 * Pure gate for top-level #news-actu content.
 * Exactly one http(s) URL; optional short caption (≤120 chars excl. URL).
 */
export function decideNewsActuTopLevel(content: string | null | undefined): NewsActuVerdict {
  const raw = (content ?? '').trim()
  if (!raw) {
    return {
      ok: false,
      code: 'empty',
      message:
        'Dans **#news-actu**, le top-level doit être **un lien** (http/https). Discussion → **réponds en thread** sous le lien.',
    }
  }

  const matches = raw.match(ANY_URL_RE) ?? []
  const urls = [...new Set(matches.map((u) => u.replace(/[.,);]+$/g, '')))]

  if (urls.length === 0) {
    return {
      ok: false,
      code: 'no_url',
      message:
        'Pas de **lien** détecté. Un seul URL en top-level ; pour commenter, **ouvre un thread** sous un article déjà posté.',
    }
  }
  if (urls.length > 1) {
    return {
      ok: false,
      code: 'multiple_urls',
      message:
        'Un **seul** lien par message top-level. Plusieurs articles → posts séparés (discussion en thread).',
    }
  }

  const url = urls[0]!
  let caption = raw
  for (const m of matches) {
    caption = caption.replace(m, '')
  }
  caption = caption.replace(/\s+/g, ' ').trim()

  if (caption.length > MAX_CAPTION) {
    return {
      ok: false,
      code: 'caption_too_long',
      message: `Légende trop longue (max ${MAX_CAPTION} car. hors lien). Mets le débat en **thread** sous le lien.`,
    }
  }

  return { ok: true, url, caption }
}

/** Thread name from hostname + short path. */
export function threadNameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    if (path && path !== '/') {
      const slug = path.split('/').filter(Boolean).slice(-2).join('/')
      return `${host} · ${slug}`.slice(0, 100)
    }
    return host.slice(0, 100)
  } catch {
    return 'Discussion'
  }
}

export type NewsActuAction =
  | { type: 'ignore'; reason: string }
  | { type: 'accept'; url: string; threadName: string }
  | { type: 'reject'; message: string }

/**
 * Decide what to do with a MESSAGE_CREATE in #news-actu.
 * Thread channels have a different channel_id — never equals newsChannelId.
 */
export function planNewsActuMessage(
  msg: GatewayMessage,
  newsChannelId: string,
  botUserId?: string,
): NewsActuAction {
  if (!newsChannelId) return { type: 'ignore', reason: 'no_channel_configured' }
  if (msg.channel_id !== newsChannelId) return { type: 'ignore', reason: 'other_channel' }
  if (msg.webhook_id) return { type: 'ignore', reason: 'webhook' }
  if (msg.author?.bot) return { type: 'ignore', reason: 'bot' }
  if (botUserId && msg.author?.id === botUserId) return { type: 'ignore', reason: 'self' }

  const verdict = decideNewsActuTopLevel(msg.content)
  if (verdict.ok) {
    return {
      type: 'accept',
      url: verdict.url,
      threadName: threadNameFromUrl(verdict.url),
    }
  }
  return { type: 'reject', message: verdict.message }
}

/**
 * Enforce plan: accept → open discussion thread; reject → delete + notice (+ DM best-effort).
 */
export async function enforceNewsActu(input: {
  token: string
  msg: GatewayMessage
  action: NewsActuAction
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
  const noticeBody = `${who} — ${action.message}`
  const noticeId = await postNotice(token, msg.channel_id, noticeBody)

  if (msg.author?.id) {
    void dmUser(token, msg.author.id, `**#news-actu** — message retiré.\n\n${action.message}`)
  }

  if (noticeId && input.noticeTtlMs && input.sleep) {
    await input.sleep(input.noticeTtlMs)
    await deleteMessage(token, msg.channel_id, noticeId)
  }

  return { done: 'reject:deleted' }
}
