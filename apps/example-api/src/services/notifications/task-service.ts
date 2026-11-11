import { resolveNotifications } from '@kit/notifications/repos'
import { kitNotificationOrganizationDeliveries, kitNotifications } from '@kit/notifications/schema'
import { kitTaskAssignees, kitTaskStages, kitTasks } from '@kit/tasks/schema'
import { sql } from 'drizzle-orm'
import type { KitDb } from '../../lib/db-type'
import { createAppNotificationPersistencePorts, createAppNotificationService } from './app'
import type { NotificationRuntimePorts } from './service'

/** Resolves Task notices only when their current lifecycle still permits it. */
export function createTaskNotificationService(db: KitDb, runtime: NotificationRuntimePorts) {
  const ports = createAppNotificationPersistencePorts(db)
  return createAppNotificationService(db, runtime, {
    ...ports,
    async resolve(input) {
      if (input.source.kind !== 'task') return ports.resolve(input)
      const { orgId, source } = input
      const closed = sql`NOT EXISTS (
        SELECT 1 FROM ${kitTasks}
        WHERE ${kitTasks.orgId} = ${orgId} AND ${kitTasks.id} = ${source.id}
          AND ${kitTasks.done} = 0
          AND NOT EXISTS (
            SELECT 1 FROM ${kitTaskStages}
            WHERE ${kitTaskStages.orgId} = ${kitTasks.orgId}
              AND ${kitTaskStages.boardKey} = ${kitTasks.boardKey}
              AND ${kitTaskStages.id} = ${kitTasks.stageId}
              AND ${kitTaskStages.isTerminal} = 1
          )
      )`
      const unassigned = sql`NOT EXISTS (
        SELECT 1 FROM ${kitTaskAssignees}
        WHERE ${kitTaskAssignees.orgId} = ${orgId}
          AND ${kitTaskAssignees.taskId} = ${source.id}
          AND ${kitTaskAssignees.userId} = ${kitNotifications.userId}
      )`
      const notificationGuard =
        input.userIds === undefined ? closed : sql`(${closed} OR ${unassigned})`
      return resolveNotifications(db, input, {
        notifications: sql`${kitNotifications.typeKey} <> 'tasks.assigned' OR (${notificationGuard})`,
        organizationDeliveries: sql`${kitNotificationOrganizationDeliveries.typeKey} <> 'tasks.assigned' OR (${closed})`,
      })
    },
  })
}
