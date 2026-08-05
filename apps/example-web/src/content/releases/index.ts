/**
 * App-owned release notes (L1 changelog recipe — GH #107 / Pilotage #100).
 * Product forks: keep your client notes under apps/<product>-web only (zero-edit).
 */

export type LocalizedText = {
  fr: string
  en: string
}

export type Release = {
  /** Stable id (filename stem) */
  id: string
  /** Display version */
  version: string
  /** Calendar date YYYY-MM-DD (sort key) */
  date: string
  title: LocalizedText
  bullets: { fr: string[]; en: string[] }
  /** Optional public URL path, e.g. `/release-gifs/demo.gif` */
  gifSrc?: string
}

/** Demo kit releases — not product métier content. */
export const releases: Release[] = [
  {
    id: '2026-08-04-kit-demo',
    version: '0.1.0',
    date: '2026-08-04',
    title: {
      fr: 'Nouveautés kit — page changelog',
      en: 'Kit updates — changelog page',
    },
    bullets: {
      fr: [
        'Menu avatar → Nouveautés (surface client)',
        'Notes de release app-owned (pas de package partagé)',
        'Catalogues séparés kit dogfood vs produit (zero-edit)',
      ],
      en: [
        'Avatar menu → What’s new (client surface)',
        'App-owned release notes (no shared package)',
        'Separate kit dogfood vs product catalogues (zero-edit)',
      ],
    },
    // After local record: copy *-02-changelog-share.gif → public/release-gifs/
    // gifSrc: '/release-gifs/YYYY-MM-DD-02-changelog-share.gif',
  },
]
