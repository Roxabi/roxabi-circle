export type Env = {
  ENVIRONMENT: string
  SCORER_VERSION: string
  ACCEPT_THRESHOLD: string
  DISCORD_PUBLIC_KEY: string
  DISCORD_BOT_TOKEN: string
  DISCORD_APPLICATION_ID: string
  DISCORD_GUILD_ID: string
  DISCORD_MEMBER_ROLE_ID: string
  /** Category parent for private appeal ticket channels */
  DISCORD_APPEAL_CATEGORY_ID: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  SESSION_SECRET: string
  // DB?: D1Database;
  // STATE?: KVNamespace;
}

export type AxisScore = {
  raw: number
  weight: number
  weighted: number
  notes: string[]
}

/**
 * Specialty scoring report (v0.2).
 * Rewards **max(craft, ecosystem)** so experts on one path score like balanced profiles.
 */
export type ScoreReport = {
  total: number
  /** Which specialty path won: craft | ecosystem | tie */
  path: 'craft' | 'ecosystem' | 'tie'
  /** max(craft, ecosystem) — primary signal */
  specialty: number
  axes: {
    craft: AxisScore
    ecosystem: AxisScore
    activity: AxisScore
    ai: AxisScore
  }
  decision: 'accept' | 'reject'
  hardFail?: { reason: string }
  evidence: Record<string, unknown>
  version: string
}

export type ProfileSignals = {
  githubId: number
  login: string
  accountAgeDays: number
  /** All public non-fork owned repos (incl. profile/docs) */
  publicReposOwned: number
  /**
   * Public non-fork owned repos that look like **code** (not profile/README-only/.github).
   * Primary input for craft path.
   */
  technicalReposOwned: number
  totalAdditions: number
  totalDeletions: number
  totalStarsOnOwned: number
  daysSinceLastPush: number | null
  publicEvents90d: number
  activeMonths12: number
  /** 0..1 mean structure score across sampled technical repos */
  structureMean: number
  /** 0..1 keyword/topic AI affinity */
  aiAffinity: number
  externalMergedPrs: number
  publicOrgCount: number
  collabReposCount: number
  /**
   * Push events (public) on verified org repos (owner ≠ user).
   */
  orgPushEvents: number
  /**
   * Hidden +10 if apply PR body is exactly one line of monorepo-only ASCII art.
   * Discoverable only by scanning roxabi-circle (not circle-applications alone).
   */
  entryPrBonus?: boolean
}

/** Blend weights for final total (not per legacy axis). */
export type ScoreWeights = {
  /** Weight on specialty = max(craft, ecosystem) */
  specialty: number
  activity: number
  ai: number
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  specialty: 0.7,
  activity: 0.2,
  ai: 0.1,
}

/** Min specialty raw to accept (blocks pure AI/activity tourists). */
export const DEFAULT_SPECIALTY_FLOOR = 0.45
