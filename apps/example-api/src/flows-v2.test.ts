import { describe, expect, it } from 'vitest'
import { INVOKE_ONLY_PLAN_YAML } from './flows-run/fixtures'
import { mintApiKey } from './services/auth'
import {
  BOTH_ORGS,
  bearerHeaders,
  enableFlowsForOrgs,
  expectError,
  login,
  MEMBER_EMAIL,
  ORG_ACME,
  STAFF_EMAIL,
  seedFlowsApp,
  sessionHeaders,
} from './test/flows-fixture'

describe('V2 publish + enable', () => {
  it('POST /api/flows/plans with allowedTools net is 400 VALIDATION_ERROR', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers: sessionHeaders(cookie),
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML, allowedTools: ['net'] }),
      },
      env,
    )
    await expectError(res, 400, 'VALIDATION_ERROR')
  })

  it('POST /api/flows/plans with extra grant key is 400', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers: sessionHeaders(cookie),
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML, grant: {} }),
      },
      env,
    )
    await expectError(res, 400, 'VALIDATION_ERROR')
  })

  it('POST /api/flows/plans duplicate plan_key same org is 409 CONFLICT', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const headers = sessionHeaders(cookie)
    const body = JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML })
    const first = await app.request('/api/flows/plans', { method: 'POST', headers, body }, env)
    expect(first.status).toBe(201)
    const dup = await app.request('/api/flows/plans', { method: 'POST', headers, body }, env)
    await expectError(dup, 409, 'CONFLICT')
  })

  it('PATCH /api/flows/plans/:planId enabled false then GET shows enabled false', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const headers = sessionHeaders(cookie)
    const created = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }),
      },
      env,
    )
    expect(created.status).toBe(201)
    const { plan } = (await created.json()) as { plan: { id: string } }
    const patch = await app.request(
      `/api/flows/plans/${plan.id}`,
      { method: 'PATCH', headers, body: JSON.stringify({ enabled: false }) },
      env,
    )
    expect(patch.ok).toBe(true)
    const get = await app.request(`/api/flows/plans/${plan.id}`, { headers }, env)
    expect(get.status).toBe(200)
    const got = (await get.json()) as { plan: { enabled: boolean } }
    expect(got.plan.enabled).toBe(false)
  })

  it('POST /api/flows/plans is 403 for org-bound sk_ Bearer', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const minted = await mintApiKey(db, 'user_staff', {
      organizationId: ORG_ACME,
      name: 'flows-sk-post',
    })
    const res = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers: bearerHeaders(minted.key),
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }),
      },
      env,
    )
    await expectError(res, 403, 'FORBIDDEN')
  })

  it('POST /api/flows/plans is 403 for seed member on org_acme', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, MEMBER_EMAIL)
    const res = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers: sessionHeaders(cookie, ORG_ACME),
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }),
      },
      env,
    )
    await expectError(res, 403, 'FORBIDDEN')
  })

  // T13: in-flight queued-after-disable lives in flows-v3.test.ts (POST 202 then PATCH)
})
