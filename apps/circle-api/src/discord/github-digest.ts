/**
 * Daily GitHub digest → #daily-digest (Lyra).
 * Sources: github.com/trending daily+weekly. Cron 12:30 Europe/Paris.
 */

import type { Env } from '../types'
import { formatDigestMessage } from './github-digest-copy'
import {
  ageDays,
  alreadyPostedToday,
  classifyBucket,
  DISCORD_CONTENT_MAX,
  DISCORD_SUPPRESS_EMBEDS,
  type DigestRepo,
  dropReasons,
  extractPostedRepos,
  isParisDigestSlot,
  mergeTrending,
  parisDigestDateLabel,
  parseTrendingHtml,
  pickDigest,
  readmeExcerpt,
  type TrendingHit,
} from './github-digest-logic'

const GH_TRENDING = 'https://github.com/trending'
const GH_API = 'https://api.github.com'
const DISCORD_API = 'https://discord.com/api/v10'
const UA = 'RoxabiCircle (github-digest, 0.1)'

export type DigestRunResult = {
  ok: boolean
  skipped?: string
  postedId?: string
  picked?: string[]
  error?: string
}

export async function runGithubDigest(
  env: Env,
  opts?: { now?: Date; skipTimeCheck?: boolean },
): Promise<DigestRunResult> {
  const now = opts?.now ?? new Date()
  if (!opts?.skipTimeCheck && !isParisDigestSlot(now)) {
    return { ok: true, skipped: 'not_paris_1230' }
  }

  const channelId = env.DISCORD_DAILY_DIGEST_CHANNEL_ID
  if (!channelId) return { ok: false, error: 'no_digest_channel' }
  if (!env.DISCORD_BOT_TOKEN) return { ok: false, error: 'no_bot_token' }

  const dateLabel = parisDigestDateLabel(now)
  const digestMsgs = await listChannelMessages(env.DISCORD_BOT_TOKEN, channelId, 30)
  if (alreadyPostedToday(digestMsgs, dateLabel)) {
    return { ok: true, skipped: 'already_today' }
  }

  const sinceMs = now.getTime() - 7 * 86_400_000
  const watchId = env.DISCORD_GITHUB_WATCH_CHANNEL_ID
  const watchMsgs = watchId ? await listChannelMessages(env.DISCORD_BOT_TOKEN, watchId, 100) : []
  const posted = extractPostedRepos([...digestMsgs, ...watchMsgs], sinceMs)

  let daily: TrendingHit[]
  let weekly: TrendingHit[]
  try {
    daily = parseTrendingHtml(await fetchTrending('daily'), 'daily')
    weekly = parseTrendingHtml(await fetchTrending('weekly'), 'weekly')
  } catch (e) {
    return { ok: false, error: `scrape:${String(e).slice(0, 180)}` }
  }
  const merged = mergeTrending(daily, weekly)
  if (merged.length === 0) return { ok: false, error: 'trending_empty' }

  const enriched: DigestRepo[] = []
  for (const hit of merged) {
    const meta = await fetchRepoMeta(hit.full, env.GITHUB_TOKEN)
    if (!meta) continue
    const hay = `${hit.full} ${hit.desc} ${meta.desc} ${meta.topics.join(' ')}`
    const repo: DigestRepo = {
      ...hit,
      desc: hit.desc || meta.desc,
      lang: hit.lang || meta.lang,
      stars: meta.stars,
      forks: meta.forks,
      created: meta.created,
      ageDays: ageDays(meta.created, now),
      topics: meta.topics,
      archived: meta.archived,
      readmeExcerpt: '',
      bucket: classifyBucket(hay),
      relWeek: meta.stars > 0 ? (hit.deltaWeekly ?? 0) / meta.stars : 0,
      relDay: meta.stars > 0 ? (hit.deltaDaily ?? 0) / meta.stars : 0,
    }
    if (dropReasons(repo, posted).length > 0) continue
    repo.readmeExcerpt = await fetchReadmeExcerpt(hit.full, env.GITHUB_TOKEN)
    enriched.push(repo)
  }

  const picked = pickDigest(enriched)
  if (picked.length === 0) return { ok: true, skipped: 'no_candidates' }

  const content = formatDigestMessage(picked, dateLabel)
  const postedId = await postDigest(env.DISCORD_BOT_TOKEN, channelId, content)
  if (!postedId)
    return { ok: false, error: 'discord_post_failed', picked: picked.map((r) => r.full) }
  return { ok: true, postedId, picked: picked.map((r) => r.full) }
}

async function fetchTrending(period: 'daily' | 'weekly'): Promise<string> {
  const res = await fetch(`${GH_TRENDING}?since=${period}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RoxabiCircle/0.1; +https://circle.roxabi.dev)',
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`trending_${period}_${res.status}`)
  return res.text()
}

async function fetchRepoMeta(
  full: string,
  token?: string,
): Promise<{
  stars: number
  forks: number
  created: string
  lang: string | null
  desc: string
  topics: string[]
  archived: boolean
} | null> {
  const res = await fetch(`${GH_API}/repos/${full}`, { headers: ghHeaders(token) })
  if (!res.ok) return null
  const j = (await res.json()) as {
    stargazers_count?: number
    forks_count?: number
    created_at?: string
    language?: string | null
    description?: string | null
    topics?: string[]
    archived?: boolean
  }
  return {
    stars: j.stargazers_count ?? 0,
    forks: j.forks_count ?? 0,
    created: j.created_at ?? '',
    lang: j.language ?? null,
    desc: j.description ?? '',
    topics: j.topics ?? [],
    archived: Boolean(j.archived),
  }
}

async function fetchReadmeExcerpt(full: string, token?: string): Promise<string> {
  const res = await fetch(`${GH_API}/repos/${full}/readme`, {
    headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw' },
  })
  if (!res.ok) return ''
  const text = await res.text()
  return readmeExcerpt(text)
}

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/vnd.github+json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function listChannelMessages(
  token: string,
  channelId: string,
  limit: number,
): Promise<{ content?: string; timestamp?: string }[]> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, {
    headers: { Authorization: `Bot ${token}`, 'User-Agent': UA },
  })
  if (!res.ok) return []
  const data = (await res.json()) as { content?: string; timestamp?: string }[]
  return Array.isArray(data) ? data : []
}

async function postDigest(
  token: string,
  channelId: string,
  content: string,
): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({
      content: content.slice(0, DISCORD_CONTENT_MAX),
      flags: DISCORD_SUPPRESS_EMBEDS,
    }),
  })
  if (!res.ok) {
    console.error('digest post', res.status, await res.text().then((t) => t.slice(0, 200)))
    return null
  }
  const data = (await res.json()) as { id?: string }
  return data.id ?? null
}
