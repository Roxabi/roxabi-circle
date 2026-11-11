import { useQuery } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../routeTree'
import { createApiDispatcher } from '../test/api-mock'
import { createMe } from '../test/factories'
import { createTestQueryClient } from '../test/query-client'
import { createTestRouter, renderWithAppProviders } from '../test/render'
import { ApiError, apiFetch, HttpError } from './api'
import { onSessionUnauthorized, signOutAndClearSession } from './auth'

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, apiFetch: vi.fn() }
})

const fetchMock = vi.mocked(apiFetch)
let calls = 0

afterEach(() => {
  fetchMock.mockReset()
  calls = 0
})

function CacheProbe() {
  const plans = useQuery({
    queryKey: ['flows', 'plans', 'org_a'],
    queryFn: async () => {
      calls += 1
      return { plans: [{ planKey: calls === 1 ? 'alice-plan' : 'bob-plan' }] }
    },
  })
  return <span>{plans.data?.plans[0]?.planKey ?? 'empty'}</span>
}

describe('signOutAndClearSession', () => {
  it('does not keep the previous user plan after sign-out', async () => {
    const api = createApiDispatcher().on('POST', '/api/auth/sign-out', () => ({}))
    fetchMock.mockImplementation(api.fetch)
    const qc = createTestQueryClient()
    const view = renderWithAppProviders(<CacheProbe />, { queryClient: qc })
    expect(await screen.findByText('alice-plan')).toBeTruthy()
    await signOutAndClearSession(qc)
    expect(
      qc
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([])
    view.rerender(<CacheProbe />)
    expect(screen.queryByText('alice-plan')).toBeNull()
  })
})

const unauthorized = new ApiError(401, {
  error: { code: 'UNAUTHORIZED', message: 'no' },
  requestId: 'r',
})

const bob = createMe({
  subject: 'user_bob',
  email: 'bob@kit.local',
  platformRole: 'staff',
  orgs: [],
  requestId: 'r',
})

describe('sign-in principal boundary', () => {
  it('does not leave the previous principal flows queries readable', async () => {
    let signedIn = false
    const api = createApiDispatcher()
      .on('POST', '/api/auth/sign-in/email', () => {
        signedIn = true
        return {}
      })
      .on('GET', '/api/me', () => {
        if (!signedIn) throw unauthorized
        return bob
      })
      .on('GET', '/health', () => ({ ok: true, environment: 'test', requestId: 'r' }))
      .on('GET', '/api/orgs', () => ({ orgs: [] }))
    fetchMock.mockImplementation(api.fetch)
    localStorage.setItem('kit.locale', 'en')
    const qc = createTestQueryClient()
    qc.setQueryData(['flows', 'plans', 'org_a'], {
      plans: [{ planKey: 'alice-plan' }],
      allowedOperations: { setPlanEnabled: true, createRun: true },
      requestId: 'r',
    })
    const router = createTestRouter(routeTree, '/login', qc)
    renderWithAppProviders(<RouterProvider router={router} />, { queryClient: qc })
    expect(qc.getQueryData(['flows', 'plans', 'org_a'])).toBeTruthy()
    await userEvent.type(await screen.findByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await vi.waitFor(() => {
      expect(qc.getQueryData(['flows', 'plans', 'org_a'])).toBeUndefined()
    })
    expect(JSON.stringify(qc.getQueryCache().getAll())).not.toContain('alice-plan')
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin')
    })
    expect(await screen.findByRole('heading', { name: 'Back-office' })).toBeVisible()
    expect(screen.queryByText(/Something went wrong|Une erreur est survenue/)).toBeNull()
    expect(screen.queryByText('Accès back-office refusé')).toBeNull()
  })

  it('drops cached flows on a protected 401 and ignores the me bootstrap 401', () => {
    const qc = createTestQueryClient()
    qc.setQueryData(['flows', 'plans', 'org_a'], { plans: [{ planKey: 'alice-plan' }] })
    onSessionUnauthorized(qc, unauthorized, ['me'])
    expect(qc.getQueryData(['flows', 'plans', 'org_a'])).toBeTruthy()
    onSessionUnauthorized(qc, unauthorized, ['flows', 'plans', 'org_a'])
    expect(qc.getQueryData(['flows', 'plans', 'org_a'])).toBeUndefined()
  })

  it('clears protected cache for a non-envelope 401 but not for a generic error', () => {
    const qc = createTestQueryClient()
    qc.setQueryData(['flows', 'plans', 'org_a'], { plans: [{ planKey: 'alice-plan' }] })
    onSessionUnauthorized(qc, new Error('HTTP 401'), ['flows', 'plans', 'org_a'])
    expect(qc.getQueryData(['flows', 'plans', 'org_a'])).toBeTruthy()
    onSessionUnauthorized(qc, new HttpError(401), ['flows', 'plans', 'org_a'])
    expect(qc.getQueryData(['flows', 'plans', 'org_a'])).toBeUndefined()
  })
})
