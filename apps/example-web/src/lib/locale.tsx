import { hasLocaleSwitcher, resolveLocale } from '@kit/i18n'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { Messages } from '../messages/fr'
import { defaultLocale, type Locale, locales, t } from './i18n'

const STORAGE_KEY = 'kit.locale'

type LocaleCtx = {
  locale: Locale
  locales: readonly Locale[]
  setLocale: (l: Locale) => void
  showSwitcher: boolean
  m: Messages
}

const Ctx = createContext<LocaleCtx | null>(null)

function readStored(): Locale {
  try {
    return resolveLocale(locales, defaultLocale, localStorage.getItem(STORAGE_KEY))
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
    const next = resolveLocale(locales, defaultLocale, l)
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.lang = next
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () => ({
      locale,
      locales,
      setLocale,
      showSwitcher: hasLocaleSwitcher(locales),
      m: t(locale),
    }),
    [locale, setLocale],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLocale() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
