import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { createMemoryEnv } from '../test/memory-env'
import {
  ensureKitModules,
  getModulesState,
  isModuleEnabled,
  saveFeedbackIntegration,
  setModuleEnabled,
} from './modules'

describe('kit modules service', () => {
  it('creates modules disabled and unconfigured by default', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)
    await ensureKitModules(db)
    const state = await getModulesState(db)
    expect(state.feedback).toEqual({
      enabled: false,
      configured: false,
      configPath: '/settings/integrations/feedback',
    })
  })

  it('blocks enable until integration is configured', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)
    await ensureKitModules(db)
    await expect(setModuleEnabled(db, 'feedback', true)).rejects.toMatchObject({
      code: 'INTEGRATION_NOT_CONFIGURED',
    })
  })

  it('allows enable after Pilotage config is saved', async () => {
    const env = createMemoryEnv()
    const db = createDb(env.DB, schema)
    await ensureKitModules(db)
    await saveFeedbackIntegration(db, {
      pilotageUrl: 'http://localhost:3939',
      pilotageApiKey: 'fbk_test_key_12',
    })
    await setModuleEnabled(db, 'feedback', true)
    expect(await isModuleEnabled(db, 'feedback')).toBe(true)
  })
})
