import {
  type AxisScore,
  DEFAULT_WEIGHTS,
  type ProfileSignals,
  type ScoreReport,
  type ScoreWeights,
} from '../types'
import { clamp01, logNorm } from './normalize'

const SCORER_VERSION = '0.1.0'

function axis(raw: number, weight: number, notes: string[] = []): AxisScore {
  const r = clamp01(raw)
  return { raw: r, weight, weighted: r * weight, notes }
}

function volumeScore(s: ProfileSignals): { raw: number; notes: string[] } {
  const reposN = logNorm(s.publicReposOwned, 30)
  const addN = logNorm(s.totalAdditions, 50_000)
  const starsN = logNorm(s.totalStarsOnOwned, 200)
  const raw = 0.5 * addN + 0.3 * reposN + 0.2 * starsN
  const notes = [
    `repos=${s.publicReposOwned}`,
    `additions=${s.totalAdditions}`,
    `stars=${s.totalStarsOnOwned}`,
  ]
  return { raw, notes }
}

function structureScore(s: ProfileSignals): { raw: number; notes: string[] } {
  return {
    raw: clamp01(s.structureMean),
    notes: [`structureMean=${s.structureMean.toFixed(3)}`],
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
    raw,
    notes: [
      `daysSinceLastPush=${s.daysSinceLastPush}`,
      `activeMonths12=${s.activeMonths12}`,
      `events90d=${s.publicEvents90d}`,
    ],
  }
}

function aiScore(s: ProfileSignals): { raw: number; notes: string[] } {
  return {
    raw: clamp01(s.aiAffinity),
    notes: [`aiAffinity=${s.aiAffinity.toFixed(3)}`],
  }
}

function ossScore(s: ProfileSignals): { raw: number; notes: string[] } {
  const prsN = logNorm(s.externalMergedPrs, 20)
  const orgsN = logNorm(s.publicOrgCount, 5)
  const collabN = logNorm(s.collabReposCount, 15)
  const raw = 0.55 * prsN + 0.25 * orgsN + 0.2 * collabN
  return {
    raw,
    notes: [
      `externalMergedPrs=${s.externalMergedPrs}`,
      `publicOrgs=${s.publicOrgCount}`,
      `collabRepos=${s.collabReposCount}`,
    ],
  }
}

export type ScoreOptions = {
  weights?: ScoreWeights
  acceptThreshold?: number
  version?: string
}

/**
 * Deterministic GitHub profile scorer. Pure — no I/O.
 */
export function scoreProfile(signals: ProfileSignals, opts: ScoreOptions = {}): ScoreReport {
  const weights = opts.weights ?? DEFAULT_WEIGHTS
  const threshold = opts.acceptThreshold ?? 65
  const version = opts.version ?? SCORER_VERSION

  // D8 age hard-fail removed — unlock scoring is D11 (entry PR), not account age.

  const v = volumeScore(signals)
  const st = structureScore(signals)
  const a = activityScore(signals)
  const ai = aiScore(signals)
  const o = ossScore(signals)

  const axes = {
    volume: axis(v.raw, weights.volume, v.notes),
    structure: axis(st.raw, weights.structure, st.notes),
    activity: axis(a.raw, weights.activity, a.notes),
    ai: axis(ai.raw, weights.ai, ai.notes),
    oss: axis(o.raw, weights.oss, o.notes),
  }

  const total =
    clamp01(
      axes.volume.weighted +
        axes.structure.weighted +
        axes.activity.weighted +
        axes.ai.weighted +
        axes.oss.weighted,
    ) * 100

  const rounded = Math.round(total * 10) / 10

  return {
    total: rounded,
    axes,
    decision: rounded >= threshold ? 'accept' : 'reject',
    evidence: {
      login: signals.login,
      githubId: signals.githubId,
      threshold,
    },
    version,
  }
}
