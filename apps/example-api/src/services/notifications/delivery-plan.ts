import {
  type AccessFacts,
  type DeliveryRef,
  type RegistryEntry,
  type Rule,
  resolveOrganizationDestination,
  resolveUserNotification,
  type UserRule,
} from '@kit/notifications'
import type { AdmissionBatch, ConfiguredDestination, NotifyResult } from '@kit/notifications/repos'

export type NotificationRuntimePorts = Readonly<{
  ensureDeliveryAdmission(ref: DeliveryRef): Promise<void>
  reportFailure(input: { operation: 'admission'; ref: DeliveryRef; code: string }): void
}>

export function planDeliveries(input: {
  typeKey: string
  type: RegistryEntry
  userIds: readonly string[]
  access: ReadonlyMap<string, AccessFacts>
  rules: {
    deployment: readonly Rule[]
    organization: readonly Rule[]
    users: ReadonlyMap<string, readonly UserRule[]>
  }
  destinations: readonly ConfiguredDestination[]
  takeId: () => string
}): Pick<AdmissionBatch, 'users' | 'organizations'> {
  const { typeKey, type, userIds, access, rules, destinations, takeId } = input
  const users: AdmissionBatch['users'][number][] = []
  for (const userId of userIds) {
    const facts = access.get(userId)
    if (!facts) continue
    const decision = resolveUserNotification({
      typeKey,
      type,
      access: facts,
      deploymentRules: rules.deployment,
      organizationRules: rules.organization,
      userRules: rules.users.get(userId) ?? [],
    })
    if (!decision.admitted) continue
    users.push({
      id: takeId(),
      userId,
      deliveries: decision.external
        .filter((item) => item.enabled)
        .map((item) => ({ id: `u_${takeId()}`, channel: item.channel })),
    })
  }
  const organizations: AdmissionBatch['organizations'][number][] = []
  for (const destination of destinations) {
    if (
      resolveOrganizationDestination({
        typeKey,
        type,
        channel: destination.channel,
        destination: destination.facts,
        deploymentRules: rules.deployment,
      }).enabled
    )
      organizations.push({
        id: `o_${takeId()}`,
        destinationId: destination.id,
        channel: destination.channel,
      })
  }
  return { users, organizations }
}

export async function handoffDeliveries(
  result: NotifyResult,
  runtime: NotificationRuntimePorts,
): Promise<NotifyResult> {
  for (const ref of result.createdDeliveries) {
    try {
      await runtime.ensureDeliveryAdmission(ref)
    } catch {
      try {
        runtime.reportFailure({
          operation: 'admission',
          ref,
          code: 'delivery_admission_interrupted',
        })
      } catch {
        // Reporting must not undo the committed notification or block siblings.
      }
    }
  }
  return result
}
