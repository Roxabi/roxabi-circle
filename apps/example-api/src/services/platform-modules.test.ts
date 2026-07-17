import { createDb } from '@gosilex/db'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { createMemoryEnv } from '../test/memory-env'
import * as modulesService from './modules'
import * as platformModulesService from './platform-modules'

describe('platform-modules service (coverage / ADR dual-level)', () => {
  async function db() {
    const env = createMemoryEnv({ ENVIRONMENT: 'test' })
    return createDb(env.DB as unknown as D1Database, schema)
  }

  it('ensure + list platform public state', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    const list = await platformModulesService.listPlatformPublic(d)
    expect(list.feedback).toMatchObject({
      available: false,
      configured: false,
    })
  })

  it('effective = available ∧ org enabled', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    // configure + make available via modules SSoT
    await modulesService.saveFeedbackIntegration(d, {
      sparkUrl: 'http://localhost:3939',
      sparkApiKey: 'spk_test_key_12',
    })
    await platformModulesService.setPlatformAvailable(d, 'feedback', true)

    await platformModulesService.setOrgModuleEnabled(d, 'org_x', 'feedback', false)
    expect(await platformModulesService.isModuleEffective(d, 'org_x', 'feedback')).toBe(false)

    await platformModulesService.setOrgModuleEnabled(d, 'org_x', 'feedback', true)
    expect(await platformModulesService.isModuleEffective(d, 'org_x', 'feedback')).toBe(true)

    const eff = await platformModulesService.getOrgModulesEffective(d, 'org_x')
    expect(eff.feedback.effective).toBe(true)
    expect(eff.feedback.available).toBe(true)
    expect(eff.feedback.enabled).toBe(true)
  })

  it('rejects enable when platform unavailable', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await expect(
      platformModulesService.setOrgModuleEnabled(d, 'org_x', 'feedback', true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects enable when locked', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await modulesService.saveFeedbackIntegration(d, {
      sparkUrl: 'http://localhost:3939',
      sparkApiKey: 'spk_test_key_12',
    })
    await platformModulesService.setPlatformAvailable(d, 'feedback', true)
    const { upsertOrgModule } = await import('../repos/platform-modules')
    await upsertOrgModule(d, {
      organizationId: 'org_locked',
      moduleId: 'feedback',
      enabled: false,
      locked: true,
      updatedAt: Date.now(),
    })
    await expect(
      platformModulesService.setOrgModuleEnabled(d, 'org_locked', 'feedback', true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('setPlatformAvailable requires configuration', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await expect(
      platformModulesService.setPlatformAvailable(d, 'feedback', true),
    ).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' })
  })
})
