import { describe, expect, it } from 'vitest'
import { isLocalBannerEnvironment, isPublicSignupEnabled, shouldShowEnvBanner } from './health'

describe('isPublicSignupEnabled', () => {
  it('is fail-closed unless health.allowPublicSignup === true', () => {
    expect(isPublicSignupEnabled(undefined)).toBe(false)
    expect(isPublicSignupEnabled({})).toBe(false)
    expect(isPublicSignupEnabled({ allowPublicSignup: false })).toBe(false)
    expect(isPublicSignupEnabled({ allowPublicSignup: true })).toBe(true)
  })
})

describe('env banner helpers', () => {
  it('shows banner for local and staging only', () => {
    expect(shouldShowEnvBanner('development')).toBe(true)
    expect(shouldShowEnvBanner('test')).toBe(true)
    expect(shouldShowEnvBanner('staging')).toBe(true)
    expect(shouldShowEnvBanner('production')).toBe(false)
    expect(shouldShowEnvBanner('unknown')).toBe(false)
    expect(shouldShowEnvBanner(undefined)).toBe(false)
  })

  it('treats development and test as local banner', () => {
    expect(isLocalBannerEnvironment('development')).toBe(true)
    expect(isLocalBannerEnvironment('test')).toBe(true)
    expect(isLocalBannerEnvironment('staging')).toBe(false)
  })
})
