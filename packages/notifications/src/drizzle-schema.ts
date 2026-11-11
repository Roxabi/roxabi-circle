import {
  kitNotificationDeploymentRules,
  kitNotificationDestinations,
  kitNotificationOrganizationRules,
  kitNotificationUserRules,
} from './schema/configuration'
import {
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotifications,
} from './schema/deliveries'

export {
  kitNotificationDeliveries,
  kitNotificationDeploymentRules,
  kitNotificationDestinations,
  kitNotificationOrganizationDeliveries,
  kitNotificationOrganizationRules,
  kitNotifications,
  kitNotificationUserRules,
}
export const notificationsDrizzleSchema = {
  kitNotifications,
  kitNotificationDeliveries,
  kitNotificationOrganizationDeliveries,
  kitNotificationDestinations,
  kitNotificationDeploymentRules,
  kitNotificationOrganizationRules,
  kitNotificationUserRules,
}
