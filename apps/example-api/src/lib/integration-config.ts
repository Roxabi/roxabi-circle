import { FLOWS_MODULE_ID } from '@kit/flows'
import type { KitModuleId } from './kit-modules'

/**
 * Modules that need no external credentials / integration config JSON.
 * Expanding this set is intentional — keep non-members fail-closed in isModuleConfigured.
 */
export const NO_CONFIG_MODULES = new Set<KitModuleId>(['demo', FLOWS_MODULE_ID])

/** SPA path for module settings (demo/flows have no remote integration). */
export const INTEGRATION_CONFIG_PATHS: Record<KitModuleId, string> = {
  demo: '/admin/modules',
  [FLOWS_MODULE_ID]: '/admin/modules',
}

export type ModulePublicState = {
  enabled: boolean
  configured: boolean
  configPath: string
}

/** True when the module needs no external secrets (NO_CONFIG_MODULES). */
export function isModuleConfigured(
  id: KitModuleId,
  _configJson: string | null | undefined,
): boolean {
  return NO_CONFIG_MODULES.has(id)
}

export function maskApiKey(key: string): string {
  const k = key.trim()
  if (k.length <= 8) return '••••••••'
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}
