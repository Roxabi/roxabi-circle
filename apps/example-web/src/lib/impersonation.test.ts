import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { apiFetch, StalePrincipalError, setImpersonationFence } from './api'
import { fetchMe, meQueryKey } from './auth'

const me = {
  subject: 'user_x',
  authMethod: 'session',
  platformRole: null,
  impersonation: null,
  impersonationPermissions: { read: false, write: false },
  orgs: [],
  requestId: 'req_test',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('keeps cached data and an in-flight write when focus confirms the same principal', async () => {
  // Load after stubbing the browser channel, which is initialized at module load.
  vi.stubGlobal('BroadcastChannel', undefined)
  const { configureImpersonation } = await import('./impersonation')
  // ES2022 test target does not provide Promise.withResolvers.
  let finishWrite!: (response: Response) => void
  const writeResponse = new Promise<Response>((resolve) => {
    finishWrite = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/me')
        return Promise.resolve(new Response(JSON.stringify(me), { status: 200 }))
      return writeResponse
    }),
  )

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, me)
  const cached = { value: 'preserved' }
  client.setQueryData(['private'], cached)
  let refreshed!: () => void
  const refreshComplete = new Promise<void>((resolve) => {
    refreshed = resolve
  })
  configureImpersonation(client, async () => {
    refreshed()
  })

  const write = apiFetch('/api/write', { method: 'POST' })
  window.dispatchEvent(new Event('focus'))
  await refreshComplete
  expect(client.getQueryData(['private'])).toBe(cached)
  finishWrite(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  await expect(write).resolves.toEqual({ ok: true })
})

it('retains confirmed start and stop recovery until an authoritative refresh succeeds', async () => {
  // Lazy loading lets the suite stub the channel before module initialization.
  const {
    configureImpersonation,
    isImpersonationRecoveryPending,
    refreshImpersonation,
    switchImpersonation,
  } = await import('./impersonation')
  const info = {
    id: 'imp_1',
    mode: 'read',
    organizationId: 'org_1',
    actor: { id: 'actor' },
    subject: { id: 'subject' },
    startedAt: 1,
    active: true,
  }
  let failMe = true
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/start'))
      return Promise.resolve(
        new Response(JSON.stringify({ impersonation: info, requestId: 'req' })),
      )
    if (url.endsWith('/stop'))
      return Promise.resolve(new Response(JSON.stringify({ stopped: true, requestId: 'req' })))
    if (failMe) return Promise.resolve(new Response('{}', { status: 503 }))
    return Promise.resolve(new Response(JSON.stringify(me)))
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, me)
  configureImpersonation(client, async () => {})

  await expect(switchImpersonation('start', {})).resolves.toBeUndefined()
  expect(isImpersonationRecoveryPending()).toBe(true)
  await expect(switchImpersonation('stop', { impersonationId: info.id })).resolves.toBeUndefined()
  expect(isImpersonationRecoveryPending()).toBe(true)
  failMe = false
  await refreshImpersonation()
  expect(isImpersonationRecoveryPending()).toBe(false)
})

it('propagates lifecycle POST failures even when refresh also fails', async () => {
  // Lazy loading lets the suite stub the channel before module initialization.
  const { configureImpersonation, refreshImpersonation, switchImpersonation } = await import(
    './impersonation'
  )
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(new Response('{}', { status: url.endsWith('/start') ? 403 : 503 })),
    ),
  )
  configureImpersonation(
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    async () => {},
  )
  await expect(switchImpersonation('start', {})).rejects.toMatchObject({ status: 403 })
  await refreshImpersonation().catch(() => {})
})

