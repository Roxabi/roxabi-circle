import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../lib/api'
import { LocaleProvider } from '../lib/locale'
import { en } from '../messages/en'
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
  cleanup()
  fetchMock.mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.message).mockReset()
  localStorage.clear()
})

beforeEach(() => {
  localStorage.setItem('kit.locale', 'en')
})

function wrap(ui: ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>)
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

describe('LoginMagicForm', () => {
  it('does not call onSent or show magicSentTitle on empty-body HTTP 500', async () => {
    const onSent = vi.fn()
    // Walk wire: empty-body BA error, not a kit ApiError(INTERNAL_ERROR) envelope.
    fetchMock.mockRejectedValueOnce(new Error('HTTP 500'))
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
    fetchMock.mockResolvedValueOnce({})
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
    fetchMock.mockRejectedValueOnce(new Error('HTTP 429'))
    wrap(<LoginMagicForm next={undefined} onSent={onSent} />)

    await submitValidEmail()

    expect(onSent).not.toHaveBeenCalled()
    expect(toast.message).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
})
