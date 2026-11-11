import { type DeliveryRef, deliveryRefSchema } from '@kit/notifications'

export async function deliveryWorkflowId(ref: DeliveryRef): Promise<string> {
  const valid = deliveryRefSchema.parse(ref)
  const bytes = new TextEncoder().encode(
    JSON.stringify(['notification-delivery', 1, valid.orgId, valid.kind, valid.id]),
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `nd-v1-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
