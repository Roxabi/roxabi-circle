export type HealthResponse = {
  ok: boolean
  service?: string
  requestId: string
  environment?: string
  demoLogin?: {
    email: string
    password: string
    role: string
  }
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
