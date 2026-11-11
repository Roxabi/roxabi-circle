import { EmailPolicyError, type EmailPort } from '@kit/email'
import type { Channel, ChannelResult, EmailContent } from '@kit/notifications'

export type NotificationEmailInput = Readonly<{ orgId: string; to: string; content: EmailContent }>

const permanentCodes: Record<string, string> = {
  E_VALIDATION_ERROR: 'email_payload_invalid',
  E_FIELD_MISSING: 'email_payload_invalid',
  E_TOO_MANY_RECIPIENTS: 'email_payload_invalid',
  E_TOO_MANY_ATTACHMENTS: 'email_payload_invalid',
  E_CONTENT_TOO_LARGE: 'email_payload_invalid',
  E_HEADER_NOT_ALLOWED: 'email_payload_invalid',
  E_HEADER_USE_API_FIELD: 'email_payload_invalid',
  E_HEADER_VALUE_INVALID: 'email_payload_invalid',
  E_HEADER_VALUE_TOO_LONG: 'email_payload_invalid',
  E_HEADER_NAME_INVALID: 'email_payload_invalid',
  E_HEADERS_TOO_LARGE: 'email_payload_invalid',
  E_HEADERS_TOO_MANY: 'email_payload_invalid',
  E_SENDER_NOT_VERIFIED: 'email_sender_unavailable',
  E_SENDER_DOMAIN_NOT_AVAILABLE: 'email_sender_unavailable',
  E_RECIPIENT_NOT_ALLOWED: 'email_recipient_unavailable',
  E_RECIPIENT_SUPPRESSED: 'email_recipient_unavailable',
}
const interrupted: ChannelResult = { status: 'retryable', code: 'delivery_attempt_interrupted' }

function classifyError(error: unknown, configuredTransport: string | undefined): ChannelResult {
  if (error instanceof EmailPolicyError) {
    return {
      status: 'permanent',
      code:
        error.code === 'EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED'
          ? 'email_recipient_domain_not_allowed'
          : 'email_address_invalid',
    }
  }
  if (!(configuredTransport === 'cf' && error instanceof Error && 'code' in error))
    return interrupted
  const code = error.code
  if (!(typeof code === 'string' && Object.hasOwn(permanentCodes, code))) return interrupted
  const permanent = permanentCodes[code]
  return permanent ? { status: 'permanent', code: permanent } : interrupted
}

export function createNotificationEmailChannel(
  port: EmailPort,
  configuredTransport: string | undefined,
): Channel<NotificationEmailInput> {
  return {
    async send({ to, content }) {
      try {
        const result = await port.send({ to, ...content })
        return result.ok ? { status: 'sent' } : interrupted
      } catch (error) {
        return classifyError(error, configuredTransport)
      }
    },
  }
}
