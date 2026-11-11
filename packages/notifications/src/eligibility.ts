import type { DeliveryState, OrganizationDestinationResolution, UserResolution } from './types'

export function isUserDeliveryEligible(
  input: Readonly<{
    resolution: UserResolution
    channel: string
    status: DeliveryState
    resolved: boolean
  }>,
): boolean {
  return (
    input.status === 'pending' &&
    !input.resolved &&
    input.resolution.admitted &&
    input.resolution.external.some(
      (decision) => decision.channel === input.channel && decision.enabled,
    )
  )
}

export function isOrganizationDeliveryEligible(
  input: Readonly<{
    resolution: OrganizationDestinationResolution
    status: DeliveryState
    resolved: boolean
  }>,
): boolean {
  return input.status === 'pending' && !input.resolved && input.resolution.enabled
}
