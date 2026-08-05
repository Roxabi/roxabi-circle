/**
 * #github-to-watch — top-level posts must be a single GitHub link.
 * Discussion goes in a thread under that message.
 */

const API = 'https://discord.com/api/v10'

/** github.com and gist.github.com (http/https, optional www). */
export const GITHUB_URL_RE =
  /https?:\/\/(?:www\.)?(?:gist\.)?github\.com\/[^\s<>()]+/gi

export type GithubWatchVerdict =
  | { ok: true; url: string; caption: string }
  | {
      ok: false
      code: 'no_github_url' | 'multiple_urls' | 'caption_too_long' | 'empty'
      message: string
    }

const MAX_CAPTION = 120

/**
 * Pure gate for top-level #github-to-watch content.
 * Exactly one GitHub URL; optional short caption (≤120 chars excl. URL).
 */
export function decideGithubWatchTopLevel(content: string | null | undefined): GithubWatchVerdict {
  const raw = (content ?? '').trim()
  if (!raw) {
    return {
      ok: false,
      code: 'empty',
      message:
        'Dans **#github-to-watch**, le top-level doit être **un lien GitHub** (repo / PR / issue / gist). Discussion → thread sous le lien.',
    }
  }

  const matches = raw.match(GITHUB_URL_RE) ?? []
  // de-dupe identical URLs
  const urls = [...new Set(matches.map((u) => u.replace(/[.,);]+$/g, '')))]

  if (urls.length === 0) {
    return {
      ok: false,
      code: 'no_github_url',
      message:
        'Pas de lien **github.com** détecté. Un seul lien GitHub en top-level ; le reste en thread.',
    }
  }
  if (urls.length > 1) {
    return {
      ok: false,
      code: 'multiple_urls',
      message:
        'Un **seul** lien GitHub par message top-level. Pour plusieurs repos, post séparés (ou un thread).',
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

/** Thread name from URL path (repo or issue/PR id). */
export function threadNameFromGithubUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // /owner/repo or /owner/repo/pull/N
    if (parts.length >= 2) {
      const base = `${parts[0]}/${parts[1]}`
      if (parts[2] === 'pull' || parts[2] === 'issues') {
        const n = parts[3] ?? ''
        const label = parts[2] === 'pull' ? 'PR' : '#'
        return `${base} ${label}${n}`.slice(0, 100)
      }
      if (parts[2] === 'discussions' && parts[3]) {
        return `${base} disc#${parts[3]}`.slice(0, 100)
      }
      return base.slice(0, 100)
    }
  } catch {
    /* fall through */
  }
  return 'Discussion'
}

export type GatewayMessage = {
  id: string
  channel_id: string
  guild_id?: string | null
  content?: string
  author?: { id?: string; bot?: boolean; username?: string }
  webhook_id?: string | null
  /** Present when this message is a reply; still top-level if not in a thread channel */
  message_reference?: { message_id?: string; channel_id?: string } | null
  /** 0 = DEFAULT, 19 = REPLY, etc. — not used for thread detection */
  type?: number
}

export type GithubWatchAction =
  | { type: 'ignore'; reason: string }
  | { type: 'accept'; url: string; threadName: string }
  | { type: 'reject'; message: string }

/**
 * Decide what to do with a MESSAGE_CREATE in context of github-to-watch.
 * Thread channels have a different channel_id — never equals watchChannelId.
 */
export function planGithubWatchMessage(
  msg: GatewayMessage,
  watchChannelId: string,
  botUserId?: string,
): GithubWatchAction {
  if (!watchChannelId) return { type: 'ignore', reason: 'no_channel_configured' }
  if (msg.channel_id !== watchChannelId) return { type: 'ignore', reason: 'other_channel' }
  if (msg.webhook_id) return { type: 'ignore', reason: 'webhook' }
  if (msg.author?.bot) return { type: 'ignore', reason: 'bot' }
  if (botUserId && msg.author?.id === botUserId) return { type: 'ignore', reason: 'self' }

  const verdict = decideGithubWatchTopLevel(msg.content)
  if (verdict.ok) {
    return {
      type: 'accept',
      url: verdict.url,
      threadName: threadNameFromGithubUrl(verdict.url),
    }
  }
  return { type: 'reject', message: verdict.message }
}

