import { AppError } from '@kit/core'
import { type InboxContent, parseNotificationParams } from '@kit/notifications'
import type { NotificationRow } from '@kit/notifications/repos'
import { notificationsDogfoodRegistry as registry } from '../../lib/notifications-dogfood'
import type { NotificationLocale } from '../../messages'

/** Links are app-owned routes, derived only from the stored source, never request headers. */
function approvalHref(source: NotificationRow['source']): string {
  if (source.kind !== 'flow_approval') throw new Error('Invalid notification source')
  const tuple: unknown = JSON.parse(source.id)
  if (
    !Array.isArray(tuple) ||
    tuple.length !== 2 ||
    typeof tuple[0] !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(tuple[0]) ||
    typeof tuple[1] !== 'string' ||
    !tuple[1]
  )
    throw new Error('Invalid notification source')
  return `/app/flows/runs/${encodeURIComponent(tuple[0])}`
}

export function notificationSourcePath(row: Pick<NotificationRow, 'type' | 'source'>): string {
  switch (row.type) {
    case 'tasks.assigned':
      if (row.source.kind !== 'task' || !row.source.id)
        throw new Error('Invalid notification source')
      return '/app/tasks'
    case 'flows.approval_requested':
      return approvalHref(row.source)
    default:
      throw new Error('Unknown notification type')
  }
}

export function renderInboxRow(row: NotificationRow, locale: NotificationLocale) {
  try {
    let content: InboxContent
    switch (row.type) {
      case 'tasks.assigned': {
        const href = notificationSourcePath(row)
        const definition = registry['tasks.assigned']
        content = definition.render.in_app({
          orgId: row.orgId,
          source: row.source,
          params: parseNotificationParams(definition, row.params),
          locale,
          href,
        })
        break
      }
      case 'flows.approval_requested': {
        const definition = registry['flows.approval_requested']
        content = definition.render.in_app({
          orgId: row.orgId,
          source: row.source,
          params: parseNotificationParams(definition, row.params),
          locale,
          href: notificationSourcePath(row),
        })
        break
      }
      default:
        throw new Error('Unknown notification type')
    }
    return {
      id: row.id,
      type: row.type,
      source: row.source,
      content,
      createdAt: row.createdAt,
      readAt: row.readAt,
      resolvedAt: row.resolvedAt,
    }
  } catch {
    throw AppError.internal()
  }
}
