import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createI18n, hasLocaleSwitcher, resolveLocale } from './index'

export function createReactI18n<C extends Record<string, unknown>>(opts: {
  catalogs: C
  defaultLocale: NoInfer<keyof C & string>
  storageKey: string
}) {
  type Locale = keyof C & string
  type Messages = C[Locale]
  type LocaleContext = {
    locale: Locale
    locales: readonly Locale[]
    setLocale: (locale: Locale) => void
    showSwitcher: boolean
    m: Messages
  }

  const engine = createI18n<Locale, Messages>({
    catalogs: opts.catalogs,
    defaultLocale: opts.defaultLocale,
  })
  const Context = createContext<LocaleContext | null>(null)

  function updateDocument(locale: Locale) {
    try {
      if (typeof document !== 'undefined') document.documentElement.lang = locale
    } catch {
      // Document access may be unavailable independently of storage.
    }
  }

  function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(() => {
      if (typeof window === 'undefined') return engine.defaultLocale
      try {
        return resolveLocale(
          engine.locales,
          engine.defaultLocale,
          window.localStorage.getItem(opts.storageKey),
        )
      } catch {
        return engine.defaultLocale
      }
    })

    useEffect(() => {
      updateDocument(locale)
    }, [locale])

    const setLocale = useCallback((value: Locale) => {
      const next = resolveLocale(engine.locales, engine.defaultLocale, value)
      setLocaleState(next)
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(opts.storageKey, next)
      } catch {
        // Storage may be disabled; document and state still update.
      }
      updateDocument(next)
    }, [])

    const value = useMemo<LocaleContext>(
      () => ({
        locale,
        locales: engine.locales,
        setLocale,
        showSwitcher: hasLocaleSwitcher(engine.locales),
        m: engine.t(locale),
      }),
      [locale, setLocale],
    )

    return createElement(Context.Provider, { value }, children)
  }

  function useLocale(): LocaleContext {
    const context = useContext(Context)
    if (!context) throw new Error('useLocale must be used within LocaleProvider')
    return context
  }

  return { LocaleProvider, useLocale }
}
