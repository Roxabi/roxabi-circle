import { describe, expect, it } from 'vitest'
import { isFeedbackEnabled } from './env'

describe('isFeedbackEnabled', () => {
  it('is off by default', () => {
    expect(isFeedbackEnabled({})).toBe(false)
    expect(isFeedbackEnabled({ FEEDBACK_ENABLED: '' })).toBe(false)
    expect(isFeedbackEnabled({ FEEDBACK_ENABLED: 'false' })).toBe(false)
  })

  it('accepts truthy strings', () => {
    expect(isFeedbackEnabled({ FEEDBACK_ENABLED: 'true' })).toBe(true)
    expect(isFeedbackEnabled({ FEEDBACK_ENABLED: '1' })).toBe(true)
    expect(isFeedbackEnabled({ FEEDBACK_ENABLED: 'yes' })).toBe(true)
  })
})
