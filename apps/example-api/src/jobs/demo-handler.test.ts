import { describe, expect, it, vi } from 'vitest'
import {
  consumeQueueMessage,
  handleDemoJob,
  handleScheduledTick,
  parseDemoJob,
} from './demo-handler'

function fakeMsg(body: unknown) {
  return { body, ack: vi.fn(), retry: vi.fn() }
}

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

  it('handles ping and log with ack disposition', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(handleDemoJob({ type: 'demo.ping', at: 42 })).resolves.toEqual({
      ok: true,
      action: 'handled',
      type: 'demo.ping',
      disposition: 'ack',
    })
    await expect(handleDemoJob({ type: 'demo.log', message: 'hi' })).resolves.toEqual({
      ok: true,
      action: 'handled',
      type: 'demo.log',
      disposition: 'ack',
    })
    log.mockRestore()
  })

  it('ignores unknown, product names, and null with ack disposition', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(handleDemoJob({ type: 'product.artifact.commit' })).resolves.toMatchObject({
      action: 'ignored',
      disposition: 'ack',
      ok: true,
    })
    await expect(handleDemoJob(null)).resolves.toMatchObject({
      action: 'ignored',
      disposition: 'ack',
      ok: true,
    })
    log.mockRestore()
  })

  it('consumeQueueMessage acks ping once and never retries', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const msg = fakeMsg({ type: 'demo.ping', at: 1 })
    await consumeQueueMessage(msg)
    expect(msg.ack).toHaveBeenCalledOnce()
    expect(msg.retry).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('consumeQueueMessage retries when handle returns retry disposition', async () => {
    const msg = fakeMsg({ type: 'demo.ping', at: 1 })
    await consumeQueueMessage(msg, async () => ({
      ok: false,
      action: 'handled',
      type: 'demo.ping',
      disposition: 'retry',
    }))
    expect(msg.retry).toHaveBeenCalledOnce()
    expect(msg.ack).not.toHaveBeenCalled()
  })

  it('consumeQueueMessage retries and logs when handle throws', async () => {
    const errLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const msg = fakeMsg({ type: 'demo.ping', at: 1 })
    await consumeQueueMessage(msg, async () => {
      throw new Error('boom')
    })
    expect(msg.retry).toHaveBeenCalledOnce()
    expect(msg.ack).not.toHaveBeenCalled()
    expect(errLog).toHaveBeenCalledWith(
      JSON.stringify({
        level: 'error',
        msg: 'demo_queue_handler_error',
        error: 'boom',
      }),
    )
    errLog.mockRestore()
  })

  it('handleScheduledTick still logs', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    handleScheduledTick({ cron: '0 * * * *', scheduledTime: 99 })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
