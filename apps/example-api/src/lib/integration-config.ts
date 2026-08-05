import type { KitModuleId } from './kit-modules'

/** SPA path for module settings (demo has no remote integration). */
export const INTEGRATION_CONFIG_PATHS: Record<KitModuleId, string> = {
  demo: '/admin/modules',
}

export type ModulePublicState = {
  enabled: boolean
  configured: boolean
  configPath: string
}

/** Demo module needs no external credentials. */
export function isModuleConfigured(
  id: KitModuleId,
  _configJson: string | null | undefined,
): boolean {
  return id === 'demo'
}

export function maskApiKey(key: string): string {
  const k = key.trim()
  if (k.length <= 8) return '••••••••'
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}
