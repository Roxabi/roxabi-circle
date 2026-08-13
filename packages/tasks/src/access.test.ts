import { describe, expect, it } from 'vitest'
import { canAdminTaskBoards, canReadTasks, canWriteTasks } from './access'

describe('access helpers', () => {
  it('admin boards', () => {
    expect(canAdminTaskBoards('owner')).toBe(true)
    expect(canAdminTaskBoards('member')).toBe(false)
  })

  it('write', () => {
    expect(canWriteTasks('member')).toBe(true)
    expect(canWriteTasks('reader')).toBe(false)
  })

  it('read', () => {
    expect(canReadTasks('reader')).toBe(true)
    expect(canReadTasks('guest')).toBe(false)
  })
})
