import { describe, expect, it, vi } from 'vitest'
import { handleDemoJob, handleScheduledTick, parseDemoJob } from './demo-handler'

describe('demo job handler', () => {
  it('parses demo.ping and demo.log', () => {
    expect(parseDemoJob({ type: 'demo.ping', at: 1, subject: 'u1' })).toEqual({
      type: 'demo.ping',
      at: 1,
      subject: 'u1',
    })
    expect(parseDemoJob({ type: 'demo.log', message: 'hi' })).toEqual({
      type: 'demo.log',
      message: 'hi',
    })
  })

  it('handles ping and ignores unknown without throw', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(handleDemoJob({ type: 'demo.ping', at: 42 }).action).toBe('handled')
    expect(handleDemoJob({ type: 'product.artifact.commit' }).action).toBe('ignored')
    expect(handleDemoJob(null).action).toBe('ignored')
    handleScheduledTick({ cron: '0 * * * *', scheduledTime: 99 })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
