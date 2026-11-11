import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { aroundEach, vi } from 'vitest'
import { assertNoUnexpectedApiRequests } from './api-mock'
import { clearTestQueryClients } from './query-client'
import { beginRuntimeErrorCapture, finishRuntimeErrorCapture } from './runtime-errors'

aroundEach(async (runTest) => {
  const failures: unknown[] = []
  try {
    beginRuntimeErrorCapture()
    await runTest()
  } catch (error) {
    failures.push(error)
  }
  for (const release of [
    cleanup,
    clearTestQueryClients,
    assertNoUnexpectedApiRequests,
    vi.restoreAllMocks,
    vi.unstubAllGlobals,
    finishRuntimeErrorCapture,
    vi.unstubAllEnvs,
    vi.useRealTimers,
    () => {
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }
    },
  ]) {
    try {
      release()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new Error(
      failures
        .map((error) => (error instanceof Error ? (error.stack ?? error.message) : String(error)))
        .join('\n\n'),
    )
  }
})
