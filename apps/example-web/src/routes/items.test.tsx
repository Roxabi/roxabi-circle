import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../lib/api'
import type { MeResponse } from '../lib/auth'
import { en } from '../messages/en'
import { createApiDispatcher } from '../test/api-mock'
import { createMe } from '../test/factories'
import { renderWithAppProviders } from '../test/render'
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
  fetchMock.mockReset()
})

beforeEach(() => {
  localStorage.setItem('kit.locale', 'en')
  fetchMock.mockImplementation(
    createApiDispatcher()
      .on('GET', '/api/items', () => ({ items: [] }))
      .on('POST', '/api/items', () => ({ item: { id: 'i1' } })).fetch,
  )
})

function wrap(me: MeResponse, ui: ReactElement) {
  return renderWithAppProviders(ui, { me })
}

function meWith(orgs: MeResponse['orgs']): MeResponse {
  return createMe({
    subject: 'user_x',
    email: 'x@kit.local',
    orgs,
    requestId: 'r',
  })
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
  it('shows create when role is reader (personal kennel)', async () => {
    wrap(meWith([readerOrg]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(screen.getAllByRole('button', { name: en.itemCreate }).length).toBeGreaterThan(0)
  })

  it('shows create when there is no active org', async () => {
    wrap(meWith([]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(screen.getAllByRole('button', { name: en.itemCreate }).length).toBeGreaterThan(0)
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

  it('does not send X-Org-Id on create (personal kennel)', async () => {
    wrap(meWith([adminOrg]), <ItemsPage />)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    fetchMock.mockClear()

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
    expect(postInit?.headers?.['X-Org-Id']).toBeUndefined()
  })
})
