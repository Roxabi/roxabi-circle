import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { createMemoryEnv } from '../test/memory-env'
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
    expect(list.demo).toMatchObject({
      available: false,
      configured: true,
    })
  })

  it('effective = available ∧ org enabled', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await platformModulesService.setPlatformAvailable(d, 'demo', true)

    await platformModulesService.setOrgModuleEnabled(d, 'org_x', 'demo', false)
    expect(await platformModulesService.isModuleEffective(d, 'org_x', 'demo')).toBe(false)

    await platformModulesService.setOrgModuleEnabled(d, 'org_x', 'demo', true)
    expect(await platformModulesService.isModuleEffective(d, 'org_x', 'demo')).toBe(true)

    const eff = await platformModulesService.getOrgModulesEffective(d, 'org_x')
    expect(eff.demo.effective).toBe(true)
    expect(eff.demo.available).toBe(true)
    expect(eff.demo.enabled).toBe(true)
  })

  it('rejects enable when platform unavailable', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await expect(
      platformModulesService.setOrgModuleEnabled(d, 'org_x', 'demo', true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects enable when locked', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await platformModulesService.setPlatformAvailable(d, 'demo', true)
    const { upsertOrgModule } = await import('../repos/platform-modules')
    await upsertOrgModule(d, {
      organizationId: 'org_locked',
      moduleId: 'demo',
      enabled: false,
      locked: true,
      updatedAt: Date.now(),
    })
    await expect(
      platformModulesService.setOrgModuleEnabled(d, 'org_locked', 'demo', true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('setPlatformAvailable succeeds for demo without remote config', async () => {
    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    await platformModulesService.setPlatformAvailable(d, 'demo', true)
    const list = await platformModulesService.listPlatformPublic(d)
    expect(list.demo.available).toBe(true)
  })
})
