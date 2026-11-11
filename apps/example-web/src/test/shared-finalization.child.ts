import type { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestQueryClient } from './query-client'
import { allowRuntimeError } from './runtime-errors'

describe('shared finalization consumer', { concurrent: false, shuffle: false }, () => {
  let failTeardown = true
  const queryKey = ['web-finalization-consumer']
  let queryClient: QueryClient

  afterEach(() => {
    if (failTeardown) {
      failTeardown = false
      console.error('WEB_FINALIZATION_UNDECLARED_RUNTIME_MARKER')
      throw new Error('WEB_FINALIZATION_CONSUMER_AFTER_EACH_MARKER')
    }
  })

  it('retains independent consumer and finalizer diagnostics', () => {
    localStorage.setItem('web-finalization-consumer', 'not cleaned')
    queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKey, 'not cleaned')
  })

  it('runs with restored support after the failed teardown', () => {
    expect(localStorage.getItem('web-finalization-consumer')).toBeNull()
    expect(queryClient.getQueryData(queryKey)).toBeUndefined()
    allowRuntimeError('WEB_FINALIZATION_ALLOWED_RUNTIME_MARKER')
    console.error('WEB_FINALIZATION_ALLOWED_RUNTIME_MARKER')
    console.info('WEB_FINALIZATION_NEXT_BODY_MARKER')
  })
})
