import type { DeliveryRef } from '@kit/notifications'

/** External binding double: models identity and presence only, not Workflow execution. */
export function createMemoryNotificationWorkflow(
  makeInstance: (id: string) => WorkflowInstance,
): Workflow<DeliveryRef> {
  const instances = new Map<string, WorkflowInstance>()
  return {
    async get(id) {
      const instance = instances.get(id)
      if (!instance) throw new Error('Notification workflow instance not found')
      return instance
    },
    async create(options) {
      const id = options?.id
      if (!id) throw new Error('Notification workflow requires a stable ID')
      if (instances.has(id)) throw new Error('Notification workflow instance already exists')
      const instance = makeInstance(id)
      instances.set(id, instance)
      return instance
    },
    async createBatch() {
      throw new Error('Notification workflow createBatch is not implemented in memory')
    },
    async deleteBatch() {
      throw new Error('Notification workflow deleteBatch is not implemented in memory')
    },
  }
}
