import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SafeMarkdown } from './safe-markdown'

afterEach(() => {
  cleanup()
})

describe('SafeMarkdown', () => {
  it('does not render remote images', () => {
    const { container } = render(<SafeMarkdown>{'![x](https://evil.test/x.png)'}</SafeMarkdown>)
    expect(container.querySelector('img')).toBeNull()
  })
  it('does not enable raw HTML', () => {
    const { container } = render(<SafeMarkdown>{'<script>alert(1)</script>'}</SafeMarkdown>)
    expect(container.querySelector('script')).toBeNull()
  })

  it('locks outbound links', () => {
    const { container } = render(<SafeMarkdown>{'[x](https://example.com)'}</SafeMarkdown>)
    const a = container.querySelector('a')
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a?.getAttribute('target')).toBe('_blank')
  })
})
