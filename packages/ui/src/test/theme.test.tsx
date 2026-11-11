import { ThemeProvider, useTheme } from '@kit/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function ThemeConsumer() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <output data-testid="resolved">{resolved}</output>
      <button type="button" onClick={() => setTheme('light')}>
        Light
      </button>
      <button type="button" onClick={() => setTheme('dark')}>
        Dark
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        System
      </button>
    </div>
  )
}

function mockSystem(initialDark = false) {
  let dark = initialDark
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const media = {
    media: '(prefers-color-scheme: dark)',
    get matches() {
      return dark
    },
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  return {
    media,
    listeners,
    change(next: boolean) {
      dark = next
      act(() => {
        for (const listener of listeners) listener({ matches: dark } as MediaQueryListEvent)
      })
    },
  }
}

function mount(storageKey = 'kit.theme') {
  return render(
    <ThemeProvider storageKey={storageKey}>
      <ThemeConsumer />
    </ThemeProvider>,
  )
}

function expectTheme(theme: string, resolved: string) {
  expect(screen.getByTestId('theme')).toHaveTextContent(theme)
  expect(screen.getByTestId('resolved')).toHaveTextContent(resolved)
  expect(document.documentElement.classList.contains('dark')).toBe(resolved === 'dark')
}

describe('ThemeProvider public contract', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('follows system changes and updates the document and resolved theme', () => {
    const system = mockSystem(false)
    mount()
    expectTheme('system', 'light')
    system.change(true)
    expectTheme('system', 'dark')
    system.change(false)
    expectTheme('system', 'light')
  })

  it('gives an explicit preference priority over system changes and resumes following system', () => {
    const system = mockSystem(true)
    mount()
    expectTheme('system', 'dark')
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expectTheme('light', 'light')
    system.change(false)
    system.change(true)
    expectTheme('light', 'light')
    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expectTheme('system', 'dark')
    system.change(false)
    expectTheme('system', 'light')
  })

  it('persists a selection under kit.theme and restores it on remount', () => {
    mockSystem(false)
    const { unmount } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expectTheme('dark', 'dark')
    expect(localStorage.getItem('kit.theme')).toBe('dark')
    unmount()
    mount()
    expectTheme('dark', 'dark')
    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(localStorage.getItem('kit.theme')).toBe('system')
    expectTheme('system', 'light')
  })

  it('isolates a consumer preference using ua.theme from kit.theme', () => {
    mockSystem(false)
    localStorage.setItem('kit.theme', 'light')
    localStorage.setItem('ua.theme', 'light')
    const { unmount } = mount('ua.theme')
    expectTheme('light', 'light')
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(localStorage.getItem('ua.theme')).toBe('dark')
    expect(localStorage.getItem('kit.theme')).toBe('light')
    unmount()
    localStorage.setItem('kit.theme', 'light')
    mount('ua.theme')
    expectTheme('dark', 'dark')
    expect(localStorage.getItem('kit.theme')).toBe('light')
  })

  it('ignores invalid stored values and falls back to system', () => {
    mockSystem(true)
    localStorage.setItem('kit.theme', 'sepia')
    mount()
    expectTheme('system', 'dark')
  })

  it('removes the active system listener when preference changes and on unmount', () => {
    const system = mockSystem()
    const { unmount } = mount()
    expect(system.listeners.size).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(system.listeners.size).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(system.listeners.size).toBe(1)
    unmount()
    expect(system.listeners.size).toBe(0)
    expect(system.media.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('renders on the server without browser globals', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('localStorage', undefined)
    try {
      expect(() =>
        renderToString(
          <ThemeProvider storageKey="kit.theme">
            <ThemeConsumer />
          </ThemeProvider>,
        ),
      ).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('continues to apply and change theme when storage reads and writes throw', () => {
    mockSystem(true)
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mount()
    expectTheme('system', 'dark')
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expectTheme('light', 'light')
  })

  it('falls back safely when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    mount()
    expectTheme('system', 'light')
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expectTheme('dark', 'dark')
  })

  it('rejects useTheme outside its provider', () => {
    expect(() => renderToString(<ThemeConsumer />)).toThrow(
      'useTheme must be used within ThemeProvider',
    )
  })
})
