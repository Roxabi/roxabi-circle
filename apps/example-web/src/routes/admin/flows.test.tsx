import { createRootRoute, createRoute, Outlet, RouterProvider } from '@tanstack/react-router'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from '../../lib/api'
import type { MeResponse } from '../../lib/auth'
import { OrgProvider, useOrgContext } from '../../lib/org-context'
import { en } from '../../messages/en'
import { fr } from '../../messages/fr'
import { routeTree } from '../../routeTree'
import { createApiDispatcher, failUnexpectedApiRequest } from '../../test/api-mock'
import { createMe, createMeOrg } from '../../test/factories'
import { createTestQueryClient } from '../../test/query-client'
import { createTestRouter, renderWithAppProviders } from '../../test/render'
import { AdminFlowRunPage } from './flow-run'
import { AdminFlowsPage } from './flows'

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

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
const beta = createMeOrg({ ...acme, id: 'org_beta', name: 'Beta', slug: 'beta', role: 'reader' })

const caps = { setPlanEnabled: true, createPlan: true, createRun: true }
const readOnly = { setPlanEnabled: false, createPlan: false, createRun: false }

function plan(orgId: string, key: string) {
  return {
    id: `plan_${orgId}`,
    orgId,
    planKey: key,
    version: 1,
    enabled: true,
    digest: 'd',
  }
}
function mockFlowApi(handler: (path: string, init?: RequestInit) => unknown | Promise<unknown>) {
  const api = createApiDispatcher()
  for (const [method, path] of [
    ['GET', '/health'],
    ['GET', '/api/me'],
    ['GET', '/api/notes'],
    ['GET', '/api/flows/plans'],
    ['GET', '/api/flows/runs'],
    ['GET', /^\/api\/flows\/runs\/[^/]+$/],
    ['PATCH', /^\/api\/flows\/plans\/[^/]+$/],
    ['POST', /^\/api\/flows\/plans\/[^/]+\/runs$/],
    ['POST', /^\/api\/flows\/runs\/[^/]+\/tasks\/[^/]+\/approval$/],
  ] as const) {
    api.on(method, path, ({ path, init }) => handler(path, init))
  }
  return api.fetch
}

function OrgFlip() {
  const { setActiveOrgId } = useOrgContext()
  return (
    <button type="button" onClick={() => setActiveOrgId('org_beta')}>
      flip-org
    </button>
  )
}
function renderList(me: MeResponse, path = '/admin/flows') {
  const qc = createTestQueryClient()
  const root = createRootRoute({
    component: () => (
      <OrgProvider me={me}>
        <Outlet />
      </OrgProvider>
    ),
  })
  const list = createRoute({
    getParentRoute: () => root,
    path: '/admin/flows',
    component: AdminFlowsPage,
  })
  const router = createTestRouter(root.addChildren([list]), path, qc)
  return renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
}

function orgFromInit(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.['X-Org-Id']
}

function mockPlansForOrg(
  org: string | undefined,
  allowedOperations: { setPlanEnabled: boolean; createPlan: boolean; createRun: boolean },
) {
  return {
    plans: [plan(org ?? 'org_acme', org === 'org_beta' ? 'beta-plan' : 'acme-plan')],
    allowedOperations,
    requestId: 'r',
  }
}

function createToggleFetchMock(
  gate: Promise<void>,
  betaFetches: string[],
  allowedOperations: { setPlanEnabled: boolean; createPlan: boolean; createRun: boolean },
) {
  return async (path: string, init?: RequestInit) => {
    const org = orgFromInit(init)
    if (path === '/api/flows/plans/plan_org_acme' && init?.method === 'PATCH') {
      await gate
      return { plan: { ...plan('org_acme', 'acme-plan'), enabled: false }, requestId: 'r' }
    }
    if (org === 'org_beta' && path === '/api/flows/plans') betaFetches.push(path)
    if (path === '/api/flows/plans') return mockPlansForOrg(org, allowedOperations)
    if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
    return failUnexpectedApiRequest(path, init)
  }
}

