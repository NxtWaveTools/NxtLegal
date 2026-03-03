import 'server-only'

type BrevoSenderConfig = {
  apiBaseUrl: string
  apiKey: string
  fromName: string
  fromEmail: string
}

type SendEmailInput = {
  recipientEmail: string
  subject: string
  htmlContent: string
  tags?: string[]
}

export class BrevoSmtpSender {
  constructor(private readonly config: BrevoSenderConfig) {}

  async sendTemplateEmail(input: SendEmailInput): Promise<{ providerMessageId?: string }> {
    const response = await fetch(`${this.config.apiBaseUrl}/smtp/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        sender: {
          name: this.config.fromName,
          email: this.config.fromEmail,
        },
        to: [{ email: input.recipientEmail }],
        subject: input.subject,
        htmlContent: input.htmlContent,
        tags: input.tags,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Brevo request failed with status ${response.status}: ${errorText}`)
    }

    const payload = (await response.json().catch(() => ({}))) as { messageId?: string }
    return {
      providerMessageId: payload.messageId,
    }
  }
}
