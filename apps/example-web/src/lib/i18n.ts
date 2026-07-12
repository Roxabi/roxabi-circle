import { en } from '../messages/en'
import { fr, type Messages } from '../messages/fr'

export type Locale = 'fr' | 'en'

const catalogs: Record<Locale, Messages> = { fr, en }

export function t(locale: Locale): Messages {
  return catalogs[locale] ?? fr
}

export const defaultLocale: Locale = 'fr'
