import {
  type AxisScore,
  DEFAULT_SPECIALTY_FLOOR,
  DEFAULT_WEIGHTS,
  type ProfileSignals,
  type ScoreReport,
  type ScoreWeights,
} from '../types'
import { clamp01, logNorm } from './normalize'

const SCORER_VERSION = '0.2.0-specialty'

function axis(raw: number, weight: number, notes: string[] = []): AxisScore {
  const r = clamp01(raw)
  return { raw: r, weight, weighted: r * weight, notes }
}

/**
 * Craft / artisan path — public **technical** repos (shared code, not doc dump).
 * Personal public shipping is first-class OSS *publish*.
 */
function craftScore(s: ProfileSignals): { raw: number; notes: string[] } {
  const tech = Math.max(0, s.technicalReposOwned ?? 0)
  const owned = Math.max(0, s.publicReposOwned)
  const techRatio = owned > 0 ? tech / owned : 0

  const reposN = logNorm(tech, 12)
  const addN = logNorm(s.totalAdditions, 50_000)
  const starsN = logNorm(s.totalStarsOnOwned, 100)
  const structN = clamp01(s.structureMean)

  // Code shape + real LOC + some adoption; structure of technical sample
  let raw = 0.35 * addN + 0.25 * reposN + 0.25 * structN + 0.15 * starsN

  // Almost only profile/docs repos → crush craft
  if (tech === 0) raw *= 0.12
  else if (techRatio < 0.35 && owned >= 3) raw *= 0.55 + 0.45 * techRatio

  return {
    raw: clamp01(raw),
    notes: [
      `technicalRepos=${tech}`,
      `publicReposOwned=${owned}`,
      `techRatio=${techRatio.toFixed(2)}`,
      `additions=${s.totalAdditions}`,
      `starsOwned=${s.totalStarsOnOwned}`,
      `structureMean=${s.structureMean.toFixed(3)}`,
    ],
  }
}

/**
 * Ecosystem path — contribute outside pure personal ownership.
 */
function ecosystemScore(s: ProfileSignals): { raw: number; notes: string[] } {
  const prsN = logNorm(s.externalMergedPrs, 15)
  const orgPushN = logNorm(s.orgPushEvents ?? 0, 25)
  const orgsN = logNorm(s.publicOrgCount, 4)
  const collabN = logNorm(s.collabReposCount, 12)

  // Maintain / collab-heavy founders: orgPush + collab dominate over pure PR search
  const raw = 0.4 * orgPushN + 0.3 * collabN + 0.2 * prsN + 0.1 * orgsN

  return {
    raw: clamp01(raw),
    notes: [
      `externalMergedPrs=${s.externalMergedPrs}`,
      `orgPushEvents=${s.orgPushEvents ?? 0}`,
      `collabRepos=${s.collabReposCount}`,
      `publicOrgs=${s.publicOrgCount}`,
    ],
  }
}

function activityScore(s: ProfileSignals): { raw: number; notes: string[] } {
  let lastPush = 0.1
  if (s.daysSinceLastPush === null) lastPush = 0.05
  else if (s.daysSinceLastPush <= 14) lastPush = 1
  else if (s.daysSinceLastPush <= 90) lastPush = 0.6
  else if (s.daysSinceLastPush <= 365) lastPush = 0.3

  const monthsN = clamp01(s.activeMonths12 / 12)
  const eventsN = logNorm(s.publicEvents90d, 80)
  const raw = 0.45 * lastPush + 0.35 * monthsN + 0.2 * eventsN

  return {
    raw: clamp01(raw),
    notes: [
      `daysSinceLastPush=${s.daysSinceLastPush}`,
      `activeMonths12=${s.activeMonths12}`,
      `events90d=${s.publicEvents90d}`,
    ],
  }
}

function aiScore(s: ProfileSignals): { raw: number; notes: string[] } {
  // Secondary signal only — must not carry a tourist alone (low weight in total)
  return {
    raw: clamp01(s.aiAffinity),
    notes: [`aiAffinity=${s.aiAffinity.toFixed(3)}`],
  }
}

export type ScoreOptions = {
  weights?: ScoreWeights
  acceptThreshold?: number
  /** Min max(craft, ecosystem) to accept (default 0.45) */
  specialtyFloor?: number
  version?: string
}

/**
 * Specialty scorer: experts on one path score like balanced profiles.
 *
 * total = 100 * (w_s * max(craft, ecosystem) + w_a * activity + w_ai * ai)
 * accept if total ≥ threshold AND specialty ≥ floor
 */
export function scoreProfile(signals: ProfileSignals, opts: ScoreOptions = {}): ScoreReport {
  const weights = opts.weights ?? DEFAULT_WEIGHTS
  const threshold = opts.acceptThreshold ?? 65
  const specialtyFloor = opts.specialtyFloor ?? DEFAULT_SPECIALTY_FLOOR
  const version = opts.version ?? SCORER_VERSION

  const c = craftScore(signals)
  const e = ecosystemScore(signals)
  const a = activityScore(signals)
  const ai = aiScore(signals)

  const craftRaw = c.raw
  const ecoRaw = e.raw
  const specialty = Math.max(craftRaw, ecoRaw)
  const path: ScoreReport['path'] =
    Math.abs(craftRaw - ecoRaw) < 0.05 ? 'tie' : craftRaw >= ecoRaw ? 'craft' : 'ecosystem'

  const axes = {
    craft: axis(craftRaw, weights.specialty, c.notes),
    ecosystem: axis(ecoRaw, weights.specialty, e.notes),
    activity: axis(a.raw, weights.activity, a.notes),
    ai: axis(ai.raw, weights.ai, ai.notes),
  }

  // specialty weight applied once via max(craft, ecosystem)
  let rawTotal =
    clamp01(weights.specialty * specialty + weights.activity * a.raw + weights.ai * ai.raw) * 100

  // Hidden +10: monorepo-only one-line ASCII in apply PR body
  // (docs/product/.hidden/entry-bonus.md · entry-bonus.ts)
  const bonus = signals.entryPrBonus ? 10 : 0
  rawTotal = Math.min(100, rawTotal + bonus)

  const rounded = Math.round(rawTotal * 10) / 10

  let decision: 'accept' | 'reject' = rounded >= threshold ? 'accept' : 'reject'
  let hardFail: ScoreReport['hardFail']

  if (specialty < specialtyFloor) {
    decision = 'reject'
    hardFail = {
      reason: `specialty_below_floor:${specialty.toFixed(3)}<${specialtyFloor}`,
    }
  }

  return {
    total: rounded,
    path,
    specialty: Math.round(specialty * 1000) / 1000,
    axes,
    decision,
    hardFail,
    evidence: {
      login: signals.login,
      githubId: signals.githubId,
      threshold,
      specialtyFloor,
      craft: craftRaw,
      ecosystem: ecoRaw,
      technicalReposOwned: signals.technicalReposOwned,
      publicReposOwned: signals.publicReposOwned,
      entryPrBonus: Boolean(signals.entryPrBonus),
      entryPrBonusPoints: bonus,
    },
    version,
  }
}