it('joins focus refresh to the lifecycle refresh without cancelling it', async () => {
  // Lazy loading lets the suite stub the channel before module initialization.
  const { configureImpersonation, switchImpersonation } = await import('./impersonation')
  const info = {
    id: 'imp_2',
    mode: 'read',
    organizationId: 'org_1',
    actor: { id: 'actor' },
    subject: { id: 'subject' },
    startedAt: 1,
    active: true,
  }
  let finishMe!: (response: Response) => void
  let startedMe!: () => void
  // ES2022 does not include Promise.withResolvers.
  const started = new Promise<void>((resolve) => {
    startedMe = resolve
  })
  const response = new Promise<Response>((resolve) => {
    finishMe = resolve
  })
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/start'))
      return Promise.resolve(
        new Response(JSON.stringify({ impersonation: info, requestId: 'req' })),
      )
    startedMe()
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, me)
  configureImpersonation(client, async () => {})
  const switching = switchImpersonation('start', {})
  await started
  window.dispatchEvent(new Event('focus'))
  finishMe(new Response(JSON.stringify({ ...me, subject: 'subject', impersonation: info })))
  await switching
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/me')).toHaveLength(1)
})

it('discards a pre-notice actor response and refreshes the remote delegation', async () => {
  // Lazy loading lets the suite stub the channel before module initialization.
  const { configureImpersonation, refreshImpersonation } = await import('./impersonation')
  const info = {
    id: 'remote',
    mode: 'read',
    organizationId: 'org_1',
    actor: { id: 'actor' },
    subject: { id: 'subject' },
    startedAt: 1,
    active: true,
  }
  let releaseOld!: (response: Response) => void
  let oldStarted!: () => void
  // ES2022 does not include Promise.withResolvers.
  const oldResponse = new Promise<Response>((resolve) => {
    releaseOld = resolve
  })
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve
  })
  let calls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      calls += 1
      if (calls === 1) {
        oldStarted()
        return oldResponse
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ...me, subject: 'subject', impersonation: info })),
      )
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, me)
  configureImpersonation(client, async () => {})
  const refreshing = refreshImpersonation()
  await started
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'kit.impersonation.notice', newValue: 'remote' }),
  )
  releaseOld(new Response(JSON.stringify(me)))
  await refreshing
  expect(client.getQueryData(meQueryKey)).toMatchObject({
    subject: 'subject',
    impersonation: { id: 'remote' },
  })
  expect(calls).toBeGreaterThanOrEqual(2)
})

it('dispatches Return without waiting for a hung delegated refresh', async () => {
  // Lazy loading lets the suite stub the channel before module initialization.
  const { configureImpersonation, refreshImpersonation, switchImpersonation } = await import(
    './impersonation'
  )
  const info = {
    id: 'held',
    mode: 'read',
    organizationId: 'org_1',
    actor: { id: 'actor' },
    subject: { id: 'subject' },
    startedAt: 1,
    active: true,
  }
  let releaseOld!: (response: Response) => void
  let oldStarted!: () => void
  // ES2022 does not include Promise.withResolvers.
  const oldResponse = new Promise<Response>((resolve) => {
    releaseOld = resolve
  })
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve
  })
  let meCalls = 0
  let stopped = false
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/stop')) {
        stopped = true
        return Promise.resolve(new Response(JSON.stringify({ stopped: true, requestId: 'req' })))
      }
      meCalls += 1
      if (meCalls === 1) {
        oldStarted()
        return oldResponse
      }
      return Promise.resolve(new Response(JSON.stringify(me)))
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, { ...me, subject: 'subject', impersonation: info })
  configureImpersonation(client, async () => {})
  const refreshing = refreshImpersonation()
  await started
  const switching = switchImpersonation('stop', { impersonationId: info.id })
  expect(stopped).toBe(true)
  await switching
  releaseOld(new Response(JSON.stringify({ ...me, subject: 'subject', impersonation: info })))
  await refreshing
  expect(client.getQueryData(meQueryKey)).toMatchObject({ subject: 'user_x', impersonation: null })
})

