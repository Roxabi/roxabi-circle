import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'

type ThemeContext = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolved: 'light' | 'dark'
}

const Context = createContext<ThemeContext | null>(null)

function readStored(storageKey: string): Theme {
  try {
    const value = window.localStorage.getItem(storageKey)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // Storage may be unavailable, including during server rendering.
  }
  return 'system'
}

function getSystemPreference(): MediaQueryList | undefined {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : undefined
  } catch {
    return undefined
  }
}

export function ThemeProvider({
  children,
  storageKey,
}: {
  children: ReactNode
  storageKey: string
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStored(storageKey))
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const media = theme === 'system' ? getSystemPreference() : undefined
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!media?.matches)
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', dark)
      setResolved(dark ? 'dark' : 'light')
    }
    apply()
    if (!media || typeof media.addEventListener !== 'function') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback(
    (value: Theme) => {
      setThemeState(value)
      try {
        window.localStorage.setItem(storageKey, value)
      } catch {
        // Keep the in-memory selection when storage is unavailable.
      }
    },
    [storageKey],
  )

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, setTheme, resolved])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTheme() {
  const context = useContext(Context)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
