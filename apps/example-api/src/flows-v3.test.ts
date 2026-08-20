import { parseRunnerView } from '@kit/flows'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flowRuns } from './db/schema'
import { INVOKE_ONLY_PLAN_YAML } from './flows-run/fixtures'
import { mintApiKey } from './services/auth'
import {
  BOTH_ORGS,
  bearerHeaders,
  enableFlowsForOrgs,
  expectError,
  login,
  ORG_ACME,
  STAFF_EMAIL,
  seedFlowsApp,
  sessionHeaders,
} from './test/flows-fixture'

afterEach(() => {
  vi.restoreAllMocks()
})

const SKIP_FAIL_BUNDLE = {
  receiptVersion: 1 as const,
  tokensUsed: 0,
  tasks: {
    echo_hello: { taskId: 'echo_hello', outcome: 'fail' as const, errorCode: 'INVOKE_FAILED' },
    echo_skip: { taskId: 'echo_skip', outcome: 'skip' as const },
  },
}

type CreateArg = { id: string; params: { runId: string; orgId: string } }

async function staffWithPlan() {
  const { app, env, db } = await seedFlowsApp()
  await enableFlowsForOrgs(db, BOTH_ORGS)
  const cookie = await login(app, env, STAFF_EMAIL)
  const headers = sessionHeaders(cookie)
  const created = await app.request(
    '/api/flows/plans',
    { method: 'POST', headers, body: JSON.stringify({ yaml: INVOKE_ONLY_PLAN_YAML }) },
    env,
  )
  expect(created.status).toBe(201)
  const planId = ((await created.json()) as { plan: { id: string } }).plan.id
  return { app, env, db, headers, planId }
}

function spyCreate(env: Awaited<ReturnType<typeof staffWithPlan>>['env']) {
  const create = vi.fn(async (opts?: { id?: string }) => ({ id: opts?.id ?? 'wf_test' }))
  env.FLOW_RUN.create = create
  return create
}

function assertExactCreateArg(arg: unknown, runId: string) {
  expect(arg).toEqual({ id: runId, params: { runId, orgId: ORG_ACME } })
  const typed = arg as CreateArg
  expect(Object.keys(typed)).toEqual(['id', 'params'])
  expect(Object.keys(typed.params)).toEqual(['runId', 'orgId'])
}

async function postRun(
  app: Awaited<ReturnType<typeof staffWithPlan>>['app'],
  env: Awaited<ReturnType<typeof staffWithPlan>>['env'],
  headers: Record<string, string>,
  planId: string,
  body?: string,
) {
  return app.request(
    `/api/flows/plans/${planId}/runs`,
    { method: 'POST', headers, ...(body === undefined ? {} : { body }) },
    env,
  )
}

