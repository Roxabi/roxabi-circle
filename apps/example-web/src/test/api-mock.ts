import type { apiFetch } from '../lib/api'

type ApiFetch = typeof apiFetch
type ApiRequest = {
  path: string
  method: string
  init: Parameters<ApiFetch>[1]
}
type ApiHandler = (request: ApiRequest) => unknown | Promise<unknown>
type PathMatcher = string | RegExp

type RegisteredHandler = {
  method: string
  path: PathMatcher
  handler: ApiHandler
}

const unexpectedRequests: Error[] = []

function unexpectedRequest(method: string, path: string): Error {
  const error = new Error(`Unexpected API request: ${method} ${path}`)
  unexpectedRequests.push(error)
  return error
}

export function failUnexpectedApiRequest(path: string, init?: { method?: string }): never {
  throw unexpectedRequest(init?.method?.toUpperCase() ?? 'GET', path)
}

const dispatchers = new Set<ApiDispatcher>()

function matches(path: string, matcher: PathMatcher): boolean {
  if (typeof matcher === 'string') return path === matcher
  matcher.lastIndex = 0
  return matcher.test(path)
}

export class ApiDispatcher {
  private readonly handlers: RegisteredHandler[] = []

  readonly fetch = (async (path: string, init?: Parameters<ApiFetch>[1]) => {
    const method = init?.method?.toUpperCase() ?? 'GET'
    const request = { path, method, init }
    const handler = this.handlers.find(
      (candidate) => candidate.method === method && matches(path, candidate.path),
    )
    if (!handler) throw unexpectedRequest(method, path)
    return handler.handler(request)
  }) as ApiFetch

  on(method: string, path: PathMatcher, handler: ApiHandler): this {
    this.handlers.push({ method: method.toUpperCase(), path, handler })
    return this
  }
}

export function createApiDispatcher(): ApiDispatcher {
  const dispatcher = new ApiDispatcher()
  dispatchers.add(dispatcher)
  return dispatcher
}

export function assertNoUnexpectedApiRequests(): void {
  dispatchers.clear()
  if (unexpectedRequests.length === 0) return
  const messages = unexpectedRequests.map((error) => error.message)
  unexpectedRequests.length = 0
  throw new Error(messages.join('\n'))
}