it.each(['start', 'stop'] as const)(
  'holds automatic /me refetch until the committed %s POST response settles',
  async (path) => {
    // Lazy loading lets the suite stub the channel before module initialization.
    const { configureImpersonation, switchImpersonation } = await import('./impersonation')
    const info = {
      id: `automatic_${path}`,
      mode: 'read',
      organizationId: 'org_1',
      actor: { id: 'actor' },
      subject: { id: 'subject' },
      startedAt: 1,
      active: true,
    }
    const delegated = { ...me, subject: 'subject', impersonation: info }
    let releasePost!: (response: Response) => void
    // ES2022 does not include Promise.withResolvers.
    const postResponse = new Promise<Response>((resolve) => {
      releasePost = resolve
    })
    let postHeld = true
    let prematureReads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith(`/${path}`)) return postResponse
        if (postHeld) prematureReads += 1
        return Promise.resolve(new Response(JSON.stringify(path === 'start' ? delegated : me)))
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryDefaults(meQueryKey, { queryFn: fetchMe })
    client.setQueryData(meQueryKey, path === 'start' ? me : delegated)
    configureImpersonation(client, async () => {})

    const switching = switchImpersonation(
      path,
      path === 'start' ? {} : { impersonationId: info.id },
    )
    const refetching = client.refetchQueries({ queryKey: meQueryKey, type: 'all' })
    // Let the query function attempt dispatch while the committed POST response is held.
    await Promise.resolve()
    await Promise.resolve()
    postHeld = false
    releasePost(
      new Response(
        JSON.stringify(
          path === 'start'
            ? { impersonation: info, requestId: 'req' }
            : { stopped: true, requestId: 'req' },
        ),
      ),
    )
    await expect(switching).resolves.toBeUndefined()
    await refetching
    expect(prematureReads).toBe(0)
    expect(client.getQueryData(meQueryKey)).toMatchObject(path === 'start' ? delegated : me)
  },
)

it.each(['success', 'unauthorized'] as const)(
  'does not apply a stale direct /me %s without an AbortSignal',
  async (outcome) => {
    // Lazy loading lets the suite stub the channel before module initialization.
    const { configureImpersonation, switchImpersonation } = await import('./impersonation')
    const info = {
      id: 'new',
      mode: 'read',
      organizationId: 'org_1',
      actor: { id: 'actor' },
      subject: { id: 'subject' },
      startedAt: 1,
      active: true,
    }
    let releaseOld!: (response: Response) => void
    let releasePost!: (response: Response) => void
    let oldStarted!: () => void
    // ES2022 does not include Promise.withResolvers.
    const oldResponse = new Promise<Response>((resolve) => {
      releaseOld = resolve
    })
    const postResponse = new Promise<Response>((resolve) => {
      releasePost = resolve
    })
    const started = new Promise<void>((resolve) => {
      oldStarted = resolve
    })
    let reads = 0
    let probeFence: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/start')) return postResponse
        if (url === '/probe') {
          probeFence = new Headers(init?.headers).get('X-Impersonation-Id')
          return Promise.resolve(new Response('{}'))
        }
        reads += 1
        if (reads === 1) {
          oldStarted()
          return oldResponse
        }
        return Promise.resolve(new Response(JSON.stringify(me)))
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(meQueryKey, me)
    configureImpersonation(client, async () => {})
    setImpersonationFence('original')
    const oldRead = fetchMe()
    await started
    const switching = switchImpersonation('start', {})
    releaseOld(
      outcome === 'success'
        ? new Response(JSON.stringify({ ...me, impersonation: info }))
        : new Response('{}', { status: 401 }),
    )
    await expect(oldRead).rejects.toBeInstanceOf(StalePrincipalError)
    await apiFetch('/probe')
    expect(probeFence).toBe('original')
    releasePost(new Response(JSON.stringify({ impersonation: info, requestId: 'req' })))
    await expect(switching).resolves.toBeUndefined()
  },
)

