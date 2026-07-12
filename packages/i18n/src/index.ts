/**
 * Locale engine only — catalogs stay app-owned (ADR-0001).
 * Apps pass their own message maps; package never ships product/demo copy.
 */

export type LocaleCatalogs<L extends string, M> = Record<L, M>

export type I18nEngine<L extends string, M> = {
  defaultLocale: L
  t: (locale: L) => M
  locales: readonly L[]
}

export function createI18n<L extends string, M>(opts: {
  catalogs: LocaleCatalogs<L, M>
  defaultLocale: L
}): I18nEngine<L, M> {
  const locales = Object.keys(opts.catalogs) as L[]
  return {
    defaultLocale: opts.defaultLocale,
    locales,
    t(locale) {
      return opts.catalogs[locale] ?? opts.catalogs[opts.defaultLocale]
    },
  }
}
