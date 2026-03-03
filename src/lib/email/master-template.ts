export type MasterTemplateData = {
  title: string
  greeting: string
  messageText: string
  buttonText?: string
  buttonLink?: string
  footerText: string
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const preserveBrevoPlaceholders = (value: string): string => {
  const escaped = escapeHtml(value)
  return escaped.replace(/&#123;&#123;\s*([^{}]+?)\s*&#125;&#125;/g, (_match, token) => `{{${token.trim()}}}`)
}

export function buildMasterTemplate(data: MasterTemplateData): string {
  const title = preserveBrevoPlaceholders(data.title)
  const greeting = preserveBrevoPlaceholders(data.greeting)
  const messageText = preserveBrevoPlaceholders(data.messageText)
  const footerText = preserveBrevoPlaceholders(data.footerText)

  const shouldRenderButton = Boolean(data.buttonText?.trim() && data.buttonLink?.trim())
  const buttonText = shouldRenderButton ? preserveBrevoPlaceholders(data.buttonText!.trim()) : ''
  const buttonLink = shouldRenderButton ? preserveBrevoPlaceholders(data.buttonLink!.trim()) : ''

  const ctaBlock = shouldRenderButton
    ? `
                <tr>
                  <td style="padding: 8px 0 0;">
                    <a href="${buttonLink}" style="display: inline-block; padding: 12px 20px; background-color: #1e40af; border-radius: 6px; color: #ffffff; font-size: 14px; line-height: 20px; font-weight: 600; text-decoration: none;">${buttonText}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0 0;">
                    <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 18px;">If the button does not work, copy and paste this URL into your browser:</p>
                    <p style="margin: 8px 0 0; word-break: break-all; color: #1e40af; font-size: 12px; line-height: 18px;">${buttonLink}</p>
                  </td>
                </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; width: 100%;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 640px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
            <tr>
              <td style="padding: 18px 24px; background-color: #0f172a;">
                <p style="margin: 0; color: #ffffff; font-size: 15px; line-height: 22px; font-weight: 700; letter-spacing: 0.2px;">NXT Legal</p>
                <p style="margin: 4px 0 0; color: #cbd5e1; font-size: 12px; line-height: 18px;">Contract lifecycle notifications</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding: 0;">
                      <h1 style="margin: 0; color: #0f172a; font-size: 22px; line-height: 30px; font-weight: 700;">${title}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 0 0;">
                      <p style="margin: 0; color: #334155; font-size: 14px; line-height: 22px;">${greeting}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0 0;">
                      <p style="margin: 0; color: #334155; font-size: 14px; line-height: 24px;">${messageText}</p>
                    </td>
                  </tr>${ctaBlock}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 14px 24px 20px; border-top: 1px solid #e2e8f0; background-color: #f8fafc;">
                <p style="margin: 0; color: #475569; font-size: 12px; line-height: 18px;">${footerText}</p>
                <p style="margin: 8px 0 0; color: #94a3b8; font-size: 11px; line-height: 16px;">This is an automated message from NXT Legal. Please do not share this email outside your organization.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