function createRunFetchMock(
  gate: Promise<void>,
  betaFetches: string[],
  allowedOperations: { setPlanEnabled: boolean; createPlan: boolean; createRun: boolean },
) {
  return async (path: string, init?: RequestInit) => {
    const org = orgFromInit(init)
    if (path === '/api/flows/plans/plan_org_acme/runs' && init?.method === 'POST') {
      await gate
      return { id: 'run_queued', status: 'queued', requestId: 'r' }
    }
    if (org === 'org_beta' && path === '/api/flows/runs') betaFetches.push(path)
    if (path === '/api/flows/plans') return mockPlansForOrg(org, allowedOperations)
    if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
    return failUnexpectedApiRequest(path, init)
  }
}

describe('AdminFlowsPage allowedOperations', () => {
  it('shows controls only when the server says so, and 403 as forbidden', async () => {
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string) => {
        if (path === '/api/flows/plans')
          return { plans: [plan('org_acme', 'echo-only')], allowedOperations: caps, requestId: 'r' }
        if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    renderList(meWith([acme]))
    expect(await screen.findByRole('switch', { name: 'echo-only' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run echo-only' })).toBeTruthy()

    cleanup()
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string) => {
        if (path === '/api/flows/plans') {
          return {
            plans: [plan('org_acme', 'echo-only')],
            allowedOperations: readOnly,
            requestId: 'r',
          }
        }
        if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    renderList(meWith([{ ...acme, role: 'operator' }]))
    expect(await screen.findByText('echo-only')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Run/ })).toBeNull()

    cleanup()
    fetchMock.mockImplementation(
      createApiDispatcher()
        .on('GET', '/api/flows/plans', () => {
          throw new ApiError(403, {
            error: { code: 'FORBIDDEN', message: 'no' },
            requestId: 'r',
          })
        })
        .on('GET', '/api/flows/runs', () => ({ runs: [], requestId: 'r' })).fetch,
    )
    renderList(meWith([{ ...acme, role: 'member' }]))
    expect(await screen.findByText(en.errForbidden)).toBeTruthy()
    expect(screen.queryByText('echo-only')).toBeNull()
  })

  it('hides controls when allowedOperations is not boolean', async () => {
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string) => {
        if (path === '/api/flows/plans') {
          return {
            plans: [plan('org_acme', 'echo-only')],
            allowedOperations: { setPlanEnabled: 'yes', createRun: 1 },
            requestId: 'r',
          }
        }
        if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    renderList(meWith([acme]))
    expect(await screen.findByText('echo-only')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Run/ })).toBeNull()
  })

  it('switches org in the select and does not keep the previous org rows', async () => {
    let releaseBeta: (() => void) | undefined
    const betaGate = new Promise<void>((resolve) => {
      releaseBeta = resolve
    })
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string, init?: RequestInit) => {
        const org = (init?.headers as Record<string, string> | undefined)?.['X-Org-Id']
        if (org === 'org_beta') await betaGate
        if (path === '/api/flows/plans') {
          return {
            plans: [plan(org ?? '', org === 'org_beta' ? 'beta-plan' : 'acme-plan')],
            allowedOperations: readOnly,
            requestId: 'r',
          }
        }
        if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
        return failUnexpectedApiRequest(path, init)
      }),
    )
    const user = userEvent.setup()
    renderList(meWith([acme, beta]))
    expect(await screen.findByText('acme-plan')).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: en.orgPicker }))
    await user.click(await screen.findByRole('option', { name: 'Beta' }))
    await waitFor(() => {
      expect(screen.queryByText('acme-plan')).toBeNull()
    })
    releaseBeta?.()
    expect(await screen.findByText('beta-plan')).toBeTruthy()
    expect(screen.queryByText('acme-plan')).toBeNull()
  })

  it('keeps an in-flight toggle on the org it started with', async () => {
    let releasePatch: (() => void) | undefined
    const patchGate = new Promise<void>((resolve) => {
      releasePatch = resolve
    })
    const betaFetches: string[] = []
    fetchMock.mockImplementation(mockFlowApi(createToggleFetchMock(patchGate, betaFetches, caps)))
    const user = userEvent.setup()
    renderList(meWith([acme, beta]))
    await user.click(await screen.findByRole('switch', { name: 'acme-plan' }))
    await user.click(screen.getByRole('combobox', { name: en.orgPicker }))
    await user.click(await screen.findByRole('option', { name: 'Beta' }))
    const betaBefore = betaFetches.length
    releasePatch?.()
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            call[0] === '/api/flows/plans/plan_org_acme' &&
            (call[1] as RequestInit).method === 'PATCH' &&
            (call[1] as { headers?: Record<string, string> }).headers?.['X-Org-Id'] === 'org_acme',
        ),
      ).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByText('beta-plan')).toBeTruthy()
    })
    expect(betaFetches.length).toBe(betaBefore)
  })

  it('keeps an in-flight run on the org it started with', async () => {
    let releasePost: (() => void) | undefined
    const postGate = new Promise<void>((resolve) => {
      releasePost = resolve
    })
    const betaRunFetches: string[] = []
    fetchMock.mockImplementation(mockFlowApi(createRunFetchMock(postGate, betaRunFetches, caps)))
    const user = userEvent.setup()
    renderList(meWith([acme, beta]))
    await user.click(await screen.findByRole('button', { name: 'Run acme-plan' }))
    await user.click(screen.getByRole('combobox', { name: en.orgPicker }))
    await user.click(await screen.findByRole('option', { name: 'Beta' }))
    const betaBefore = betaRunFetches.length
    releasePost?.()
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            call[0] === '/api/flows/plans/plan_org_acme/runs' &&
            (call[1] as RequestInit).method === 'POST' &&
            (call[1] as { headers?: Record<string, string> }).headers?.['X-Org-Id'] === 'org_acme',
        ),
      ).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByText('beta-plan')).toBeTruthy()
    })
    expect(betaRunFetches.length).toBe(betaBefore)
  })

  it('shows authoring for admins and hides it for read-only', async () => {
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string) => {
        if (path === '/api/flows/plans') {
          return { plans: [], allowedOperations: caps, requestId: 'r' }
        }
        if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    const adminView = renderList(meWith([acme]))
    expect(await screen.findByLabelText(en.flowsYamlLabel)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.flowsCheck })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.flowsSavePlan })).toBeTruthy()
    adminView.unmount()

    fetchMock.mockImplementation(
      mockFlowApi(async (path: string) => {
        if (path === '/api/flows/plans') {
          return { plans: [], allowedOperations: readOnly, requestId: 'r' }
        }
        if (path === '/api/flows/runs') return { runs: [], requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    renderList(meWith([acme]))
    await screen.findByText(en.flowsEmptyPlans)
    expect(screen.queryByLabelText(en.flowsYamlLabel)).toBeNull()
  })

  it('hides the previous org runs before the next org resolves', async () => {
    let releaseBeta: (() => void) | undefined
    const betaGate = new Promise<void>((resolve) => {
      releaseBeta = resolve
    })
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string, init?: RequestInit) => {
        const org = (init?.headers as Record<string, string> | undefined)?.['X-Org-Id']
        if (org === 'org_beta') await betaGate
        if (path === '/api/flows/plans') {
          return { plans: [], allowedOperations: readOnly, requestId: 'r' }
        }
        if (path === '/api/flows/runs') {
          return {
            runs: [
              {
                id: org === 'org_beta' ? 'run_beta' : 'run_acme',
                orgId: org,
                planId: 'plan_1',
                status: 'queued',
                errorCode: null,
                receipts: null,
              },
            ],
            requestId: 'r',
          }
        }
        return failUnexpectedApiRequest(path, init)
      }),
    )
    const user = userEvent.setup()
    renderList(meWith([acme, beta]))
    expect(await screen.findByText('run_acme')).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: en.orgPicker }))
    await user.click(await screen.findByRole('option', { name: 'Beta' }))
    await waitFor(() => {
      expect(screen.queryByText('run_acme')).toBeNull()
    })
    releaseBeta?.()
    expect(await screen.findByText('run_beta')).toBeTruthy()
    expect(screen.queryByText('run_acme')).toBeNull()
  })
})

