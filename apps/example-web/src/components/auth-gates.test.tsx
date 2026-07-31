import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import type { MeResponse } from '../lib/auth'
import { LocaleProvider } from '../lib/locale'
import { ThemeProvider } from '../lib/theme'
import { AuthGate } from './auth-gates'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  const state = { location: { pathname: '/app' } }
  return {
    ...actual,
    useNavigate: () => navigate,
    useRouterState: (opts?: { select?: (s: typeof state) => unknown }) =>
      opts?.select ? opts.select(state) : state,
    Link: ({ children, ...props }: { children?: ReactNode }) => <a {...props}>{children}</a>,
  }
})

const useMeMock = vi.fn()

vi.mock('../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/auth')>('../lib/auth')
  return {
    ...actual,
    useMe: (...args: unknown[]) => useMeMock(...args),
  }
})

vi.mock('./feedback-fab', () => ({
  FeedbackFab: () => null,
}))

afterEach(() => {
  cleanup()
  navigate.mockReset()
  useMeMock.mockReset()
})

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <LocaleProvider>{ui}</LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

const okMe: MeResponse = {
  subject: 'user_solo',
  email: 'solo@gosilex.local',
  authMethod: 'session',
  role: 'user',
  platformRole: null,
  requestId: 'r',
  orgs: [
    {
      id: 'org_solo',
      name: 'Solo',
      slug: 'solo',
      kind: 'client',
      status: 'active',
      role: 'owner',
    },
  ],
}

describe('AuthGate', () => {
  it('shows loading while me is loading', () => {
    useMeMock.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <AuthGate>
        <div>secret-child</div>
      </AuthGate>,
    )
    expect(screen.queryByText('secret-child')).toBeNull()
    expect(screen.getByText(/Chargement|Loading/i)).toBeTruthy()
  })

  it('navigates to login on 401', () => {
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: new ApiError(401, {
        error: { code: 'UNAUTHORIZED', message: 'no' },
        requestId: 'r',
      }),
      refetch: vi.fn(),
    })
    wrap(
      <AuthGate>
        <div>secret-child</div>
      </AuthGate>,
    )
    expect(navigate).toHaveBeenCalledWith({ to: '/login' })
    expect(screen.queryByText('secret-child')).toBeNull()
  })

  it('shows hard-error with retry on non-401 failure', () => {
    const refetch = vi.fn()
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: new ApiError(500, {
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
        requestId: 'r',
      }),
      refetch,
    })
    wrap(
      <AuthGate>
        <div>secret-child</div>
      </AuthGate>,
    )
    expect(screen.queryByText('secret-child')).toBeNull()
    expect(screen.getByRole('button', { name: /Réessayer|Retry/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Connexion|Login|Sign/i })).toBeTruthy()
    screen.getByRole('button', { name: /Réessayer|Retry/i }).click()
    expect(refetch).toHaveBeenCalled()
  })

  it('renders children when session is ok', () => {
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: okMe,
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <AuthGate>
        <div>secret-child</div>
      </AuthGate>,
    )
    expect(screen.getByText('secret-child')).toBeTruthy()
  })
})
