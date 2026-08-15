import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../lib/api'
import type { MeResponse } from '../lib/auth'
import { LocaleProvider } from '../lib/locale'
import { OrgProvider } from '../lib/org-context'
import { en } from '../messages/en'
import { ItemsPage } from './items'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    apiFetch: vi.fn(),
  }
})

const fetchMock = vi.mocked(apiFetch)

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  localStorage.clear()
})

beforeEach(() => {
  localStorage.setItem('kit.locale', 'en')
  fetchMock.mockResolvedValue({ items: [] })
})

function wrap(me: MeResponse, ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <OrgProvider me={me}>{ui}</OrgProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

function meWith(orgs: MeResponse['orgs']): MeResponse {
  return {
    subject: 'user_x',
    email: 'x@kit.local',
    authMethod: 'session',
    role: 'user',
    platformRole: null,
    requestId: 'r',
    orgs,
  }
}

const adminOrg = {
  id: 'org_acme',
  name: 'Acme',
  slug: 'acme',
  kind: 'client' as const,
  status: 'active' as const,
  role: 'admin' as const,
}

const readerOrg = { ...adminOrg, role: 'reader' as const }

describe('ItemsPage write chrome', () => {
  it('hides create when role is reader', async () => {
    wrap(meWith([readerOrg]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('button', { name: en.itemCreate })).toBeNull()
  })

  it('hides create when there is no active org', async () => {
    wrap(meWith([]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('button', { name: en.itemCreate })).toBeNull()
  })

  it('still GETs /api/items without an org header', async () => {
    wrap(meWith([]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const listCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith('/api/items'))
    expect(listCall).toBeTruthy()
    const init = listCall?.[1] as { headers?: Record<string, string> } | undefined
    expect(init?.headers?.['X-Org-Id']).toBeUndefined()
  })

  it('sends X-Org-Id on create when the actor can write', async () => {
    wrap(meWith([adminOrg]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    fetchMock.mockClear()
    fetchMock.mockResolvedValueOnce({ item: { id: 'i1' } })

    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: en.itemCreate })[0]!)
    const fields = screen.getAllByRole('textbox')
    await user.type(fields[0]!, 'sku-one')
    await user.type(fields[1]!, 'One')
    await user.click(screen.getByRole('button', { name: en.save }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const post = fetchMock.mock.calls.find(([, init]) => {
      const method = (init as { method?: string } | undefined)?.method
      return method === 'POST'
    })
    expect(post).toBeTruthy()
    const postInit = post?.[1] as { headers?: Record<string, string> } | undefined
    expect(postInit?.headers?.['X-Org-Id']).toBe('org_acme')
  })
})
