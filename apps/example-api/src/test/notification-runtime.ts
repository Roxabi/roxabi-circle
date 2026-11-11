import type { DeliveryRef } from '@kit/notifications'
import type { NotificationRuntimePorts } from '../services/notifications/service'

/** Explicit external admission boundary for service and producer tests. */
export function createRecordingNotificationRuntime() {
  const admissions: DeliveryRef[] = []
  const failures: Parameters<NotificationRuntimePorts['reportFailure']>[0][] = []
  const runtime: NotificationRuntimePorts = {
    async ensureDeliveryAdmission(ref) {
      admissions.push(ref)
    },
    reportFailure(input) {
      failures.push(input)
    },
  }
  return { runtime, admissions, failures }
}
