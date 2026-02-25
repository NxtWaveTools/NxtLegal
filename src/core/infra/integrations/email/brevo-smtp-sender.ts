import 'server-only'

type BrevoTemplateSenderConfig = {
  apiBaseUrl: string
  apiKey: string
  fromName: string
  fromEmail: string
}

type SendTemplateEmailInput = {
  recipientEmail: string
  templateId: number
  templateParams: Record<string, unknown>
}

export class BrevoSmtpSender {
  constructor(private readonly config: BrevoTemplateSenderConfig) {}

  async sendTemplateEmail(input: SendTemplateEmailInput): Promise<{ providerMessageId?: string }> {
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
        templateId: input.templateId,
        params: input.templateParams,
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
