import { EmailPolicyError, type EmailPort } from '@kit/email'
import { describe, expect, it } from 'vitest'
import { createNotificationEmailChannel } from './email-channel'

const input = {
  orgId: 'org',
  to: 'person@example.com',
  content: { subject: 'Subject', text: 'Body' },
}
const interrupted = { status: 'retryable', code: 'delivery_attempt_interrupted' }

function failing(error: unknown): EmailPort {
  return {
    send: async () => {
      throw error
    },
  }
}

function cfError(code: string) {
  return Object.assign(new Error('private provider detail'), { code })
}

describe('notification email channel', () => {
  it('classifies only structured documented CF permanent errors under CF', async () => {
    for (const [code, expected] of [
      ['E_FIELD_MISSING', 'email_payload_invalid'],
      ['E_SENDER_NOT_VERIFIED', 'email_sender_unavailable'],
      ['E_RECIPIENT_SUPPRESSED', 'email_recipient_unavailable'],
    ]) {
      expect(
        await createNotificationEmailChannel(failing(cfError(code)), 'cf').send(input),
      ).toEqual({ status: 'permanent', code: expected })
      expect(
        await createNotificationEmailChannel(failing(cfError(code)), 'resend').send(input),
      ).toEqual(interrupted)
    }
    for (const code of [
      'E_RATE_LIMIT_EXCEEDED',
      'E_DAILY_LIMIT_EXCEEDED',
      'E_INTERNAL_SERVER_ERROR',
      'E_DELIVERY_FAILED',
      'E_ACCOUNT_SUSPENDED',
      'OTHER',
    ]) {
      expect(
        await createNotificationEmailChannel(failing(cfError(code)), 'cf').send(input),
      ).toEqual(interrupted)
    }
    expect(
      await createNotificationEmailChannel(failing(new Error('E_FIELD_MISSING')), 'cf').send(input),
    ).toEqual(interrupted)
  })

  it('classifies local policy errors without exposing their messages', async () => {
    const error = new EmailPolicyError('EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED', 'private address')
    expect(await createNotificationEmailChannel(failing(error), 'log').send(input)).toEqual({
      status: 'permanent',
      code: 'email_recipient_domain_not_allowed',
    })
  })

  it('does not mistake a declined port result for delivery', async () => {
    let calls = 0
    const port: EmailPort = {
      send: async () => {
        calls++
        return { ok: false, transport: 'log' }
      },
    }
    expect(await createNotificationEmailChannel(port, 'log').send(input)).toEqual(interrupted)
    expect(calls).toBe(1)
  })
})
