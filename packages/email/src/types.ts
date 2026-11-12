export type EmailTransport = 'log' | 'smtp' | 'cf' | 'resend'

export class EmailPolicyError extends Error {
  constructor(
    readonly code:
      | 'EMAIL_ADDRESS_INVALID'
      | 'EMAIL_RECIPIENT_ADDRESS_INVALID'
      | 'EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED',
    message: string,
  ) {
    super(message)
    this.name = 'EmailPolicyError'
  }
}

export type EmailPort = {
  send(input: {
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ ok: boolean; transport: string }>
}
