export type Env = {
  ENVIRONMENT: string
  SCORER_VERSION: string
  ACCEPT_THRESHOLD: string
  DISCORD_PUBLIC_KEY: string
  DISCORD_BOT_TOKEN: string
  DISCORD_APPLICATION_ID: string
  DISCORD_GUILD_ID: string
  DISCORD_MEMBER_ROLE_ID: string
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

export type ScoreReport = {
  total: number
  axes: {
    volume: AxisScore
    structure: AxisScore
    activity: AxisScore
    ai: AxisScore
    oss: AxisScore
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
  publicReposOwned: number
  totalAdditions: number
  totalDeletions: number
  totalStarsOnOwned: number
  daysSinceLastPush: number | null
  publicEvents90d: number
  activeMonths12: number
  /** 0..1 mean structure score across sampled repos */
  structureMean: number
  /** weighted keyword / topic hits, pre-normalized 0..1 */
  aiAffinity: number
  externalMergedPrs: number
  publicOrgCount: number
  collabReposCount: number
}

export type ScoreWeights = {
  volume: number
  structure: number
  activity: number
  ai: number
  oss: number
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  volume: 0.25,
  structure: 0.15,
  activity: 0.2,
  ai: 0.2,
  oss: 0.2,
}
