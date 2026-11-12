import { afterEach, vi } from 'vitest'

let cleanup: undefined | (() => void)
// The Node test environment must not load browser-only test setup.
if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof document.createElement === 'function'
) {
  await import('@testing-library/jest-dom/vitest')
  const reactTestingLibrary = await import('@testing-library/react')
  cleanup = reactTestingLibrary.cleanup
}

afterEach(() => {
  try {
    if (cleanup) cleanup()
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
      window.sessionStorage.clear()
    }
  }
})
