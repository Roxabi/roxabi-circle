import {
  parseNotificationParams,
  resolveOrganizationDestination,
  resolveUserNotification,
} from '@kit/notifications'
import { MAX_TASK_TITLE_LEN } from '@kit/tasks'
import { describe, expect, it } from 'vitest'
import { notificationsDogfoodRegistry as registry } from './notifications-dogfood'

const access = { organizationActive: true, member: true, moduleReadable: true }
const destination = {
  configured: true,
  selector: { kind: 'all' as const },
  organizationActive: true,
  moduleEffective: true,
}

describe('notification dogfood declarations', () => {
  it('accepts only the bounded task display title and an empty approval payload', () => {
    const task = registry['tasks.assigned']
    const approval = registry['flows.approval_requested']
    expect(parseNotificationParams(task, { taskTitle: 'Review 東京' })).toEqual({
      taskTitle: 'Review 東京',
    })
    for (const value of [
      { taskTitle: '' },
      { taskTitle: 'x'.repeat(MAX_TASK_TITLE_LEN + 1) },
      { taskTitle: 'x', sender: 'private' },
    ]) {
      expect(() => parseNotificationParams(task, value)).toThrow()
    }
    expect(parseNotificationParams(approval, {})).toEqual({})
    expect(() => parseNotificationParams(approval, { prompt: 'private' })).toThrow()
  })
  it.each(['tasks.assigned', 'flows.approval_requested'] as const)(
    '%s has defaults governed by user rules',
    (typeKey) => {
      const type = registry[typeKey]
      const base = {
        typeKey,
        type,
        access,
        deploymentRules: [],
        organizationRules: [],
        userRules: [],
      }
      const result = resolveUserNotification(base)
      expect(
        result.admitted && result.external.map(({ channel, enabled }) => [channel, enabled]),
      ).toEqual([
        ['email', true],
        ['slack', true],
      ])
      const disabled = resolveUserNotification({
        ...base,
        userRules: [{ selector: { kind: 'all' }, channel: 'slack', enabled: false, locked: false }],
      })
      expect(disabled.admitted && disabled.inbox).toBe(true)
      expect(
        disabled.admitted && disabled.external.map(({ channel, enabled }) => [channel, enabled]),
      ).toEqual([
        ['email', true],
        ['slack', false],
      ])
    },
  )
  it('requires collective configuration and explicitly opts in only approvals, independent of user count', () => {
    const task = resolveOrganizationDestination({
      typeKey: 'tasks.assigned',
      type: registry['tasks.assigned'],
      channel: 'slack',
      destination,
      deploymentRules: [],
    })
    const approvalInput = {
      typeKey: 'flows.approval_requested',
      type: registry['flows.approval_requested'],
      channel: 'slack',
      destination,
      deploymentRules: [],
    }
    expect(task.enabled).toBe(false)
    expect(resolveOrganizationDestination(approvalInput).enabled).toBe(true)
    expect(
      resolveOrganizationDestination({
        ...approvalInput,
        destination: { ...destination, configured: false },
      }).enabled,
    ).toBe(false)
  })
  it('renders approval messages without retaining private flow instructions', () => {
    const type = registry['flows.approval_requested']
    const input = {
      orgId: 'org',
      source: { kind: 'flow_approval', id: '["run","task"]' },
      params: {},
      locale: 'en' as const,
      href: '/approvals/1',
    }
    expect(type.render.in_app(input).href).toBe('/approvals/1')
    expect(type.render.email?.(input).text).toContain('/approvals/1')
    expect(type.render.slack?.(input).text).toContain('/approvals/1')
  })
  it('uses the selected app catalog for all rendered channels', () => {
    const task = registry['tasks.assigned']
    const input = {
      orgId: 'org',
      source: { kind: 'task', id: 'task-1' },
      params: { taskTitle: 'Réviser 東京' },
      locale: 'fr' as const,
      href: '/app/tasks',
    }
    expect(task.render.in_app(input)).toEqual({
      title: 'Tâche assignée',
      body: 'Réviser 東京',
      href: '/app/tasks',
    })
    expect(task.render.email?.(input).subject).toBe('Tâche assignée')
    expect(task.render.slack?.(input).text).toContain('Tâche assignée')
  })
})
