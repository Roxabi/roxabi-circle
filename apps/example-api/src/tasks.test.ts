import { COMMENTS_MODULE_ID } from '@kit/comments'
import { createDb } from '@kit/db'
import { TASKS_MODULE_ID } from '@kit/tasks'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { seedDemoDatabase } from './seed/seed-db'
import { TENANCY_PASSWORD } from './seed/tenancy-data'
import { setOrgModuleEnabled } from './services/platform-modules'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'
const ORG = 'org_acme'
const ORG_TEAM = 'org_team'

function headers(cookie: string, orgId = ORG): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: ORIGIN,
    'X-Org-Id': orgId,
  }
}
async function signIn(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
) {
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

async function login(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
) {
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: true, environment: 'test' })
  return signIn(app, env, email)
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

  it('stolen task id with other org X-Org-Id is 404', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const staffCookie = await login(app, env, 'staff@kit.local')
    const db = createDb(env.DB as unknown as D1Database, schema)
    await setOrgModuleEnabled(db, ORG_TEAM, TASKS_MODULE_ID, true)
    await setOrgModuleEnabled(db, ORG_TEAM, COMMENTS_MODULE_ID, true)

    const created = await app.request(
      '/api/tasks',
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({ title: 'Acme secret', boardKey: 'main', visibility: 'shared' }),
      },
      env,
    )
    expect(created.status).toBe(201)
    const { task } = (await created.json()) as { task: { id: string } }

    const other = await app.request(
      '/api/tasks',
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({ title: 'Acme other', boardKey: 'main', visibility: 'shared' }),
      },
      env,
    )
    expect(other.status).toBe(201)
    const otherTask = (await other.json()) as { task: { id: string } }

    const commentRes = await app.request(
      `/api/tasks/${task.id}/comments`,
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({ body: 'acme note', visibility: 'shared' }),
      },
      env,
    )
    expect(commentRes.status).toBe(201)
    const { comment } = (await commentRes.json()) as { comment: { id: string } }

    const linkRes = await app.request(
      '/api/tasks/links',
      {
        method: 'POST',
        headers: headers(staffCookie),
        body: JSON.stringify({
          fromTaskId: task.id,
          toTaskId: otherTask.task.id,
          kind: 'blocks',
        }),
      },
      env,
    )
    expect(linkRes.status).toBe(201)

    const teamCookie = await signIn(app, env, 'team-owner@kit.local')
    const team = headers(teamCookie, ORG_TEAM)

    const list = await app.request('/api/tasks', { headers: team }, env)
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { tasks: { id: string }[] }
    expect(listed.tasks.map((t) => t.id)).not.toContain(task.id)

    const get = await app.request(`/api/tasks/${task.id}`, { headers: team }, env)
    expect(get.status).toBe(404)

    const patch = await app.request(
      `/api/tasks/${task.id}`,
      { method: 'PATCH', headers: team, body: JSON.stringify({ title: 'stolen' }) },
      env,
    )
    expect(patch.status).toBe(404)

    const del = await app.request(`/api/tasks/${task.id}`, { method: 'DELETE', headers: team }, env)
    expect(del.status).toBe(404)

    const comments = await app.request(`/api/tasks/${task.id}/comments`, { headers: team }, env)
    expect(comments.status).toBe(404)

    const postComment = await app.request(
      `/api/tasks/${task.id}/comments`,
      {
        method: 'POST',
        headers: team,
        body: JSON.stringify({ body: 'nope', visibility: 'shared' }),
      },
      env,
    )
    expect(postComment.status).toBe(404)

    const delComment = await app.request(
      `/api/tasks/comments/${comment.id}`,
      { method: 'DELETE', headers: team },
      env,
    )
    expect(delComment.status).toBe(404)

    const stealLink = await app.request(
      '/api/tasks/links',
      {
        method: 'POST',
        headers: team,
        body: JSON.stringify({
          fromTaskId: task.id,
          toTaskId: otherTask.task.id,
          kind: 'blocks',
        }),
      },
      env,
    )
    expect(stealLink.status).toBe(404)

    const links = await app.request('/api/tasks/links', { headers: team }, env)
    expect(links.status).toBe(200)
    const linkBody = (await links.json()) as { links: { fromTaskId: string }[] }
    expect(linkBody.links.map((l) => l.fromTaskId)).not.toContain(task.id)

    const stillThere = await app.request(
      `/api/tasks/${task.id}`,
      { headers: headers(staffCookie) },
      env,
    )
    expect(stillThere.status).toBe(200)
  })
})
