import { runTaskMutationHook, type TaskMutationEvent, taskMutationAudit } from '@kit/tasks'
import type { KitDb } from '../lib/db-type'
import { appendAudit } from './audit'
import type { NotificationRuntimePorts } from './notifications/service'
import { notifyTaskMutation } from './notifications/task-producer'
import { createTaskNotificationService } from './notifications/task-service'

/** App-owned audit write. `@kit/tasks` only maps the event. A failed insert does not throw. */
export async function recordTaskMutation(
  db: KitDb,
  runtime: NotificationRuntimePorts,
  event: TaskMutationEvent,
): Promise<void> {
  await runTaskMutationHook(
    {
      afterMutation: async (fired) => {
        await appendAudit(db, taskMutationAudit(fired))
        await notifyTaskMutation(db, createTaskNotificationService(db, runtime), fired)
      },
    },
    event,
  )
}

export async function recordTaskLinkMutation(
  db: KitDb,
  event: TaskMutationEvent & { kind: 'link_create' },
): Promise<void> {
  await runTaskMutationHook(
    {
      afterMutation: async (fired) => {
        await appendAudit(db, taskMutationAudit(fired))
      },
    },
    event,
  )
}
