import type { DeliveryRef } from '@kit/notifications'
import { recordRetryableFailure } from '@kit/notifications/repos'
import type { KitDb } from '../lib/db-type'
import { createDeliveryRetryableError } from './retry'
import { type DeliveryAttemptResult, type DeliveryOutcome, deliveryCodeSchema } from './types'

export async function handleRetryable(
  db: KitDb,
  ref: DeliveryRef,
  result: Extract<DeliveryAttemptResult, { status: 'retryable' }>,
): Promise<DeliveryOutcome> {
  const hint = result.retryAfterSeconds
  if (hint !== undefined && Number.isFinite(hint) && hint >= 0 && hint > 86_400) {
    return { status: 'failed', code: 'retry_after_exceeds_budget' }
  }
  const code = deliveryCodeSchema.safeParse(result.code)
  const diagnosticCode = code.success ? code.data : 'delivery_attempt_interrupted'
  const validHint = hint !== undefined && Number.isFinite(hint) && hint >= 0 ? hint : undefined
  const error = createDeliveryRetryableError({
    code: diagnosticCode,
    ...(validHint === undefined ? {} : { retryAfterSeconds: validHint }),
  })
  try {
    await recordRetryableFailure(db, ref, diagnosticCode, Date.now())
  } catch {
    console.error('notification_delivery_retry_diagnostic_interrupted', { orgId: ref.orgId })
  }
  throw error
}
