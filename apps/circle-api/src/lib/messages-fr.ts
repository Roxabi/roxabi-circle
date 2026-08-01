/**
 * User-facing FR copy. Never include axes / criteria / hints.
 */

export function acceptDm(score: number): string {
  return [
    '**Bienvenue dans le Roxabi Circle.**',
    '',
    `Score : **${formatScore(score)}/100**`,
    'Tu as le rôle membre. Lis #règles et présente-toi dans #intros.',
  ].join('\n')
}

export function rejectDm(opts: {
  score: number
  /** rejects already on record before this one (0 = first reject) */
  priorRejectCount: number
}): string {
  const cooldown = opts.priorRejectCount <= 0 ? '48 heures' : '15 jours'
  return [
    '**Roxabi Circle — candidature**',
    '',
    `Score : **${formatScore(opts.score)}/100**`,
    'Décision : non retenue pour l’instant.',
    '',
    `Tu auras une nouvelle chance dans **${cooldown}**.`,
    'Ensuite, une tentative tous les **15 jours**.',
    '',
    'Pas d’indice sur l’évaluation — à toi de chercher 😉',
    'Si ton travail open source est surtout privé / ailleurs, ouvre un ticket dans **#appeal**.',
  ].join('\n')
}

export function alreadyMemberEphemeral(): string {
  return 'Tu es déjà membre du Roxabi Circle.'
}

export function cooldownEphemeral(nextEligibleAtMs: number, nowMs = Date.now()): string {
  const ms = Math.max(0, nextEligibleAtMs - nowMs)
  const hours = Math.ceil(ms / (60 * 60 * 1000))
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  const wait = hours <= 48 ? `environ ${hours} h` : `environ ${days} jour${days > 1 ? 's' : ''}`
  return `Prochaine tentative dans ${wait}. Patience.`
}

function formatScore(score: number): string {
  // Show one decimal only if needed
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}
