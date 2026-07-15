import { AppError } from '@gosilex/core'
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
import {
  isKitModuleId,
  KIT_MODULE_DEFAULTS,
  KIT_MODULE_IDS,
  type KitModuleId,
} from '../lib/kit-modules'
import * as modulesRepo from '../repos/modules'

type Db = DrizzleD1Database<typeof schema>

/** Idempotent bootstrap — inserts missing rows (disabled, no config). */
export async function ensureKitModules(db: Db): Promise<void> {
  const now = Date.now()
  for (const mod of KIT_MODULE_DEFAULTS) {
    const row = await modulesRepo.getKitModule(db, mod.id)
    if (row) continue
    await modulesRepo.insertKitModule(db, mod.id, false, null, now)
  }
}

export async function getModulesState(db: Db): Promise<Record<KitModuleId, ModulePublicState>> {
  const rows = await modulesRepo.listKitModules(db)
  const byId = new Map(rows.map((r) => [r.id, r]))
  return Object.fromEntries(
    KIT_MODULE_IDS.map((id) => {
      const row = byId.get(id)
      return [
        id,
        {
          enabled: Boolean(row?.enabled),
          configured: isModuleConfigured(id, row?.configJson),
          configPath: INTEGRATION_CONFIG_PATHS[id],
        },
      ]
    }),
  ) as Record<KitModuleId, ModulePublicState>
}

export async function isModuleEnabled(db: Db, id: KitModuleId): Promise<boolean> {
  const row = await modulesRepo.getKitModule(db, id)
  return Boolean(row?.enabled)
}

export async function setModuleEnabled(db: Db, id: string, enabled: boolean): Promise<void> {
  if (!isKitModuleId(id)) {
    throw AppError.notFound('Unknown module')
  }
  const row = await modulesRepo.getKitModule(db, id)
  if (!row) {
    throw AppError.notFound('Unknown module')
  }
  if (enabled && !isModuleConfigured(id, row.configJson)) {
    throw AppError.integrationNotConfigured(
      'Configure the integration before enabling this module',
      { moduleId: id, configPath: INTEGRATION_CONFIG_PATHS[id] },
    )
  }
  await modulesRepo.setKitModuleEnabled(db, id, enabled, Date.now())
}

export type FeedbackIntegrationPublic = {
  id: 'feedback'
  configured: boolean
  sparkUrl: string
  hasApiKey: boolean
  apiKeyPreview: string | null
}

export async function getFeedbackIntegrationPublic(db: Db): Promise<FeedbackIntegrationPublic> {
  const row = await modulesRepo.getKitModule(db, 'feedback')
  const parsed = parseFeedbackConfig(row?.configJson)
  return {
    id: 'feedback',
    configured: parsed !== null,
    sparkUrl: parsed?.sparkUrl ?? '',
    hasApiKey: Boolean(parsed?.sparkApiKey),
    apiKeyPreview: parsed?.sparkApiKey ? maskApiKey(parsed.sparkApiKey) : null,
  }
}

export async function saveFeedbackIntegration(
  db: Db,
  input: { sparkUrl: string; sparkApiKey?: string },
): Promise<FeedbackIntegrationPublic> {
  const parsed = feedbackIntegrationSaveSchema.safeParse(input)
  if (!parsed.success) {
    throw AppError.validation('Invalid feedback integration', parsed.error.flatten().fieldErrors)
  }

  await ensureKitModules(db)
  const row = await modulesRepo.getKitModule(db, 'feedback')
  if (!row) throw AppError.notFound('Unknown module')

  const existing = parseFeedbackConfig(row.configJson)
  const apiKey = parsed.data.sparkApiKey?.trim() || existing?.sparkApiKey || ''
  if (!apiKey) {
    throw AppError.validation('sparkApiKey is required on first setup')
  }

  const next: FeedbackIntegrationConfig = {
    sparkUrl: parsed.data.sparkUrl,
    sparkApiKey: apiKey,
  }
  await modulesRepo.setKitModuleConfig(db, 'feedback', JSON.stringify(next), Date.now())
  return getFeedbackIntegrationPublic(db)
}

export async function getFeedbackSparkRuntime(
  db: Db,
): Promise<{ sparkUrl: string; sparkApiKey: string } | null> {
  const row = await modulesRepo.getKitModule(db, 'feedback')
  const parsed = parseFeedbackConfig(row?.configJson)
  if (!parsed) return null
  return { sparkUrl: parsed.sparkUrl, sparkApiKey: parsed.sparkApiKey }
}
