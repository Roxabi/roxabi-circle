export type EmailTransport = 'log' | 'smtp' | 'cf' | 'resend'

export type EmailPort = {
  send(input: {
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ ok: boolean; transport: string }>
}
