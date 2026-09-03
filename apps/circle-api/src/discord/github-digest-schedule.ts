/**
 * GitHub digest — schedule window (pure, no I/O).
 * Cron is UTC; the digest slot is expressed in Europe/Paris, so DST shifts the
 * matching cron between 10:30 and 11:30 UTC. Both are registered.
 */

export const DIGEST_CRONS = ['30 10 * * *', '30 11 * * *'] as const

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
