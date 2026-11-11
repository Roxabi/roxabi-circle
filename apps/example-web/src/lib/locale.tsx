import { createReactI18n } from '@kit/i18n/react'
import { catalogs, defaultLocale } from './i18n'

export const { LocaleProvider, useLocale } = createReactI18n({
  catalogs,
  defaultLocale,
  storageKey: 'kit.locale',
})
