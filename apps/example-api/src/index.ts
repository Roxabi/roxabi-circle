import { createApp } from './app'
import { handleDemoJob, handleScheduledTick } from './jobs/demo-handler'

const app = createApp()

export default {
  fetch: app.fetch,

  async queue(
    batch: { messages: { body: unknown; ack: () => void; retry: () => void }[] },
    _env: unknown,
    _ctx: unknown,
  ) {
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
        // still ack to avoid poison loops on demo handler — product may retry
        msg.ack()
      }
    }
  },

  async scheduled(
    controller: { cron: string; scheduledTime: number },
    _env: unknown,
    _ctx: unknown,
  ) {
    handleScheduledTick({
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    })
  },
}

export { createApp }
