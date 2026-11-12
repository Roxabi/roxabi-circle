import { baMember } from '@kit/auth/schema'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { flowRuns } from './db/schema'
import { sessionHeaders } from './test/api-fixture'
import {
  BOTH_ORGS,
  enableFlowsForOrgs,
  login,
  MEMBER_EMAIL,
  ORG_ACME,
  STAFF_EMAIL,
  SUPER_EMAIL,
  seedFlowsApp,
  seedOperatorWriteOnAcme,
} from './test/flows-fixture'

const APPROVE_YAML = `flows: v0
plan:
  id: approve-caps
permits:
  tools:
    - echo
tasks:
  gate:
    approve: {}
  echo_hello:
    after:
      - gate
    invoke:
      tool: echo
      args:
        text: after
`

const WAITING = JSON.stringify({
  receiptVersion: 1,
  tokensUsed: 0,
  tasks: { gate: { taskId: 'gate', outcome: 'waiting' } },
})

async function publishWaitingRun() {
  const { app, env, db } = await seedFlowsApp()
  await enableFlowsForOrgs(db, BOTH_ORGS)
  const cookie = await login(app, env, STAFF_EMAIL)
  const headers = sessionHeaders(cookie, ORG_ACME)
  const created = await app.request(
    '/api/flows/plans',
    { method: 'POST', headers, body: JSON.stringify({ yaml: APPROVE_YAML }) },
    env,
  )
  expect(created.status).toBe(201)
  const planId = ((await created.json()) as { plan: { id: string } }).plan.id
  const queued = await app.request(
    `/api/flows/plans/${planId}/runs`,
    { method: 'POST', headers, body: '{}' },
    env,
  )
  expect(queued.status).toBe(202)
  const runId = ((await queued.json()) as { run: { id: string } }).run.id
  await db
    .update(flowRuns)
    .set({ status: 'running', receiptJson: WAITING, workflowInstanceId: runId })
    .where(eq(flowRuns.id, runId))
    .run()
  return { app, env, db, cookie, runId }
}

async function getRunCaps(
  app: Awaited<ReturnType<typeof seedFlowsApp>>['app'],
  env: Awaited<ReturnType<typeof seedFlowsApp>>['env'],
  cookie: string,
  runId: string,
  orgId = ORG_ACME,
) {
  const res = await app.request(
    `/api/flows/runs/${runId}`,
    { headers: sessionHeaders(cookie, orgId) },
    env,
  )
  const body = (await res.json()) as {
    allowedOperations?: { decideApproval: boolean }
  }
  return { status: res.status, allowedOperations: body.allowedOperations }
}

describe('GET /api/flows/runs/:id allowedOperations.decideApproval', () => {
  it('is true for org admin and false for operator / super_admin-operator', async () => {
    const { app, env, db, cookie, runId } = await publishWaitingRun()

    expect((await getRunCaps(app, env, cookie, runId)).allowedOperations).toEqual({
      decideApproval: true,
    })

    await seedOperatorWriteOnAcme(db)
    const operatorCookie = await login(app, env, MEMBER_EMAIL)
    expect((await getRunCaps(app, env, operatorCookie, runId)).allowedOperations).toEqual({
      decideApproval: false,
    })

    await db
      .insert(baMember)
      .values({
        id: 'mem_super_op_caps',
        organizationId: ORG_ACME,
        userId: 'user_super',
        role: 'operator',
        createdAt: new Date(),
      })
      .run()
    const superCookie = await login(app, env, SUPER_EMAIL)
    expect((await getRunCaps(app, env, superCookie, runId)).allowedOperations).toEqual({
      decideApproval: false,
    })
  })
})
