import { createRootRoute, createRoute, Outlet, RouterProvider } from '@tanstack/react-router'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from '../../lib/api'
import type { MeResponse } from '../../lib/auth'
import { OrgProvider } from '../../lib/org-context'
import { en } from '../../messages/en'
import { createApiDispatcher } from '../../test/api-mock'
import { createMe, createMeOrg } from '../../test/factories'
import { createTestQueryClient } from '../../test/query-client'
import { createTestRouter, renderWithAppProviders } from '../../test/render'
import { AdminFlowRunPage } from './flow-run'

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))

const fetchMock = vi.mocked(apiFetch)

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
})

beforeEach(() => {
  localStorage.setItem('kit.locale', 'en')
})

function meWith(orgs: MeResponse['orgs']): MeResponse {
  return createMe({
    subject: 'user_staff',
    email: 'staff@kit.local',
    platformRole: 'staff',
    orgs,
    requestId: 'r',
  })
}

const acme = createMeOrg({
  id: 'org_acme',
  name: 'Acme',
  slug: 'acme',
  role: 'admin',
})

describe('AdminFlowRunPage HITL approve (Roxabi/roxabi-boilerplate-cf#288)', () => {
  const runId = 'run_b2d0cdbe1c23499385a2fcf6d84c5628'

  function waitingRun(ops: { decideApproval: boolean }) {
    return {
      run: {
        id: runId,
        orgId: 'org_acme',
        planId: 'plan_1',
        status: 'running',
        errorCode: null,
        receipts: {
          receiptVersion: 1 as const,
          tokensUsed: 0,
          tasks: {
            gate: { taskId: 'gate', outcome: 'waiting' as const },
          },
        },
      },
      allowedOperations: ops,
      requestId: 'r',
    }
  }

  function renderDetail() {
    const qc = createTestQueryClient()
    const root = createRootRoute({
      component: () => (
        <OrgProvider me={meWith([acme])}>
          <Outlet />
        </OrgProvider>
      ),
    })
    const detail = createRoute({
      getParentRoute: () => root,
      path: '/admin/flows/runs/$runId',
      component: () => <AdminFlowRunPage runId={runId} />,
    })
    const router = createTestRouter(root.addChildren([detail]), `/admin/flows/runs/${runId}`, qc)
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    return qc
  }

  it('shows approve/reject only when decideApproval is true', async () => {
    fetchMock.mockImplementation(
      createApiDispatcher().on('GET', /^\/api\/flows\/runs\/[^/]+$/, () =>
        waitingRun({ decideApproval: false }),
      ).fetch,
    )
    renderDetail()
    expect(await screen.findByText(en.flowsWaiting)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.flowsApprove })).toBeNull()
    expect(screen.queryByRole('button', { name: en.flowsReject })).toBeNull()

    cleanup()
    fetchMock.mockImplementation(
      createApiDispatcher().on('GET', /^\/api\/flows\/runs\/[^/]+$/, () =>
        waitingRun({ decideApproval: true }),
      ).fetch,
    )
    renderDetail()
    expect(await screen.findByRole('button', { name: en.flowsApprove })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.flowsReject })).toBeTruthy()
  })

  it('posts decision, invalidates run, and surfaces conflict without crashing', async () => {
    const { toast } = await import('sonner')
    let decided = false
    const api = createApiDispatcher()
      .on('POST', `/api/flows/runs/${runId}/tasks/gate/approval`, ({ init }) => {
        expect(init).toMatchObject({
          method: 'POST',
          headers: { 'X-Org-Id': 'org_acme' },
          body: JSON.stringify({ decision: 'approved' }),
        })
        decided = true
        return {
          runId,
          taskId: 'gate',
          decision: 'approved',
          woken: true,
          requestId: 'r',
        }
      })
      .on('GET', /^\/api\/flows\/runs\/[^/]+$/, () => {
        if (decided) {
          return {
            run: {
              id: runId,
              orgId: 'org_acme',
              planId: 'plan_1',
              status: 'succeeded',
              errorCode: null,
              receipts: {
                receiptVersion: 1,
                tokensUsed: 0,
                tasks: {
                  gate: {
                    taskId: 'gate',
                    outcome: 'ok',
                    approval: { by: 'user_staff', at: '2026-09-29T12:00:00.000Z' },
                  },
                },
              },
            },
            allowedOperations: { decideApproval: true },
            requestId: 'r',
          }
        }
        return waitingRun({ decideApproval: true })
      })
    fetchMock.mockImplementation(api.fetch)
    renderDetail()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: en.flowsApprove }))
    expect(await screen.findByText(/user_staff/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.flowsApprove })).toBeNull()

    cleanup()
    let rejectedRequest: unknown
    fetchMock.mockImplementation(
      createApiDispatcher()
        .on('POST', `/api/flows/runs/${runId}/tasks/gate/approval`, ({ init }) => {
          rejectedRequest = init
          throw new ApiError(409, {
            error: { code: 'CONFLICT', message: 'Approval already decided' },
            requestId: 'r',
          })
        })
        .on('GET', /^\/api\/flows\/runs\/[^/]+$/, () => waitingRun({ decideApproval: true })).fetch,
    )
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: en.flowsReject }))
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(en.error, {
        description: en.errConflict,
      })
    })
    expect(rejectedRequest).toMatchObject({
      method: 'POST',
      headers: { 'X-Org-Id': 'org_acme' },
      body: JSON.stringify({ decision: 'rejected' }),
    })
  })
})