describe('V3 create-run + rollup', () => {
  it('POST run with empty body or {} is 202 queued and awaits FLOW_RUN.create with exact params', async () => {
    const { app, env, db, headers, planId } = await staffWithPlan()
    const create = spyCreate(env)

    const empty = await postRun(app, env, headers, planId)
    expect(empty.status).toBe(202)
    const emptyBody = (await empty.json()) as {
      run: { id: string; status: string }
      requestId: string
    }
    expect(emptyBody.run.status).toBe('queued')
    expect(emptyBody.run.id).toBeTruthy()
    expect(emptyBody.requestId).toMatch(/^req_/)
    expect(create).toHaveBeenCalledTimes(1)
    assertExactCreateArg(create.mock.calls[0]?.[0], emptyBody.run.id)

    const obj = await postRun(app, env, headers, planId, '{}')
    expect(obj.status).toBe(202)
    const objBody = (await obj.json()) as { run: { id: string; status: string }; requestId: string }
    expect(objBody.run.status).toBe('queued')
    expect(objBody.requestId).toMatch(/^req_/)
    expect(create).toHaveBeenCalledTimes(2)
    assertExactCreateArg(create.mock.calls[1]?.[0], objBody.run.id)

    const got = await app.request(`/api/flows/runs/${emptyBody.run.id}`, { headers }, env)
    expect(got.status).toBe(200)
    const gotBody = (await got.json()) as { run: { status: string } }
    expect(gotBody.run.status).toBe('queued')

    const rows = await db.select().from(flowRuns).where(eq(flowRuns.id, emptyBody.run.id))
    const snap = rows[0]?.snapshotJson
    expect(typeof snap).toBe('string')
    expect(snap).not.toContain('grantAudit')
    const parsed = parseRunnerView(JSON.parse(snap as string) as unknown)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.runnerView.executionTools).toEqual(['echo'])
    }
  })

  it('POST run with yaml body is 400 VALIDATION_ERROR', async () => {
    const { app, env, headers, planId } = await staffWithPlan()
    const create = spyCreate(env)
    const res = await postRun(app, env, headers, planId, JSON.stringify({ yaml: 'x' }))
    await expectError(res, 400, 'VALIDATION_ERROR')
    expect(create).not.toHaveBeenCalled()
  })

  it('POST run with invalid JSON is 400 VALIDATION_ERROR', async () => {
    const { app, env, headers, planId } = await staffWithPlan()
    const create = spyCreate(env)
    const res = await postRun(app, env, headers, planId, '{')
    await expectError(res, 400, 'VALIDATION_ERROR')
    expect(create).not.toHaveBeenCalled()
  })

  it('POST run after disable is 409 CONFLICT and existing queued run stays queued', async () => {
    const { app, env, headers, planId } = await staffWithPlan()
    const create = spyCreate(env)
    const started = await postRun(app, env, headers, planId, '{}')
    expect(started.status).toBe(202)
    const { run } = (await started.json()) as { run: { id: string; status: string } }
    expect(run.status).toBe('queued')

    const patch = await app.request(
      `/api/flows/plans/${planId}`,
      { method: 'PATCH', headers, body: JSON.stringify({ enabled: false }) },
      env,
    )
    expect(patch.ok).toBe(true)

    const blocked = await postRun(app, env, headers, planId, '{}')
    await expectError(blocked, 409, 'CONFLICT')
    expect(create).toHaveBeenCalledTimes(1)

    const got = await app.request(`/api/flows/runs/${run.id}`, { headers }, env)
    expect(got.status).toBe(200)
    const gotBody = (await got.json()) as { run: { id: string; status: string } }
    expect(gotBody.run.id).toBe(run.id)
    expect(gotBody.run.status).toBe('queued')
  })

  it('POST run when FLOW_RUN.create throws is 502 INTERNAL_ERROR and GET is failed never queued', async () => {
    const { app, env, headers, planId } = await staffWithPlan()
    const create = vi.fn(async () => {
      throw new Error('workflow down')
    })
    env.FLOW_RUN.create = create
    const res = await postRun(app, env, headers, planId, '{}')
    await expectError(res, 502, 'INTERNAL_ERROR')
    expect(create).toHaveBeenCalledTimes(1)
    const arg = create.mock.calls[0]?.[0] as CreateArg
    expect(arg.id).toBeTruthy()
    assertExactCreateArg(arg, arg.id)

    const got = await app.request(`/api/flows/runs/${arg.id}`, { headers }, env)
    expect(got.status).toBe(200)
    const body = (await got.json()) as { run: { id: string; status: string; errorCode?: string } }
    expect(body.run.id).toBe(arg.id)
    expect(body.run.status).toBe('failed')
    expect(body.run.status).not.toBe('queued')
    expect(body.run.errorCode).toBe('WORKFLOW_CREATE_FAILED')
  })

  it('GET failed run with skip/fail receipts matches D1 rollup and omits CF complete', async () => {
    const { app, env, db, headers, planId } = await staffWithPlan()
    const runId = 'run_failed_rollup'
    env.FLOW_RUN.create = vi.fn(async () => ({ id: runId, status: 'complete' }))
    const get = vi.fn(async () => ({ status: 'complete' }))
    ;(env.FLOW_RUN as { get?: typeof get }).get = get
    const now = Date.now()
    await db
      .insert(flowRuns)
      .values({
        id: runId,
        orgId: ORG_ACME,
        planId,
        planKey: 'echo-only',
        status: 'failed',
        actorId: 'user_staff',
        snapshotJson: '{}',
        planDigest: 'digest',
        receiptJson: JSON.stringify(SKIP_FAIL_BUNDLE),
        errorCode: 'INVOKE_FAILED',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const got = await app.request(`/api/flows/runs/${runId}`, { headers }, env)
    expect(got.status).toBe(200)
    const body = (await got.json()) as {
      run: { id: string; status: string; receipts: unknown; errorCode: string | null }
      requestId: string
    }
    expect(body.run.id).toBe(runId)
    expect(body.run.status).toBe('failed')
    expect(body.run.errorCode).toBe('INVOKE_FAILED')
    expect(body.run.receipts).toEqual(SKIP_FAIL_BUNDLE)
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('complete')
    expect(raw).not.toContain('succeeded')
    expect(get).not.toHaveBeenCalled()
  })

  it('POST run is 403 for org-bound sk_ Bearer', async () => {
    const { app, env, db, planId } = await staffWithPlan()
    const create = spyCreate(env)
    const minted = await mintApiKey(db, 'user_staff', {
      organizationId: ORG_ACME,
      name: 'flows-sk-run',
    })
    const res = await postRun(app, env, bearerHeaders(minted.key), planId, '{}')
    await expectError(res, 403, 'FORBIDDEN')
    expect(create).not.toHaveBeenCalled()
  })
})
