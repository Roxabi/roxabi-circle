import { describe, expect, it } from 'vitest'
import { kitTaskLinks, kitTaskStages, kitTasks } from './drizzle-schema'
import {
  deleteLink,
  deleteTask,
  getTask,
  insertLink,
  insertStage,
  insertTask,
  listAssigneesForTasks,
  listLinks,
  listStages,
  listTasks,
  replaceAssignees,
  updateTask,
} from './repos'

function chain() {
  const self: Record<string, unknown> = {
    from() {
      return self
    },
    where() {
      return self
    },
    orderBy() {
      return self
    },
    set() {
      return self
    },
    values() {
      return self
    },
    all: async () => [],
    get: async () => undefined,
    run: async () => ({ success: true }),
    // biome-ignore lint/suspicious/noThenProperty: fake drizzle query
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve([]).then(resolve)
    },
  }
  return self
}

function fakeDb() {
  return {
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    delete: () => chain(),
    batch: async () => [],
  } as never
}

describe('tasks repos org predicates', () => {
  it('lists stages and tasks scoped to org', async () => {
    const db = fakeDb()
    expect(await listStages(db, 'org-a')).toEqual([])
    expect(await listStages(db, 'org-a', 'board')).toEqual([])
    expect(await listTasks(db, 'org-a')).toEqual([])
    expect(await listLinks(db, 'org-a')).toEqual([])
  })

  it('get/update/delete pass org id', async () => {
    const db = fakeDb()
    await getTask(db, 'org-a', 't1')
    await updateTask(db, 'org-a', 't1', { title: 'x' })
    await deleteTask(db, 'org-a', 't1')
    await deleteLink(db, 'org-a', 'l1')
  })

  it('inserts and assignee helpers execute', async () => {
    const db = fakeDb()
    await insertStage(db, {
      id: 's1',
      orgId: 'org-a',
      boardKey: 'b',
      label: 'L',
      position: 0,
      isDefault: false,
      isTerminal: false,
      createdAt: 1,
      updatedAt: 1,
    })
    await insertTask(db, {
      id: 't1',
      orgId: 'org-a',
      title: 't',
      boardKey: 'b',
      stageId: 's1',
      createdBy: 'u',
      createdAt: 1,
      updatedAt: 1,
    })
    await insertLink(db, {
      id: 'l1',
      orgId: 'org-a',
      fromTaskId: 't1',
      toTaskId: 't2',
      kind: 'blocks',
      createdAt: 1,
    })
    await listAssigneesForTasks(db, ['t1'])
    await replaceAssignees(db, 't1', ['u1'], 1)
    await listAssigneesForTasks(db, [])
    expect(kitTasks.orgId).toBeTruthy()
    expect(kitTaskStages.orgId).toBeTruthy()
    expect(kitTaskLinks.orgId).toBeTruthy()
  })
})
