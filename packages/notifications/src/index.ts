export { type DeliveryRef, deliveryRefSchema } from './delivery-ref'
export { isOrganizationDeliveryEligible, isUserDeliveryEligible } from './eligibility'
export { renderNotificationEmail } from './email'
export { parseNotificationParams } from './params'
export { defineNotificationRegistry, defineNotificationType } from './registry'
export { resolveOrganizationDestination, resolveUserNotification } from './resolve'
export type {
  AccessFacts,
  AddressResolution,
  Channel,
  ChannelResult,
  DeliveryState,
  DestinationFacts,
  EmailContent,
  ExternalDecision,
  InboxContent,
  Json,
  NotificationDefinition,
  OrganizationDestinationResolution,
  Registry,
  RegistryEntry,
  RenderInput,
  Rule,
  RuleSource,
  Selector,
  SourceRef,
  UserResolution,
  UserRule,
} from './types'
export { validateNotificationRule } from './validation'
