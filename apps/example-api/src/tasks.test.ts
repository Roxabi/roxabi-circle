import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { seedDemoDatabase } from './seed/seed-db'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'
const ORG = 'org_acme'

function headers(cookie: string): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: ORIGIN,
    'X-Org-Id': ORG,
  }
}

async function login(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
) {
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: true, environment: 'test' })
  const login = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password: TENANCY_PASSWORD }),
    },
    env,
  )
  expect(login.status, `sign-in ${email}`).toBeLessThan(400)
  const setCookie = login.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return setCookie!.split(';')[0]!
}

describe('tasks dogfood API', () => {
  it('requires auth and org', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    expect((await app.request('/api/tasks', {}, env)).status).toBe(401)
  })

  it('CRUD + visibility hide from reader + comment', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const staffCookie = await login(app, env, 'staff@kit.local')
    // add reader to acme for external audience test
    const db = createDb(env.DB as unknown as D1Database, schema)
    // team-reader is only on org_solo in seed — use member create internal/shared as staff

    const createShared = await app.request(
      '/api/tasks',
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({
          title: 'Shared task',
          boardKey: 'main',
          visibility: 'shared',
        }),
      },
      env,
    )
    expect(createShared.status).toBe(201)
    const shared = (await createShared.json()) as { task: { id: string } }

    const createInternal = await app.request(
      '/api/tasks',
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({
          title: 'Internal only',
          boardKey: 'main',
          visibility: 'internal',
        }),
      },
      env,
    )
    expect(createInternal.status).toBe(201)
    const internal = (await createInternal.json()) as { task: { id: string } }

    const listStaff = await app.request('/api/tasks', { headers: headers(staffCookie) }, env)
    expect(listStaff.status).toBe(200)
    const staffTasks = (await listStaff.json()) as { tasks: { id: string }[] }
    expect(staffTasks.tasks.map((t) => t.id).sort()).toEqual(
      [shared.task.id, internal.task.id].sort(),
    )

    // Promote team-reader onto acme as reader for external filter
    const { baMember } = await import('@kit/auth/schema')
    await db.insert(baMember).values({
      id: 'mem_org_acme_user_team_reader',
      organizationId: ORG,
      userId: 'user_team_reader',
      role: 'reader',
      createdAt: new Date(),
    })

    const readerCookie = await login(app, env, 'team-reader@kit.local')
    const listReader = await app.request('/api/tasks', { headers: headers(readerCookie) }, env)
    expect(listReader.status).toBe(200)
    const readerTasks = (await listReader.json()) as { tasks: { id: string; title: string }[] }
    expect(readerTasks.tasks.map((t) => t.id)).toEqual([shared.task.id])

    const getInternal = await app.request(
      `/api/tasks/${internal.task.id}`,
      { headers: headers(readerCookie) },
      env,
    )
    expect(getInternal.status).toBe(404)

    const comment = await app.request(
      `/api/tasks/${shared.task.id}/comments`,
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({ body: 'Looks good', visibility: 'shared' }),
      },
      env,
    )
    expect(comment.status).toBe(201)

    const comments = await app.request(
      `/api/tasks/${shared.task.id}/comments`,
      { headers: headers(staffCookie) },
      env,
    )
    expect(comments.status).toBe(200)
    const body = (await comments.json()) as { comments: { body: string }[] }
    expect(body.comments[0]?.body).toBe('Looks good')

    const stages = await app.request('/api/tasks/stages', { headers: headers(staffCookie) }, env)
    expect(stages.status).toBe(200)
    const stageBody = (await stages.json()) as { stages: { id: string; isDefault: boolean }[] }
    const doing = stageBody.stages.find((s) => !s.isDefault)
    expect(doing).toBeTruthy()

    const patch = await app.request(
      `/api/tasks/${shared.task.id}`,
      {
        method: 'PATCH',
        headers: headers(staffCookie),
        body: JSON.stringify({ stageId: doing!.id, title: 'Shared task v2' }),
      },
      env,
    )
    expect(patch.status).toBe(200)
    const patched = (await patch.json()) as { task: { title: string; stageId: string } }
    expect(patched.task.title).toBe('Shared task v2')
    expect(patched.task.stageId).toBe(doing!.id)

    const link = await app.request(
      '/api/tasks/links',
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({
          fromTaskId: shared.task.id,
          toTaskId: internal.task.id,
          kind: 'blocks',
        }),
      },
      env,
    )
    expect(link.status).toBe(201)

    const listLinks = await app.request('/api/tasks/links', { headers: headers(staffCookie) }, env)
    expect(listLinks.status).toBe(200)
    const linksBody = (await listLinks.json()) as { links: unknown[] }
    expect(linksBody.links.length).toBeGreaterThanOrEqual(1)

    const readerPatch = await app.request(
      `/api/tasks/${shared.task.id}`,
      {
        method: 'PATCH',
        headers: headers(readerCookie),
        body: JSON.stringify({ title: 'nope' }),
      },
      env,
    )
    expect(readerPatch.status).toBe(403)

    const del = await app.request(
      `/api/tasks/${internal.task.id}`,
      { method: 'DELETE', headers: headers(staffCookie) },
      env,
    )
    expect(del.status).toBe(200)
  })
})
