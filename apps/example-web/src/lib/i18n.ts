import { createI18n } from '@gosilex/i18n'
import { en } from '../messages/en'
import { fr, type Messages } from '../messages/fr'

export type Locale = 'fr' | 'en'

const engine = createI18n<Locale, Messages>({
  defaultLocale: 'fr',
  catalogs: { fr, en },
})

export function t(locale: Locale): Messages {
  return engine.t(locale)
}

export const defaultLocale: Locale = engine.defaultLocale
