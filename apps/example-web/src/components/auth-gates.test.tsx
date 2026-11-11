import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import type { MeResponse } from '../lib/auth'
import { createMe, createMeOrg } from '../test/factories'
import { renderWithAppProviders } from '../test/render'
import { AuthGate, PlatformGate } from './auth-gates'

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
const useRecoveryMock = vi.fn()
const refreshMock = vi.fn()
const switchMock = vi.fn()
const clearRecoveryMock = vi.fn()
const signOutMock = vi.fn()

vi.mock('../lib/impersonation', () => ({
  useImpersonationRecovery: () => useRecoveryMock(),
  refreshImpersonation: (...args: unknown[]) => refreshMock(...args),
  switchImpersonation: (...args: unknown[]) => switchMock(...args),
  clearImpersonationRecovery: () => clearRecoveryMock(),
}))

vi.mock('../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/auth')>('../lib/auth')
  return {
    ...actual,
    useMe: (...args: unknown[]) => useMeMock(...args),
    signOutAndClearSession: (...args: unknown[]) => signOutMock(...args),
  }
})

afterEach(() => {
  navigate.mockReset()
  useMeMock.mockReset()
  useRecoveryMock.mockReset()
  refreshMock.mockReset()
  switchMock.mockReset()
  clearRecoveryMock.mockReset()
  signOutMock.mockReset()
})

function wrap(ui: ReactElement) {
  return renderWithAppProviders(ui)
}

const okMe: MeResponse = createMe({
  subject: 'user_solo',
  email: 'solo@kit.local',
  requestId: 'r',
  orgs: [
    createMeOrg({
      id: 'org_solo',
      name: 'Solo',
      slug: 'solo',
      role: 'owner',
    }),
  ],
})

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

  it.each([true, false])(
    'retains delegation recovery controls on a background error (active: %s)',
    (active) => {
      useMeMock.mockReturnValue({
        isLoading: false,
        isError: true,
        data: {
          ...okMe,
          impersonation: {
            id: 'imp_1',
            mode: 'read',
            organizationId: 'org_solo',
            actor: { id: 'operator', name: 'Operator' },
            subject: { id: 'user_solo', name: 'Represented user' },
            startedAt: 1,
            active,
          },
        },
        error: new ApiError(500, {
          error: { code: 'INTERNAL_ERROR', message: 'boom' },
          requestId: 'r',
        }),
        refetch: vi.fn(),
      })
      wrap(
        <AuthGate>
          <div>secret-child</div>
        </AuthGate>,
      )
      expect(screen.queryByText('secret-child')).toBeNull()
      expect(screen.getByRole('status')).toBeTruthy()
      expect(
        screen.getByRole('button', { name: /Revenir à mon compte|Return to my account/i }),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: /Réessayer|Retry/i })).toBeTruthy()
    },
  )

  it.each([undefined, okMe])(
    'shows confirmed recovery controls instead of cached actor data',
    async (data) => {
      const info = {
        id: 'imp_confirmed',
        mode: 'read' as const,
        organizationId: 'org_solo',
        actor: { id: 'operator', name: 'Operator' },
        subject: { id: 'target', name: 'Target' },
        startedAt: 1,
        active: true,
      }
      useRecoveryMock.mockReturnValue(info)
      switchMock.mockResolvedValue(undefined)
      refreshMock.mockResolvedValue(undefined)
      signOutMock.mockResolvedValue(undefined)
      useMeMock.mockReturnValue({
        isLoading: false,
        isError: true,
        data,
        error: new ApiError(500, {
          error: { code: 'INTERNAL_ERROR', message: 'boom' },
          requestId: 'r',
        }),
        refetch: vi.fn(),
      })
      wrap(
        <AuthGate>
          <div>secret-child</div>
        </AuthGate>,
      )

      expect(screen.queryByText('secret-child')).toBeNull()
      expect(screen.getByText(/Operator.*Target/)).toBeTruthy()
      expect(screen.getByText(/org_solo/)).toBeTruthy()
      expect(navigate).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: /Réessayer|Retry/i }))
      expect(refreshMock).toHaveBeenCalledOnce()
      fireEvent.click(
        screen.getByRole('button', { name: /Revenir à mon compte|Return to my account/i }),
      )
      await waitFor(() =>
        expect(switchMock).toHaveBeenCalledWith('stop', { impersonationId: 'imp_confirmed' }),
      )
      fireEvent.click(screen.getByRole('button', { name: /Déconnexion|Log out|Sign out/i }))
      await waitFor(() => expect(clearRecoveryMock).toHaveBeenCalledOnce())
      expect(signOutMock.mock.invocationCallOrder[0]).toBeLessThan(
        clearRecoveryMock.mock.invocationCallOrder[0],
      )
      expect(navigate).toHaveBeenCalledWith({ to: '/login' })
    },
  )

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

describe('PlatformGate', () => {
  const staffMe: MeResponse = {
    ...okMe,
    subject: 'user_staff',
    email: 'staff@kit.local',
    platformRole: 'staff',
  }

  const superMe: MeResponse = {
    ...okMe,
    subject: 'user_super',
    email: 'super@kit.local',
    platformRole: 'super_admin',
  }

  it('renders children for platform staff', () => {
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: staffMe,
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <PlatformGate>
        <div>bo-child</div>
      </PlatformGate>,
    )
    expect(screen.getByText('bo-child')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders children for super_admin', () => {
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: superMe,
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <PlatformGate>
        <div>bo-child</div>
      </PlatformGate>,
    )
    expect(screen.getByText('bo-child')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('redirects an impersonated user without a forbidden toast', () => {
    const toastError = vi.spyOn(toast, 'error')
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...okMe,
        impersonation: {
          id: 'imp_1',
          mode: 'read',
          organizationId: 'org_solo',
          actor: { id: 'operator' },
          subject: { id: 'user_solo' },
          startedAt: 1,
          active: true,
        },
      },
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <PlatformGate>
        <div>bo-child</div>
      </PlatformGate>,
    )
    expect(screen.queryByText('bo-child')).toBeNull()
    expect(navigate).toHaveBeenCalledWith({ to: '/app/tasks', replace: true })
    expect(toastError).not.toHaveBeenCalled()
    toastError.mockRestore()
  })

  it('shows loading and no children while me is loading', () => {
    useMeMock.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <PlatformGate>
        <div>bo-child</div>
      </PlatformGate>,
    )
    expect(screen.queryByText('bo-child')).toBeNull()
    expect(screen.getByText(/Chargement|Loading/i)).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('blocks non-platform users and navigates to /app', () => {
    useMeMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: okMe,
      error: null,
      refetch: vi.fn(),
    })
    wrap(
      <PlatformGate>
        <div>bo-child</div>
      </PlatformGate>,
    )
    expect(screen.queryByText('bo-child')).toBeNull()
    expect(navigate).toHaveBeenCalledWith({ to: '/app' })
    // Default locale FR — pin catalog title (see messages/fr.ts forbiddenPlatform)
    expect(screen.getByText('Accès back-office refusé')).toBeTruthy()
  })
})
