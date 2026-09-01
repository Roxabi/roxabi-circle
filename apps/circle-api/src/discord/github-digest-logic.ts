/**
 * GitHub digest — pure ranking / copy (no I/O).
 * Rank by star velocity (trending page), then circle theme. No total-star cap.
 */

export const DIGEST_CRONS = ['30 10 * * *', '30 11 * * *'] as const

export const DISCORD_SUPPRESS_EMBEDS = 4
export const DISCORD_CONTENT_MAX = 2000
export const DIGEST_PICK = 5

export type TrendingHit = {
  owner: string
  name: string
  full: string
  url: string
  desc: string
  lang: string | null
  deltaDaily: number | null
  deltaWeekly: number | null
}

export type DigestRepo = TrendingHit & {
  stars: number
  forks: number
  created: string
  ageDays: number
  topics: string[]
  archived: boolean
  readmeExcerpt: string
  bucket: DigestBucket
  relWeek: number
  relDay: number
}

export type DigestBucket =
  | 'harness'
  | 'agent'
  | 'llm'
  | 'knowledge'
  | 'mcp'
  | 'workspace'
  | 'cloudflare'
  | 'skills'
  | 'eval'
  | 'other'

export const MONUMENTS = new Set([
  'obra/superpowers',
  'mattpocock/skills',
  'juliusbrussee/caveman',
  'santifer/career-ops',
  'public-apis/public-apis',
  'harry0703/moneyprinterturbo',
])

const FARM_RE =
  /\b(vless|trojan|xray|clash-meta|clash\b|vpn\b|tempmail|temp-email|dsh-plugin|crypto.?bot|airdrop|mevbot)\b/i

const CIRCLE_RE =
  /\b(agent|harness|llm|rag|mcp|skill|plugin|cloudflare|workers?\b|memory|knowledge|vector|inference|vllm|ollama|coding.?agent|eval|observab|durable.?object|pydantic.?ai|tool.?call)\b/i

export function isDigestCron(cron: string): boolean {
  return (DIGEST_CRONS as readonly string[]).includes(cron)
}

/** 12:30 Europe/Paris ±5 min (cron is UTC; DST = 10:30 or 11:30 UTC). */
export function isParisDigestSlot(now: Date): boolean {
  const { hour, minute } = parisHourMinute(now)
  return hour === 12 && minute >= 25 && minute <= 35
}

export function parisHourMinute(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  return { hour, minute }
}

export function parisDigestDateLabel(now: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
}

export function parseTrendingHtml(html: string, period: 'daily' | 'weekly'): TrendingHit[] {
  const blocks = html.split(/<article class="Box-row"/).slice(1)
  const out: TrendingHit[] = []
  for (const b of blocks) {
    const m = b.match(/<h2[^>]*>[\s\S]*?href="\/([^/"]+)\/([^/"]+)"/)
    if (!m?.[1] || !m[2]) continue
    const owner = m[1]
    const name = m[2]
    if (owner === 'login' || owner === 'sponsors' || owner === 'apps') continue
    const descM = b.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/)
    const desc = decodeHtml(stripTags(descM?.[1] ?? ''))
      .replace(/\s+/g, ' ')
      .trim()
    const deltaM = b.match(/([\d,]+)\s+stars (today|this week)/i)
    const delta = deltaM ? Number(deltaM[1].replace(/,/g, '')) : null
    const langM = b.match(/itemprop="programmingLanguage">([^<]+)/)
    const lang = langM?.[1]?.trim() || null
    const hit: TrendingHit = {
      owner,
      name,
      full: `${owner}/${name}`,
      url: `https://github.com/${owner}/${name}`,
      desc,
      lang,
      deltaDaily: period === 'daily' ? delta : null,
      deltaWeekly: period === 'weekly' ? delta : null,
    }
    out.push(hit)
  }
  return out
}

export function mergeTrending(daily: TrendingHit[], weekly: TrendingHit[]): TrendingHit[] {
  const by = new Map<string, TrendingHit>()
  for (const h of [...daily, ...weekly]) {
    const k = h.full.toLowerCase()
    const prev = by.get(k)
    if (!prev) {
      by.set(k, { ...h })
      continue
    }
    by.set(k, {
      ...prev,
      desc: prev.desc || h.desc,
      lang: prev.lang || h.lang,
      deltaDaily: prev.deltaDaily ?? h.deltaDaily,
      deltaWeekly: prev.deltaWeekly ?? h.deltaWeekly,
    })
  }
  return [...by.values()]
}

