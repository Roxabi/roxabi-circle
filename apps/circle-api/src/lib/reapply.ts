/** Cooldown after first rejection. */
export const FIRST_REJECT_COOLDOWN_MS = 48 * 60 * 60 * 1000

/** Cooldown after 2nd+ rejection. */
export const LATER_REJECT_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000

/**
 * @param priorRejectCount how many finished rejections this user already has
 *   (0 = just got / about to get their first reject → 48h)
 * @param decidedAtMs timestamp of the latest rejection decision
 */
export function nextEligibleAtMs(priorRejectCount: number, decidedAtMs: number): number {
  const cooldown = priorRejectCount <= 0 ? FIRST_REJECT_COOLDOWN_MS : LATER_REJECT_COOLDOWN_MS
  return decidedAtMs + cooldown
}

export function canReapply(
  priorRejectCount: number,
  decidedAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs >= nextEligibleAtMs(priorRejectCount, decidedAtMs)
}

/** FR label for DM copy. */
export function cooldownLabelFr(priorRejectCount: number): string {
  return priorRejectCount <= 0 ? '48 heures' : '15 jours'
}
