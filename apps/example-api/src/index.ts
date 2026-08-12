import { createApp } from './app'
import type { Env } from './env'
import { handleDemoJob, handleScheduledTick } from './jobs/demo-handler'

const app = createApp()

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<unknown>, _env: Env, _ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      try {
        handleDemoJob(msg.body)
        msg.ack()
      } catch (err) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'demo_queue_handler_error',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        // Demo-only always-ack: drops poison messages so local/CI queue never loops.
        // Product handlers MUST NOT copy this — use msg.retry() / dead-letter policy
        // (max retries + DLQ) so failed work is retried or parked, not silently lost.
        msg.ack()
      }
    }
  },

  async scheduled(controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    handleScheduledTick({
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    })
  },
}

export { createApp }
