import { z } from 'zod'
import type { KitModuleId } from './kit-modules'

export const INTEGRATION_CONFIG_PATHS: Record<KitModuleId, string> = {
  feedback: '/settings/integrations/feedback',
}

export const feedbackIntegrationSchema = z.object({
  pilotageUrl: z.string().url(),
  pilotageApiKey: z.string().min(8),
})

export type FeedbackIntegrationConfig = z.infer<typeof feedbackIntegrationSchema>

export const feedbackIntegrationSaveSchema = z.object({
  pilotageUrl: z.string().url(),
  /** Omit or empty to keep the stored key. */
  pilotageApiKey: z.string().optional(),
})

export type ModulePublicState = {
  enabled: boolean
  configured: boolean
  configPath: string
}

export function parseFeedbackConfig(
  raw: string | null | undefined,
): FeedbackIntegrationConfig | null {
  if (!raw?.trim()) return null
  try {
    const parsed = feedbackIntegrationSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function isModuleConfigured(
  id: KitModuleId,
  configJson: string | null | undefined,
): boolean {
  if (id === 'feedback') return parseFeedbackConfig(configJson) !== null
  return false
}

export function maskApiKey(key: string): string {
  const k = key.trim()
  if (k.length <= 8) return '••••••••'
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}
