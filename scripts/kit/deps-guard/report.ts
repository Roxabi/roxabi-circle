import type { Verdict } from './types.ts'

/** Hidden marker: the workflow finds and edits its own PR comment by this string. */
const COMMENT_MARKER = '<!-- kit-deps-guard -->'

export function renderText(v: Verdict): string {
  const lines = [`deps-guard: ${v.verdict}`, ...v.checked.map((c) => `  checked ${c}`)]
  for (const r of v.reasons) lines.push(`  ${r.code}  ${r.subject}  ${r.detail}`)
  return lines.join('\n')
}

export function renderComment(v: Verdict, headSha: string | undefined): string {
  const head = headSha ? ` on \`${headSha.slice(0, 12)}\`` : ''
  const rows = v.reasons.map(
    (r) => `| \`${r.code}\` | \`${r.subject}\` | ${r.detail.replaceAll('|', '\\|')} |`,
  )
  return [
    COMMENT_MARKER,
    `### \`deps-automerge\` withheld${head}`,
    '',
    'The supply-chain guard (`docs/kit/security-dependabot.md`) found findings requiring independent-agent review. The label is **not** applied. Under an operator-approved plan, agents investigate and address the findings, then re-run the guard to record its outcome. A PASS restores only automated `deps-automerge` eligibility. A WITHHOLD remains a label refusal, not a bypassable landing decision: an operator-approved remediation PR follows current-head proof, independent review, applicable CI and normal admission; no raw label or manual merge may bypass a refusal.',
    '',
    '| Reason | Subject | Detail |',
    '|---|---|---|',
    ...rows,
    '',
    `<sub>${v.checked.join(' · ')}</sub>`,
  ].join('\n')
}
