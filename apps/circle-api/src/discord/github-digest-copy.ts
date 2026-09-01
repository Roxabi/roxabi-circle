/**
 * GitHub digest Discord copy (pure, no I/O).
 */
import {
  clip,
  DISCORD_CONTENT_MAX,
  type DigestBucket,
  type DigestRepo,
} from './github-digest-logic'

const WHEN: Record<DigestBucket, string> = {
  harness:
    'tu veux orchestrer plusieurs coding agents (CLI que tu as déjà), pas en écrire un from-scratch',
  agent: 'tu scales des agents stateful (sandbox, densité, suspend/resume)',
  llm: 'tu as besoin d’inférence locale / on-device, pas d’un GPT cloud',
  knowledge: 'le RAG embeddings ne suffit plus (audit, graphe, provenance)',
  mcp: 'tu branches des tools / MCP sur un agent existant',
  workspace: 'humains et agents doivent partager le même graphe de travail',
  cloudflare: 'tu construis sur Workers / D1 / R2 / DO',
  skills: 'tu packages un skill / plugin pour un harness (Claude Code, Codex, pi…)',
  eval: 'tu mesures ou sécurises des agents (eval, scan, jailbreak)',
  other: 'ça colle au cercle IA/OSS et ça décolle cette semaine',
}

export function formatDigestMessage(repos: DigestRepo[], dateLabel: string): string {
  const lines = [
    `## GitHub qui décolle — ${dateLabel}`,
    '',
    '_Pente ★ semaine ou jour / total. Liens sans embed._',
    '',
  ]
  for (const r of repos) {
    const pente = formatPente(r)
    const why = clip(r.desc || r.readmeExcerpt, 180)
    const context = [r.lang, r.ageDays < 120 ? `${r.ageDays} j` : null, `${fmtStars(r.stars)} ★`]
      .filter(Boolean)
      .join(' · ')
    lines.push(`**${bucketLabel(r.bucket)}** · **${r.full}** · ${pente}`)
    lines.push(`<${r.url}>`)
    lines.push(`${why} **Quand :** ${WHEN[r.bucket]}. **Contexte :** ${context}.`)
    lines.push('')
  }
  lines.push('Discussion → **thread**.')
  let body = lines.join('\n').trim()
  if (body.length > DISCORD_CONTENT_MAX) {
    body = `${body.slice(0, DISCORD_CONTENT_MAX - 1)}…`
  }
  return body
}

export function formatPente(
  r: Pick<DigestRepo, 'deltaWeekly' | 'deltaDaily' | 'relWeek' | 'relDay'>,
): string {
  if (r.deltaWeekly && r.relWeek >= 0.08) {
    return `+${fmtStars(r.deltaWeekly)} ★/sem · ${pct(r.relWeek)}`
  }
  if (r.deltaDaily) {
    return `+${fmtStars(r.deltaDaily)} ★/j · ${pct(r.relDay)} / 24h`
  }
  if (r.deltaWeekly) return `+${fmtStars(r.deltaWeekly)} ★/sem`
  return 'trending'
}

function bucketLabel(b: DigestBucket): string {
  const map: Record<DigestBucket, string> = {
    harness: 'Harness',
    agent: 'Agent',
    llm: 'LLM',
    knowledge: 'Knowledge',
    mcp: 'MCP',
    workspace: 'Workspace',
    cloudflare: 'Cloudflare',
    skills: 'Skills',
    eval: 'Eval',
    other: 'OSS',
  }
  return map[b]
}

function fmtStars(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function pct(x: number): string {
  return `${Math.round(x * 100)} %`
}
