import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { Messages } from '../messages/fr'
import { defaultLocale, type Locale, t } from './i18n'

const STORAGE_KEY = 'kit.locale'

type LocaleCtx = {
  locale: Locale
  setLocale: (l: Locale) => void
  m: Messages
}

const Ctx = createContext<LocaleCtx | null>(null)

function readStored(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'fr' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return defaultLocale
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return defaultLocale
    const initial = readStored()
    try {
      document.documentElement.lang = initial
    } catch {
      /* ignore */
    }
    return initial
  })

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
      document.documentElement.lang = l
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ locale, setLocale, m: t(locale) }), [locale, setLocale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLocale() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