export function classifyBucket(hay: string): DigestBucket {
  const t = hay.toLowerCase()
  if (/\b(cloudflare|workers-ai|durable.object|\bd1\b|\br2\b)\b/.test(t)) return 'cloudflare'
  if (/\b(harness|coding.?agent|claude.?code)\b/.test(t)) return 'harness'
  if (/\b(mcp|mcp-server|model.context.protocol)\b/.test(t)) return 'mcp'
  if (/\b(rag|knowledge|ontology|vector|memory|second.brain|context.graph)\b/.test(t)) {
    return 'knowledge'
  }
  if (/\b(eval|observab|jailbreak|red.?team|scanner)\b/.test(t)) return 'eval'
  if (/\b(skill|plugin)\b/.test(t)) return 'skills'
  if (/\b(workspace|crm|slack.alternative|notion)\b/.test(t)) return 'workspace'
  if (/\b(llm|inference|vllm|ollama|on-device|mlx)\b/.test(t)) return 'llm'
  if (/\bagent\b/.test(t)) return 'agent'
  return 'other'
}

export type DropReason =
  | 'monument'
  | 'posted'
  | 'archived'
  | 'farm'
  | 'off-theme'
  | 'flat'
  | 'fork-farm'
  | 'tiny'

export function dropReasons(
  repo: Pick<
    DigestRepo,
    'full' | 'desc' | 'topics' | 'stars' | 'forks' | 'ageDays' | 'archived' | 'relWeek' | 'relDay'
  >,
  posted: Set<string>,
): DropReason[] {
  const hay = `${repo.full} ${repo.desc} ${repo.topics.join(' ')}`
  const drop: DropReason[] = []
  if (MONUMENTS.has(repo.full.toLowerCase())) drop.push('monument')
  if (posted.has(repo.full.toLowerCase())) drop.push('posted')
  if (repo.archived) drop.push('archived')
  if (FARM_RE.test(hay)) drop.push('farm')
  if (!CIRCLE_RE.test(hay)) drop.push('off-theme')
  const keepPente = repo.relWeek >= 0.08 || repo.ageDays < 90 || repo.relDay >= 0.05
  if (!keepPente) drop.push('flat')
  if (repo.stars >= 80 && repo.forks / repo.stars >= 0.45) drop.push('fork-farm')
  if (repo.stars < 80) drop.push('tiny')
  return drop
}

export function pickDigest(repos: DigestRepo[], n = DIGEST_PICK): DigestRepo[] {
  const ranked = [...repos].sort((a, b) => scoreVelocity(b) - scoreVelocity(a))
  const picked: DigestRepo[] = []
  const used = new Set<DigestBucket>()
  for (const r of ranked) {
    if (picked.length >= n) break
    if (used.has(r.bucket) && r.bucket !== 'other') continue
    picked.push(r)
    used.add(r.bucket)
  }
  if (picked.length < n) {
    for (const r of ranked) {
      if (picked.length >= n) break
      if (picked.some((p) => p.full === r.full)) continue
      picked.push(r)
    }
  }
  return picked
}

export function scoreVelocity(r: Pick<DigestRepo, 'deltaWeekly' | 'deltaDaily'>): number {
  return (r.deltaWeekly ?? 0) * 10 + (r.deltaDaily ?? 0)
}

export function extractPostedRepos(
  messages: { content?: string; timestamp?: string }[],
  sinceMs: number,
): Set<string> {
  const out = new Set<string>()
  const re = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi
  for (const msg of messages) {
    const ts = msg.timestamp ? Date.parse(msg.timestamp) : 0
    if (ts && ts < sinceMs) continue
    const raw = msg.content ?? ''
    for (const m of raw.matchAll(re)) {
      const owner = m[1]
      const name = m[2]
      if (!owner || !name) continue
      if (owner === 'orgs' || owner === 'settings') continue
      out.add(`${owner}/${name}`.toLowerCase())
    }
  }
  return out
}

export function alreadyPostedToday(messages: { content?: string }[], dateLabel: string): boolean {
  const needle = `GitHub qui décolle — ${dateLabel}`
  return messages.some((m) => (m.content ?? '').includes(needle))
}

export function ageDays(createdIso: string, now: Date): number {
  const created = Date.parse(createdIso)
  if (!Number.isFinite(created)) return 9999
  return Math.max(0, Math.floor((now.getTime() - created) / 86_400_000))
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  return `${t.slice(0, n - 1).trimEnd()}…`
}

export function readmeExcerpt(markdown: string, max = 220): string {
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter(
      (l) => !l.startsWith('#') && !l.startsWith('![') && !l.startsWith('<') && !l.startsWith('['),
    )
    .filter((l) => !l.startsWith('---') && !l.startsWith('|'))
  const para = stripTags(lines.slice(0, 4).join(' '))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
  return clip(para, max)
}
