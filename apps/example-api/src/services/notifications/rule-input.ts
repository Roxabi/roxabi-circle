import { AppError } from '@kit/core'
import { type Rule, validateNotificationRule } from '@kit/notifications'
import { notificationsDogfoodRegistry } from '../../lib/notifications-dogfood'

export function validateRuleInput(level: 'deployment' | 'organization' | 'user', rule: Rule): Rule {
  try {
    return validateNotificationRule({ registry: notificationsDogfoodRegistry, level, rule })
  } catch (error) {
    if (error instanceof TypeError) throw AppError.validation('Invalid notification rule')
    throw error
  }
}