describe('AdminFlowRunPage', () => {
  it('renders catalog labels and hides a partial approval stamp', async () => {
    localStorage.setItem('kit.locale', 'fr')
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string) => {
        if (path.startsWith('/api/flows/runs/')) {
          return {
            run: {
              id: 'run_b2d0cdbe1c23499385a2fcf6d84c5628',
              orgId: 'org_acme',
              planId: 'plan_1',
              status: 'running',
              errorCode: 'APPROVAL_REJECTED',
              receipts: {
                receiptVersion: 1,
                tokensUsed: 0,
                tasks: {
                  gate: {
                    taskId: 'gate',
                    outcome: 'waiting',
                    approval: { by: 'only-by', at: '' },
                  },
                  done: {
                    taskId: 'done',
                    outcome: 'ok',
                    approval: { by: '', at: '2026-09-25T12:00:00.000Z' },
                  },
                },
              },
            },
            requestId: 'r',
          }
        }
        return failUnexpectedApiRequest(path)
      }),
    )
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
      component: () => <AdminFlowRunPage runId="run_b2d0cdbe1c23499385a2fcf6d84c5628" />,
    })
    const router = createTestRouter(
      root.addChildren([detail]),
      '/admin/flows/runs/run_b2d0cdbe1c23499385a2fcf6d84c5628',
      qc,
    )
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    expect(await screen.findByText(fr.flowsWaiting)).toBeTruthy()
    expect(screen.getByTestId('flow-run-status').textContent).toBe(fr.flowsStatusRunning)
    expect(screen.getByText(fr.flowsErrApprovalRejected)).toBeTruthy()
    expect(screen.queryByText('waiting')).toBeNull()
    expect(screen.queryByText('running')).toBeNull()
    expect(screen.queryByText('APPROVAL_REJECTED')).toBeNull()
    expect(screen.queryByText(/only-by/)).toBeNull()
    expect(screen.queryByText(/2026-09-25/)).toBeNull()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('hides org A detail before org B resolves', async () => {
    let releaseBeta: (() => void) | undefined
    const betaGate = new Promise<void>((resolve) => {
      releaseBeta = resolve
    })
    fetchMock.mockImplementation(
      mockFlowApi(async (path: string, init?: RequestInit) => {
        const org = (init?.headers as Record<string, string> | undefined)?.['X-Org-Id']
        if (org === 'org_beta') await betaGate
        if (path.startsWith('/api/flows/runs/')) {
          return {
            run: {
              id: 'run_b2d0cdbe1c23499385a2fcf6d84c5628',
              orgId: org,
              planId: 'plan_1',
              status: 'queued',
              errorCode: null,
              receipts: null,
            },
            requestId: 'r',
          }
        }
        return failUnexpectedApiRequest(path, init)
      }),
    )
    const qc = createTestQueryClient()
    const root = createRootRoute({
      component: () => (
        <OrgProvider me={meWith([acme, beta])}>
          <Outlet />
          <OrgFlip />
        </OrgProvider>
      ),
    })
    const detail = createRoute({
      getParentRoute: () => root,
      path: '/admin/flows/runs/$runId',
      component: () => <AdminFlowRunPage runId="run_b2d0cdbe1c23499385a2fcf6d84c5628" />,
    })
    const router = createTestRouter(
      root.addChildren([detail]),
      '/admin/flows/runs/run_b2d0cdbe1c23499385a2fcf6d84c5628',
      qc,
    )
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    expect(await screen.findByTestId('flow-run-status')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'flip-org' }))
    await waitFor(() => {
      expect(screen.queryByTestId('flow-run-status')).toBeNull()
    })
    releaseBeta?.()
    expect(await screen.findByTestId('flow-run-status')).toBeTruthy()
  })
})

