import { createApp } from './app'
import type { Env } from './env'
import { consumeQueueMessage, handleScheduledTick } from './jobs/demo-handler'
import { runNotificationMaintenance } from './notifications-delivery/maintenance'

const app = createApp()

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<unknown>, _env: Env, _ctx: ExecutionContext) {
    // Honors disposition; throw retries. Product copies: max_retries + DLQ.
    for (const msg of batch.messages) {
      await consumeQueueMessage(msg)
    }
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    if (controller.cron === '0 * * * *') {
      handleScheduledTick({
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
      })
    } else if (controller.cron === '*/5 * * * *') {
      await runNotificationMaintenance(env)
    }
  },
}

export { FlowRunWorkflow } from './flows-run/workflow'
export { NotificationDeliveryWorkflow } from './notifications-delivery/workflow'
export { createApp }
