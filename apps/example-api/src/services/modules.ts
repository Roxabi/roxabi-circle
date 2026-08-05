import { AppError } from '@kit/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import {
  type FeedbackIntegrationConfig,
  feedbackIntegrationSaveSchema,
  INTEGRATION_CONFIG_PATHS,
  isModuleConfigured,
  type ModulePublicState,
  maskApiKey,
  parseFeedbackConfig,
} from '../lib/integration-config'
import { isKitModuleId, KIT_MODULE_IDS, type KitModuleId } from '../lib/kit-modules'
import * as modulesRepo from '../repos/modules'
import * as platformModulesRepo from '../repos/platform-modules'
import * as platformModulesService from './platform-modules'

type Db = DrizzleD1Database<typeof schema>

/**
 * Idempotent bootstrap — platform_modules SSoT only (ADR-0003 residual fix).
 * Name kept for call-site compatibility; no longer writes kit_modules.
 */
export async function ensureKitModules(db: Db): Promise<void> {
  await platformModulesService.ensurePlatformModules(db)
}

/** Prefer platform catalogue; fall back to kit_modules for pre-migration DBs. */
async function readModuleRow(db: Db, id: KitModuleId) {
  const platform = await platformModulesRepo.getPlatformModule(db, id)
  if (platform) {
    return {
      enabled: Boolean(platform.available),
      configJson: platform.configJson,
      source: 'platform' as const,
    }
  }
  const kit = await modulesRepo.getKitModule(db, id)
  return {
    enabled: Boolean(kit?.enabled),
    configJson: kit?.configJson ?? null,
    source: 'kit' as const,
  }
}

export async function getModulesState(db: Db): Promise<Record<KitModuleId, ModulePublicState>> {
  await ensureKitModules(db)
  return Object.fromEntries(
    await Promise.all(
      KIT_MODULE_IDS.map(async (id) => {
        const row = await readModuleRow(db, id)
        return [
          id,
          {
            // SPA "enabled" maps to platform.available in dual-level model (legacy path)
            enabled: row.enabled,
            configured: isModuleConfigured(id, row.configJson),
            configPath: INTEGRATION_CONFIG_PATHS[id],
          },
        ] as const
      }),
    ),
  ) as Record<KitModuleId, ModulePublicState>
}

export async function isModuleEnabled(db: Db, id: KitModuleId): Promise<boolean> {
  const row = await readModuleRow(db, id)
  return row.enabled
}

export async function setModuleEnabled(db: Db, id: string, enabled: boolean): Promise<void> {
  if (!isKitModuleId(id)) {
    throw AppError.notFound('Unknown module')
  }
  await ensureKitModules(db)
  const row = await readModuleRow(db, id)
  if (enabled && !isModuleConfigured(id, row.configJson)) {
    throw AppError.integrationNotConfigured(
      'Configure the integration before enabling this module',
      { moduleId: id, configPath: INTEGRATION_CONFIG_PATHS[id] },
    )
  }
  const now = Date.now()
  // Platform SSoT (ADR-0003 / review fix) — no kit_modules write
  await platformModulesRepo.upsertPlatformModule(db, {
    moduleId: id,
    available: enabled,
    configJson: row.configJson,
    updatedAt: now,
  })
}

export type FeedbackIntegrationPublic = {
  id: 'feedback'
  configured: boolean
  pilotageUrl: string
  hasApiKey: boolean
  apiKeyPreview: string | null
}

export async function getFeedbackIntegrationPublic(db: Db): Promise<FeedbackIntegrationPublic> {
  await ensureKitModules(db)
  const row = await readModuleRow(db, 'feedback')
  const parsed = parseFeedbackConfig(row.configJson)
  return {
    id: 'feedback',
    configured: parsed !== null,
    pilotageUrl: parsed?.pilotageUrl ?? '',
    hasApiKey: Boolean(parsed?.pilotageApiKey),
    apiKeyPreview: parsed?.pilotageApiKey ? maskApiKey(parsed.pilotageApiKey) : null,
  }
}

export async function saveFeedbackIntegration(
  db: Db,
  input: { pilotageUrl: string; pilotageApiKey?: string },
): Promise<FeedbackIntegrationPublic> {
  const parsed = feedbackIntegrationSaveSchema.safeParse(input)
  if (!parsed.success) {
    throw AppError.validation('Invalid feedback integration', parsed.error.flatten().fieldErrors)
  }

  await ensureKitModules(db)
  const row = await readModuleRow(db, 'feedback')
  const existing = parseFeedbackConfig(row.configJson)
  const apiKey = parsed.data.pilotageApiKey?.trim() || existing?.pilotageApiKey || ''
  if (!apiKey) {
    throw AppError.validation('pilotageApiKey is required on first setup')
  }

  const next: FeedbackIntegrationConfig = {
    pilotageUrl: parsed.data.pilotageUrl,
    pilotageApiKey: apiKey,
  }
  const json = JSON.stringify(next)
  const now = Date.now()
  // Platform SSoT only
  await platformModulesRepo.upsertPlatformModule(db, {
    moduleId: 'feedback',
    available: row.enabled,
    configJson: json,
    updatedAt: now,
  })
  return getFeedbackIntegrationPublic(db)
}

export async function getFeedbackPilotageRuntime(
  db: Db,
): Promise<{ pilotageUrl: string; pilotageApiKey: string } | null> {
  await ensureKitModules(db)
  const row = await readModuleRow(db, 'feedback')
  const parsed = parseFeedbackConfig(row.configJson)
  if (!parsed) return null
  return { pilotageUrl: parsed.pilotageUrl, pilotageApiKey: parsed.pilotageApiKey }
}