describe('app flow run route', () => {
  const runId = 'run_b2d0cdbe1c23499385a2fcf6d84c5628'
  const owner = createMe({
    subject: 'user_owner',
    platformRole: null,
    orgs: [createMeOrg({ ...acme, role: 'owner' })],
  })

  function runResponse(decided: boolean) {
    return {
      run: {
        id: runId,
        orgId: 'org_acme',
        planId: 'plan_1',
        status: decided ? 'succeeded' : 'running',
        errorCode: null,
        receipts: {
          receiptVersion: 1,
          tokensUsed: 0,
          tasks: {
            gate: decided
              ? {
                  taskId: 'gate',
                  outcome: 'ok',
                  approval: { by: 'user_owner', at: '2026-09-29T12:00:00.000Z' },
                }
              : { taskId: 'gate', outcome: 'waiting' },
          },
        },
      },
      allowedOperations: { decideApproval: true },
      requestId: 'r',
    }
  }

  it('lets an org owner without a platform role open and approve a run', async () => {
    let decided = false
    const responses: Record<string, (init?: RequestInit) => unknown> = {
      '/api/me': () => owner,
      '/health': () => ({ ok: true, environment: 'test', requestId: 'r' }),
      [`/api/flows/runs/${runId}/tasks/gate/approval`]: (init) => {
        expect(init).toMatchObject({
          method: 'POST',
          headers: { 'X-Org-Id': 'org_acme' },
          body: JSON.stringify({ decision: 'approved' }),
        })
        decided = true
        return { runId, taskId: 'gate', decision: 'approved', woken: true, requestId: 'r' }
      },
      [`/api/flows/runs/${runId}`]: (init) => {
        expect(init?.headers).toEqual({ 'X-Org-Id': 'org_acme' })
        return runResponse(decided)
      },
    }
    fetchMock.mockImplementation(
      mockFlowApi((path, init) => {
        const respond = responses[path]
        if (!respond) return failUnexpectedApiRequest(path)
        return respond(init)
      }),
    )
    const qc = createTestQueryClient()
    const router = createTestRouter(routeTree, `/app/flows/runs/${runId}`, qc)
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    expect(await screen.findByText(en.flowsWaiting)).toBeTruthy()
    expect(screen.queryByRole('link', { name: en.flowsBack })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: en.flowsApprove }))
    expect(await screen.findByText(/user_owner/)).toBeTruthy()
    expect(router.state.location.pathname).toBe(`/app/flows/runs/${runId}`)
  })

  it('keeps the admin run route restricted to platform actors', async () => {
    fetchMock.mockImplementation(
      mockFlowApi((path) => {
        if (path === '/api/me') return owner
        if (path === '/health') return { ok: true, environment: 'test', requestId: 'r' }
        if (path === '/api/notes') return { notes: [], requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    const qc = createTestQueryClient()
    const router = createTestRouter(routeTree, `/admin/flows/runs/${runId}`, qc)
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(
      `/api/flows/runs/${runId}`,
    )
  })

  it('rejects an invalid app run id without fetching it', async () => {
    fetchMock.mockImplementation(
      mockFlowApi((path) => {
        if (path === '/api/me') return owner
        if (path === '/health') return { ok: true, environment: 'test', requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    const qc = createTestQueryClient()
    const router = createTestRouter(routeTree, '/app/flows/runs/..%2F', qc)
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    expect(await screen.findByText(en.errNotFound)).toBeTruthy()
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toEqual(
      expect.arrayContaining([expect.stringContaining('/api/flows/runs/')]),
    )
  })
})

describe('run route param', () => {
  it('shows not-found for a traversal id and does not fetch it', async () => {
    fetchMock.mockImplementation(
      mockFlowApi((path: string) => {
        if (path === '/api/me') return meWith([acme])
        if (path === '/health') return { ok: true, environment: 'test', requestId: 'r' }
        return failUnexpectedApiRequest(path)
      }),
    )
    const qc = createTestQueryClient()
    const router = createTestRouter(routeTree, '/admin/flows/runs/..%2F', qc)
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    expect(await screen.findByText(en.errNotFound)).toBeTruthy()
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('..'),
        expect.stringContaining('/api/flows/runs/'),
      ]),
    )
  })
})
