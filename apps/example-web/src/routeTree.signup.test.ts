import { RouterProvider } from '@tanstack/react-router'
import { screen } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiModule from './lib/api'
import { ApiError, apiFetch } from './lib/api'
import { routeTree } from './routeTree'
import { createApiDispatcher } from './test/api-mock'
import { createTestQueryClient } from './test/query-client'
import { createTestRouter, renderWithAppProviders } from './test/render'

vi.mock('./lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('./lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

const unauthenticated = new ApiError(401, {
  error: { code: 'UNAUTHORIZED', message: 'anonymous' },
  requestId: 'r',
})

const fetchMock = vi.mocked(apiFetch)

describe('/sign-up beforeLoad', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  async function renderSignUp(path = '/sign-up') {
    const queryClient = createTestQueryClient()
    const router = createTestRouter(routeTree, path, queryClient)
    await router.load()
    renderWithAppProviders(createElement(RouterProvider, { router }), { queryClient })
    await screen.findByRole('heading', { name: /Welcome to Kit Kit|Bienvenue sur Kit Kit/ })
    return router
  }

  it('redirects to /login when allowPublicSignup is false', async () => {
    fetchMock.mockImplementation(
      createApiDispatcher()
        .on('GET', '/health', () => ({
          allowPublicSignup: false,
          ok: true,
          requestId: 'r',
        }))
        .on('GET', '/api/me', () => {
          throw unauthenticated
        }).fetch,
    )
    const router = await renderSignUp()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('redirects to /login when /health fetch rejects', async () => {
    fetchMock.mockImplementation(
      createApiDispatcher()
        .on('GET', '/health', () => {
          throw new Error('down')
        })
        .on('GET', '/api/me', () => {
          throw unauthenticated
        }).fetch,
    )
    const router = await renderSignUp()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('keeps next on the login redirect', async () => {
    fetchMock.mockImplementation(
      createApiDispatcher()
        .on('GET', '/health', () => ({
          allowPublicSignup: false,
          ok: true,
          requestId: 'r',
        }))
        .on('GET', '/api/me', () => {
          throw unauthenticated
        }).fetch,
    )
    const router = await renderSignUp('/sign-up?next=/app')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ next: '/app' })
  })
})
