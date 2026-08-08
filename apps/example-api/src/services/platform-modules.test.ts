import { createDb } from '@kit/db'
import { FLOWS_MODULE_ID } from '@kit/flows'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { isModuleConfigured } from '../lib/integration-config'
import { isKitModuleId, KIT_MODULE_IDS } from '../lib/kit-modules'
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

  it('registers flows in kit module catalogue (ensure + configured V0)', async () => {
    expect(KIT_MODULE_IDS).toContain(FLOWS_MODULE_ID)
    expect(isKitModuleId('flows')).toBe(true)
    expect(isModuleConfigured(FLOWS_MODULE_ID, null)).toBe(true)

    const d = await db()
    await platformModulesService.ensurePlatformModules(d)
    const list = await platformModulesService.listPlatformPublic(d)
    expect(list.flows).toMatchObject({
      available: false,
      configured: true,
    })

    await platformModulesService.setPlatformAvailable(d, FLOWS_MODULE_ID, true)
    const after = await platformModulesService.listPlatformPublic(d)
    expect(after.flows.available).toBe(true)
  })

  it('ensureSystemRoles seeds flows write for owner/admin only (not member)', async () => {
    const d = await db()
    const { ensureSystemRoles, listRolesWithGrants } = await import('./org-roles')
    await ensureSystemRoles(d, 'org_flows_seed')
    const roles = await listRolesWithGrants(d, 'org_flows_seed')
    const byKey = Object.fromEntries(roles.map((r) => [r.key, r]))
    const access = (key: string) =>
      byKey[key]?.grants.find((g) => g.moduleId === FLOWS_MODULE_ID)?.access
    expect(access('owner')).toBe('write')
    expect(access('admin')).toBe('write')
    expect(access('member')).toBe('disabled')
    expect(access('reader')).toBe('disabled')
  })
})
