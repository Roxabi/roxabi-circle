import { describe, expect, it } from 'vitest'
import { INVOKE_ONLY_PLAN_YAML } from './flows-run/fixtures'
import { mintApiKey } from './services/auth'
import {
  BOTH_ORGS,
  bearerHeaders,
  enableFlowsForOrgs,
  expectError,
  freshApp,
  insertTeamPlanAndRun,
  login,
  MEMBER_EMAIL,
  mintOperatorWriteOnAcme,
  ORG_ACME,
  ORIGIN,
  operator,
  STAFF_EMAIL,
  seedFlowsApp,
  sessionHeaders,
} from './test/flows-fixture'

describe('flows admin API (V1 gates + GET)', () => {
  it('GET /api/flows/plans is 401 without cookie', async () => {
    const { app, env } = freshApp()
    const res = await app.request('/api/flows/plans', {}, env)
    await expectError(res, 401, 'UNAUTHORIZED')
  })

  it('GET /api/flows/runs is 401 without cookie', async () => {
    const { app, env } = freshApp()
    const res = await app.request('/api/flows/runs', {}, env)
    await expectError(res, 401, 'UNAUTHORIZED')
  })

  it('GET /api/flows/plans is 400 when session is missing X-Org-Id', async () => {
    const { app, env } = await seedFlowsApp()
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request(
      '/api/flows/plans',
      {
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
      },
      env,
    )
    await expectError(res, 400, 'VALIDATION_ERROR')
  })

  it('GET plans and runs are 403 for org-bound sk_ Bearer (not 401)', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const minted = await mintApiKey(db, 'user_staff', {
      organizationId: ORG_ACME,
      name: 'flows-sk',
    })
    const headers = bearerHeaders(minted.key)
    const plans = await app.request('/api/flows/plans', { headers }, env)
    await expectError(plans, 403, 'FORBIDDEN')
    const runs = await app.request('/api/flows/runs', { headers }, env)
    await expectError(runs, 403, 'FORBIDDEN')
  })

  it('GET /api/flows/plans is 404 when flows module is off', async () => {
    const { app, env } = await seedFlowsApp()
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request('/api/flows/plans', { headers: sessionHeaders(cookie) }, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as {
      error: { code: string; message: string }
      requestId: string
    }
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBe('Module not available')
    expect(body.requestId).toMatch(/^req_/)
  })

  it('GET /api/flows/plans returns empty list after enableFlows', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request('/api/flows/plans', { headers: sessionHeaders(cookie) }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plans: unknown[]; requestId: string }
    expect(body.plans).toEqual([])
    expect(body.requestId).toMatch(/^req_/)
  })

  it('GET /api/flows/runs returns empty list after enableFlows', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request('/api/flows/runs', { headers: sessionHeaders(cookie) }, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { runs: unknown[]; requestId: string }
    expect(body.runs).toEqual([])
    expect(body.requestId).toMatch(/^req_/)
  })

  it('GET stolen plan/run id with own X-Org-Id is 404', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const stolenPlanId = 'plan_stolen_team'
    const stolenRunId = 'run_stolen_team'
    await insertTeamPlanAndRun(db, { planId: stolenPlanId, runId: stolenRunId })
    const cookie = await login(app, env, STAFF_EMAIL)
    const headers = sessionHeaders(cookie, ORG_ACME)
    const plan = await app.request(`/api/flows/plans/${stolenPlanId}`, { headers }, env)
    await expectError(plan, 404, 'NOT_FOUND')
    const run = await app.request(`/api/flows/runs/${stolenRunId}`, { headers }, env)
    await expectError(run, 404, 'NOT_FOUND')
  })

  it('GET unknown plan/run id on enabled org_acme is 404', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const headers = sessionHeaders(cookie)
    const plan = await app.request('/api/flows/plans/plan_unknown', { headers }, env)
    await expectError(plan, 404, 'NOT_FOUND')
    const run = await app.request('/api/flows/runs/run_unknown', { headers }, env)
    await expectError(run, 404, 'NOT_FOUND')
  })

  it('GET /api/flows/plans is 403 for seed member on org_acme', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, MEMBER_EMAIL)
    const res = await app.request(
      '/api/flows/plans',
      { headers: sessionHeaders(cookie, ORG_ACME) },
      env,
    )
    await expectError(res, 403, 'FORBIDDEN')
  })
})

describe('V2 publish + enable', () => {
  it('POST /api/flows/plans as staff after enableFlows returns 201 invoke-only plan', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const cookie = await login(app, env, STAFF_EMAIL)
    const res = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers: sessionHeaders(cookie),
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      plan: {
        planKey: string
        version: number
        enabled: boolean
        digest: string
        id: string
        orgId: string
      }
      requestId: string
    }
    expect(body.plan.planKey).toBe('echo-only')
    expect(body.plan.version).toBe(1)
    expect(body.plan.enabled).toBe(true)
    expect(body.plan.digest).toBeTruthy()
    expect(body.plan.id).toBeTruthy()
    expect(body.plan.orgId).toBe(ORG_ACME)
    expect(body.requestId).toMatch(/^req_/)
  })
})

describe('V0 custom write non-admin (operator)', () => {
  it('POST/PATCH/run is 403 for operator with flows=write (not owner/admin)', async () => {
    const { app, env, db } = await seedFlowsApp()
    await enableFlowsForOrgs(db, BOTH_ORGS)
    const staffCookie = await login(app, env, STAFF_EMAIL)
    const staffHeaders = sessionHeaders(staffCookie)
    const mintedVia = await mintOperatorWriteOnAcme(app, env, db, staffCookie)
    expect(mintedVia).toBe('http')

    const published = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers: staffHeaders,
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }),
      },
      env,
    )
    expect(published.status).toBe(201)
    const planId = ((await published.json()) as { plan: { id: string } }).plan.id

    const cookie = await login(app, env, MEMBER_EMAIL)
    const headers = sessionHeaders(cookie, ORG_ACME)
    expect(operator).toBe('operator')

    const list = await app.request('/api/flows/plans', { headers }, env)
    expect(list.status).toBe(200)

    const post = await app.request(
      '/api/flows/plans',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }),
      },
      env,
    )
    await expectError(post, 403, 'FORBIDDEN')

    const patch = await app.request(
      `/api/flows/plans/${planId}`,
      { method: 'PATCH', headers, body: JSON.stringify({ enabled: false }) },
      env,
    )
    await expectError(patch, 403, 'FORBIDDEN')

    const run = await app.request(
      `/api/flows/plans/${planId}/runs`,
      { method: 'POST', headers, body: '{}' },
      env,
    )
    await expectError(run, 403, 'FORBIDDEN')
  })
})

// V3 create-run stubs env.FLOW_RUN.create — see src/flows-v3.test.ts
