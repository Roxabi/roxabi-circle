import { act, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiDispatcher } from '../test/api-mock'
import { renderWithAppProviders } from '../test/render'
import { apiFetch } from './api'
import {
  clearOptimisticGrantIfCurrent,
  mergeOptimisticGrant,
  orgRoleGrantKey,
  usePatchOrgRoleGrant,
} from './org-members'

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}))

const fetchMock = vi.mocked(apiFetch)

afterEach(() => {
  fetchMock.mockReset()
})

describe('optimistic grant overlay', () => {
  it('keys by role and module', () => {
    expect(orgRoleGrantKey('role_a', 'notes')).toBe('role_a:notes')
  })

  it('clears only when the overlay still matches this mutation', () => {
    const afterWrite = mergeOptimisticGrant(
      {},
      { roleId: 'r1', moduleId: 'notes', access: 'write' },
    )
    const afterRead = mergeOptimisticGrant(afterWrite, {
      roleId: 'r1',
      moduleId: 'notes',
      access: 'read',
    })
    const afterStaleWrite = clearOptimisticGrantIfCurrent(afterRead, {
      roleId: 'r1',
      moduleId: 'notes',
      access: 'write',
    })
    expect(afterStaleWrite['r1:notes']).toBe('read')
    expect(
      clearOptimisticGrantIfCurrent(afterStaleWrite, {
        roleId: 'r1',
        moduleId: 'notes',
        access: 'read',
      })['r1:notes'],
    ).toBeUndefined()
  })

  it('clears a rejected grant without touching a sibling', () => {
    const both = mergeOptimisticGrant(
      mergeOptimisticGrant({}, { roleId: 'r1', moduleId: 'notes', access: 'write' }),
      { roleId: 'r1', moduleId: 'files', access: 'read' },
    )
    const afterNotesRejected = clearOptimisticGrantIfCurrent(both, {
      roleId: 'r1',
      moduleId: 'notes',
      access: 'write',
    })
    expect(afterNotesRejected['r1:notes']).toBeUndefined()
    expect(afterNotesRejected['r1:files']).toBe('read')
  })
})

function GrantProbe({ onEvent }: { onEvent: (event: string) => void }) {
  const patch = usePatchOrgRoleGrant('org_1', {
    onSuccess: (input) => onEvent(`${input.moduleId}:onSuccess`),
    onError: (_e, input) => onEvent(`${input.moduleId}:onError`),
  })
  return (
    <button
      type="button"
      onClick={() => {
        patch.mutate({ roleId: 'r1', moduleId: 'A', access: 'write' })
        patch.mutate({ roleId: 'r1', moduleId: 'B', access: 'write' })
      }}
    >
      go
    </button>
  )
}

describe('usePatchOrgRoleGrant', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('fires config-level onError for a superseded first mutation', async () => {
    let rejectA: (error: unknown) => void = () => {}
    let resolveB: (value: unknown) => void = () => {}
    const pendingA = new Promise<never>((_resolve, reject) => {
      rejectA = reject
    })
    const pendingB = new Promise<unknown>((resolve) => {
      resolveB = resolve
    })
    let requests = 0
    fetchMock.mockImplementation(
      createApiDispatcher().on('PATCH', /^\/api\/orgs\/org_1\/roles\/r1\/grants\/[AB]$/, () => {
        requests += 1
        return requests === 1 ? pendingA : pendingB
      }).fetch,
    )

    const events: string[] = []
    const view = renderWithAppProviders(<GrantProbe onEvent={(event) => events.push(event)} />)
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'go' }))
    })

    await act(async () => {
      rejectA(new Error('forbidden'))
      resolveB({})
    })

    await waitFor(() => {
      expect(events).toEqual(expect.arrayContaining(['A:onError', 'B:onSuccess']))
    })
    expect(events).toHaveLength(2)
  })
})
