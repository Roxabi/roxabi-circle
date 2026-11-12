import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../lib/api'
import { en } from '../messages/en'
import { createApiDispatcher } from '../test/api-mock'
import { renderWithAppProviders } from '../test/render'
import { LoginMagicForm } from './login-magic-form'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    apiFetch: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
  },
}))

const fetchMock = vi.mocked(apiFetch)
const submitName = /Send magic link|Envoyer le lien/

afterEach(() => {
  fetchMock.mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.message).mockReset()
})

beforeEach(() => {
  localStorage.setItem('kit.locale', 'en')
})

function wrap(ui: ReactElement) {
  return renderWithAppProviders(ui)
}

function mockMagic(handler: () => unknown | Promise<unknown>): void {
  fetchMock.mockImplementation(
    createApiDispatcher().on('POST', '/api/auth/sign-in/magic-link', handler).fetch,
  )
}

async function submitValidEmail(email = 'walker@kit.local') {
  const user = userEvent.setup()
  const input = screen.getByPlaceholderText('m@example.com')
  await user.clear(input)
  await user.type(input, email)
  await user.click(screen.getByRole('button', { name: submitName }))
  // Flush onSubmit: fetch must run, then isSubmitting must drop (else onSent assert is racy).
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  await waitFor(() => {
    expect(screen.getByRole('button', { name: submitName })).toBeEnabled()
  })
}

function postedMagicBody(): { email?: string; callbackURL?: string } {
  const post = fetchMock.mock.calls.find(([url]) => String(url) === '/api/auth/sign-in/magic-link')
  expect(post).toBeTruthy()
  const init = post?.[1] as { body?: string } | undefined
  return JSON.parse(init?.body ?? '{}') as { email?: string; callbackURL?: string }
}

describe('LoginMagicForm', () => {
  it('does not call onSent or show magicSentTitle on empty-body HTTP 500', async () => {
    const onSent = vi.fn()
    // Walk wire: empty-body BA error, not a kit ApiError(INTERNAL_ERROR) envelope.
    mockMagic(() => {
      throw new Error('HTTP 500')
    })
    wrap(<LoginMagicForm next={undefined} onSent={onSent} />)

    await submitValidEmail()

    expect(onSent).not.toHaveBeenCalled()
    expect(toast.message).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(en.error, { description: en.errInternal })
    expect(toast.message).not.toHaveBeenCalledWith('Check your email', expect.anything())
    expect(toast.message).not.toHaveBeenCalledWith(en.magicSentTitle, expect.anything())
  })

  it('calls onSent and shows magicSentTitle on 2xx', async () => {
    const onSent = vi.fn()
    mockMagic(() => ({}))
    wrap(<LoginMagicForm next={undefined} onSent={onSent} />)

    await submitValidEmail()

    expect(onSent).toHaveBeenCalledTimes(1)
    expect(toast.message).toHaveBeenCalledWith(en.magicSentTitle, {
      description: en.magicSentDesc,
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not call onSent when apiFetch rejects Error(HTTP 429)', async () => {
    const onSent = vi.fn()
    mockMagic(() => {
      throw new Error('HTTP 429')
    })
    wrap(<LoginMagicForm next={undefined} onSent={onSent} />)

    await submitValidEmail()

    expect(onSent).not.toHaveBeenCalled()
    expect(toast.message).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('POSTs same-origin /app when next is undefined', async () => {
    mockMagic(() => ({}))
    wrap(<LoginMagicForm next={undefined} onSent={vi.fn()} />)
    await submitValidEmail()
    expect(postedMagicBody().callbackURL).toBe(`${window.location.origin}/app`)
  })

  it('POSTs allowlisted next as same-origin callbackURL', async () => {
    mockMagic(() => ({}))
    wrap(<LoginMagicForm next="/app/orgs/x" onSent={vi.fn()} />)
    await submitValidEmail()
    expect(postedMagicBody().callbackURL).toBe(`${window.location.origin}/app/orgs/x`)
  })

  it('drops https://evil.test next and POSTs /app', async () => {
    mockMagic(() => ({}))
    wrap(<LoginMagicForm next="https://evil.test" onSent={vi.fn()} />)
    await submitValidEmail()
    const callbackURL = postedMagicBody().callbackURL
    expect(callbackURL).toBe(`${window.location.origin}/app`)
    expect(callbackURL).not.toMatch(/evil\.test/i)
  })
})
