import { releases as defaultReleases, type LocalizedText, type Release } from '../content/releases'

export type LocaleCode = 'fr' | 'en'

/** Newest first; invalid / missing dates sort last. */
export function getReleases(source: readonly Release[] = defaultReleases): Release[] {
  return [...source].sort((a, b) => {
    const ta = Date.parse(a.date)
    const tb = Date.parse(b.date)
    const aOk = Number.isFinite(ta)
    const bOk = Number.isFinite(tb)
    if (!aOk && !bOk) return a.id.localeCompare(b.id)
    if (!aOk) return 1
    if (!bOk) return -1
    if (tb !== ta) return tb - ta
    return a.id.localeCompare(b.id)
  })
}

/** Prefer requested locale, then fr, then en, then empty. */
export function pickLocalized(text: LocalizedText, locale: string): string {
  if (locale === 'en' && text.en.trim()) return text.en
  if (text.fr.trim()) return text.fr
  if (text.en.trim()) return text.en
  return ''
}

export function pickBullets(release: Release, locale: string): string[] {
  if (locale === 'en' && release.bullets.en.length > 0) return release.bullets.en
  if (release.bullets.fr.length > 0) return release.bullets.fr
  return release.bullets.en
}
