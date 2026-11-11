import { afterAll, afterEach, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest'
import { allowRuntimeError } from './runtime-errors'

const originalConsole = console
const originalConsoleError = console.error

function restoreSuiteInstrumentation(): void {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  originalConsole.error = originalConsoleError
}

afterAll(restoreSuiteInstrumentation)

// The configured teardown verifies each narrow allowance across real test lifetimes.
describe('console capture lifetimes', { concurrent: false, shuffle: false }, () => {
  it('captures a declared error with a console spy', () => {
    vi.spyOn(console, 'error')
    allowRuntimeError('spied runtime message')
    console.error('spied runtime message')
  })

  it('captures the next declared error with a global console stub', () => {
    vi.stubGlobal('console', Object.create(console))
    allowRuntimeError('stubbed runtime message')
    console.error('stubbed runtime message')
  })

  it('captures a later declared error without inheriting either instrumentation', () => {
    allowRuntimeError('independent runtime message')
    console.error('independent runtime message')
  })
})

describe('suite-owned console object', { concurrent: false, shuffle: false }, () => {
  let retired = false

  beforeAll(() => {
    const stubbedConsole: Console = Object.create(console)
    stubbedConsole.error = () => {
      if (retired) throw new Error('retired console object was reused')
    }
    vi.stubGlobal('console', stubbedConsole)
  })
  afterEach(() => {
    retired = true
  })
  afterAll(restoreSuiteInstrumentation)

  it('captures a declared error through the suite console', () => {
    allowRuntimeError('suite console error')
    console.error('suite console error')
  })

  it('does not resurrect the retired method on the restored console', () => {
    allowRuntimeError('restored console error')
    console.error('restored console error')
  })
})

describe('suite-owned console spy', { concurrent: false, shuffle: false }, () => {
  let retiredSpy: MockInstance<typeof console.error>

  beforeAll(() => {
    retiredSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(restoreSuiteInstrumentation)

  it('captures a declared error while the suite spy is live', () => {
    allowRuntimeError('suite spy error')
    console.error('suite spy error')
  })

  it('does not invoke a restored spy through the following capture', () => {
    retiredSpy.mockImplementation(() => {
      throw new Error('retired console spy was reused')
    })
    allowRuntimeError('restored spy console error')
    console.error('restored spy console error')
  })
})

describe('Window listener attachment ownership', { concurrent: false, shuffle: false }, () => {
  const retiredWindow = new window.EventTarget()
  const WindowErrorEvent = window.ErrorEvent

  beforeAll(() => {
    vi.stubGlobal('window', retiredWindow)
  })
  afterAll(restoreSuiteInstrumentation)

  it('captures an error from the suite attachment target', () => {
    allowRuntimeError('attached window error')
    retiredWindow.dispatchEvent(
      new WindowErrorEvent('error', { error: new Error('attached window error') }),
    )
  })

  it('does not capture events from a retired attachment target', () => {
    retiredWindow.dispatchEvent(
      new WindowErrorEvent('error', { error: new Error('retired window error') }),
    )
    allowRuntimeError('current window console error')
    console.error('current window console error')
  })
})

describe('composed suite and body console spies', { concurrent: false, shuffle: false }, () => {
  let retiredSpy: MockInstance<typeof console.error>

  beforeAll(() => {
    console.error = (...args: unknown[]) => {
      originalConsoleError(...args)
      throw new Error('direct console handler failure')
    }
    retiredSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(restoreSuiteInstrumentation)

  it('captures a declared error through both spy lifetimes', () => {
    vi.spyOn(console, 'error')
    allowRuntimeError('composed spy error')
    console.error('composed spy error')
  })

  it('restores the direct handler without reviving the retired suite spy', () => {
    retiredSpy.mockImplementation(() => {
      throw new Error('retired composed console spy was reused')
    })
    allowRuntimeError('restored composed console error')
    expect(() => console.error('restored composed console error')).toThrow(
      'direct console handler failure',
    )
  })
})
