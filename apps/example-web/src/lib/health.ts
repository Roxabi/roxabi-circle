export type HealthResponse = {
  ok: boolean
  service?: string
  requestId: string
  environment?: string
  /** Public BA sign-up (`/sign-up`). Absent / false = fail-closed (invite/admin only). */
  allowPublicSignup?: boolean
  demoLogin?: {
    email: string
    password: string
    role: string
  }
}

/** SPA gate — only explicit `true` from `/health` enables the signup surface. */
export function isPublicSignupEnabled(
  health: Pick<HealthResponse, 'allowPublicSignup'> | undefined,
): boolean {
  return health?.allowPublicSignup === true
}

export const healthQueryKey = ['health'] as const

const BANNER_ENVS = new Set(['development', 'test', 'staging'])

export function shouldShowEnvBanner(environment: string | undefined): boolean {
  if (!environment) return false
  return BANNER_ENVS.has(environment.trim().toLowerCase())
}

export function isLocalBannerEnvironment(environment: string | undefined): boolean {
  const env = environment?.trim().toLowerCase()
  return env === 'development' || env === 'test'
}
