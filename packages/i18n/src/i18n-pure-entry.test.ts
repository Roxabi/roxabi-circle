import { describe, expect, it, vi } from 'vitest'

describe('@kit/i18n pure entry', () => {
  it('loads and translates without loading React', async () => {
    vi.resetModules()
    vi.doMock('react', () => {
      throw new Error('pure entry loaded React')
    })
    vi.doMock('react/jsx-runtime', () => {
      throw new Error('pure entry loaded React JSX runtime')
    })
    try {
      // Load after installing the mocks to exercise the module-loading boundary.
      const { createI18n } = await import('@kit/i18n')
      const engine = createI18n({ catalogs: { es: { greeting: 'Hola' } }, defaultLocale: 'es' })
      expect(engine.t('es').greeting).toBe('Hola')
    } finally {
      vi.doUnmock('react')
      vi.doUnmock('react/jsx-runtime')
      vi.resetModules()
    }
  })
})