async function discord(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'RoxabiCircle (github-watch, 0.1)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }
  return { status: res.status, data }
}

export async function deleteMessage(
  token: string,
  channelId: string,
  messageId: string,
): Promise<boolean> {
  const { status } = await discord(token, 'DELETE', `/channels/${channelId}/messages/${messageId}`)
  return status === 204 || status === 200
}

export async function createThreadOnMessage(
  token: string,
  channelId: string,
  messageId: string,
  name: string,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const { status, data } = await discord(
    token,
    'POST',
    `/channels/${channelId}/messages/${messageId}/threads`,
    {
      name: name.slice(0, 100),
      auto_archive_duration: 1440,
    },
  )
  if (status === 201 || status === 200) {
    const id = (data as { id?: string })?.id
    if (id) return { ok: true, threadId: id }
  }
  // 400 if thread already exists — treat as soft ok
  if (status === 400) {
    return { ok: false, error: `thread_exists_or_bad: ${JSON.stringify(data).slice(0, 180)}` }
  }
  return { ok: false, error: `thread_${status}: ${JSON.stringify(data).slice(0, 180)}` }
}

/** Ephemeral-style notice: post then caller may delete after delay. */
export async function postNotice(
  token: string,
  channelId: string,
  content: string,
): Promise<string | null> {
  const { status, data } = await discord(token, 'POST', `/channels/${channelId}/messages`, {
    content: content.slice(0, 1900),
  })
  if (status === 200 || status === 201) {
    return (data as { id?: string })?.id ?? null
  }
  return null
}

export async function dmUser(
  token: string,
  userId: string,
  content: string,
): Promise<boolean> {
  const ch = await discord(token, 'POST', '/users/@me/channels', {
    recipient_id: userId,
  })
  if (ch.status !== 200 && ch.status !== 201) return false
  const channelId = (ch.data as { id?: string })?.id
  if (!channelId) return false
  const msg = await discord(token, 'POST', `/channels/${channelId}/messages`, {
    content: content.slice(0, 1900),
  })
  return msg.status === 200 || msg.status === 201
}

/**
 * Enforce plan: accept → open discussion thread; reject → delete + notice (+ DM best-effort).
 */
export async function enforceGithubWatch(input: {
  token: string
  msg: GatewayMessage
  action: GithubWatchAction
  /** If set, delete notice after this many ms (caller should pass waitUntil-friendly). */
  noticeTtlMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<{ done: string }> {
  const { token, msg, action } = input
  if (action.type === 'ignore') return { done: `ignore:${action.reason}` }

  if (action.type === 'accept') {
    const t = await createThreadOnMessage(token, msg.channel_id, msg.id, action.threadName)
    return { done: t.ok ? `accept:thread:${t.threadId}` : `accept:thread_fail:${t.error}` }
  }

  // reject
  await deleteMessage(token, msg.channel_id, msg.id)
  const who = msg.author?.id ? `<@${msg.author.id}>` : 'Hey'
  const noticeBody = `${who} — ${action.message}`
  const noticeId = await postNotice(token, msg.channel_id, noticeBody)

  if (msg.author?.id) {
    void dmUser(
      token,
      msg.author.id,
      `**#github-to-watch** — message retiré.\n\n${action.message}`,
    )
  }

  if (noticeId && input.noticeTtlMs && input.sleep) {
    await input.sleep(input.noticeTtlMs)
    await deleteMessage(token, msg.channel_id, noticeId)
  }

  return { done: 'reject:deleted' }
}
