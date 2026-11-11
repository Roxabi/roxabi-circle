import { createI18n, resolveLocale } from '@kit/i18n'
import { en } from './en'
import { fr } from './fr'

export type NotificationLocale = 'fr' | 'en'
export const notificationMessages = createI18n<NotificationLocale, typeof en>({
  catalogs: { fr, en },
  defaultLocale: 'fr',
})
export function notificationLocale(value: string | null | undefined): NotificationLocale {
  return resolveLocale(notificationMessages.locales, notificationMessages.defaultLocale, value)
}