it('serializes three queued lifecycle POSTs and then unblocks direct readers', async () => {
  // Lazy loading lets the suite stub the channel before module initialization.
  const { configureImpersonation, switchImpersonation } = await import('./impersonation')
  const info = {
    id: 'queued',
    mode: 'read',
    organizationId: 'org_1',
    actor: { id: 'actor' },
    subject: { id: 'subject' },
    startedAt: 1,
    active: true,
  }
  // ES2022 does not include Promise.withResolvers.
  const releases: Array<(response: Response) => void> = []
  const posts = Array.from(
    { length: 3 },
    () =>
      new Promise<Response>((resolve) => {
        releases.push(resolve)
      }),
  )
  const dispatched: Array<() => void> = []
  const dispatches = Array.from(
    { length: 3 },
    () =>
      new Promise<void>((resolve) => {
        dispatched.push(resolve)
      }),
  )
  let postCount = 0
  let reads = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/start')) {
        const index = postCount++
        dispatched[index]()
        return posts[index]
      }
      reads += 1
      return Promise.resolve(new Response(JSON.stringify(me)))
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, me)
  configureImpersonation(client, async () => {})
  const first = switchImpersonation('start', {})
  const second = switchImpersonation('start', {})
  const third = switchImpersonation('start', {})
  const reader = fetchMe()
  await dispatches[0]
  expect(postCount).toBe(1)
  expect(reads).toBe(0)
  releases[0](new Response(JSON.stringify({ impersonation: info, requestId: 'req' })))
  await dispatches[1]
  expect(postCount).toBe(2)
  expect(reads).toBe(0)
  releases[1](new Response(JSON.stringify({ impersonation: info, requestId: 'req' })))
  await dispatches[2]
  expect(postCount).toBe(3)
  expect(reads).toBe(0)
  releases[2](new Response(JSON.stringify({ impersonation: info, requestId: 'req' })))
  await Promise.all([first, second, third, reader])
  expect(reads).toBeGreaterThan(0)
})

it('keeps recovery when the last observer cancels and reverts the delegated me refresh', async () => {
  const {
    configureImpersonation,
    isImpersonationRecoveryPending,
    refreshImpersonation,
    switchImpersonation,
  } = await import('./impersonation')
  const info = {
    id: 'imp_departure',
    mode: 'read',
    organizationId: 'org_1',
    actor: { id: 'actor' },
    subject: { id: 'subject' },
    startedAt: 1,
    active: true,
  }
  const delegated = { ...me, subject: 'subject', impersonation: info }
  let startedMe!: () => void
  const started = new Promise<void>((resolve) => {
    startedMe = resolve
  })
  let aborted = false
  let meRequests = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/start'))
        return Promise.resolve(
          new Response(JSON.stringify({ impersonation: info, requestId: 'req' })),
        )
      meRequests += 1
      if (meRequests > 1) return Promise.resolve(new Response(JSON.stringify(delegated)))
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
        startedMe()
      })
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(meQueryKey, me)
  const observer = new QueryObserver(client, {
    queryKey: meQueryKey,
    queryFn: fetchMe,
    enabled: false,
  })
  const unsubscribe = observer.subscribe(() => {})
  configureImpersonation(client, async () => {})
  const switching = switchImpersonation('start', {})
  await started
  expect(isImpersonationRecoveryPending()).toBe(true)
  expect(client.getQueryState(meQueryKey)?.fetchStatus).toBe('fetching')
  unsubscribe()
  await switching
  expect(aborted).toBe(true)
  expect(meRequests).toBe(1)
  expect(client.getQueryData(meQueryKey)).toEqual(me)
  expect(isImpersonationRecoveryPending()).toBe(true)
  await refreshImpersonation()
  expect(meRequests).toBe(2)
  expect(client.getQueryData(meQueryKey)).toEqual(delegated)
  expect(isImpersonationRecoveryPending()).toBe(false)
})
