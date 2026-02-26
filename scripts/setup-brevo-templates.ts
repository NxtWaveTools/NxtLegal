import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

type BrevoTemplateSeed = {
  envKey: string
  templateName: string
  subject: string
  htmlContent: string
}

type BrevoCreateTemplateResponse = {
  id?: number
}

const BREVO_API_BASE_URL = 'https://api.brevo.com/v3'
const BREVO_TEMPLATE_SENDER_NAME = process.env.BREVO_TEMPLATE_SENDER_NAME ?? 'NxtLegal System'
const BREVO_TEMPLATE_SENDER_EMAIL = process.env.BREVO_TEMPLATE_SENDER_EMAIL ?? 'no-reply@nxtwave.co.in'

const templatesToCreate: BrevoTemplateSeed[] = [
  {
    envKey: 'BREVO_TEMPLATE_HOD_APPROVAL_REQUESTED_ID',
    templateName: 'NXT_LEGAL_HOD_APPROVAL_REQUEST',
    subject: 'Action Required: Approve Contract for {{contact.POC_NAME}}',
    htmlContent:
      "<h1>Contract Approval Request</h1><p>A new contract <strong>{{contact.CONTRACT_TITLE}}</strong> requires your approval.</p><a href='{{contact.LINK}}'>Click here to review</a>",
  },
  {
    envKey: 'BREVO_TEMPLATE_APPROVAL_REMINDER_ID',
    templateName: 'NXT_LEGAL_APPROVAL_REMINDER',
    subject: 'Reminder: Pending Approval for {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>Approval Reminder</h1><p>This is a reminder that the contract <strong>{{contact.CONTRACT_TITLE}}</strong> is still pending your approval.</p><a href='{{contact.LINK}}'>Review Now</a>",
  },
  {
    envKey: 'BREVO_TEMPLATE_ADDITIONAL_APPROVER_ADDED_ID',
    templateName: 'NXT_LEGAL_NEW_APPROVER_ADDED',
    subject: 'You have been added as an approver for {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>New Approval Assignment</h1><p>You have been added as an approver for <strong>{{contact.CONTRACT_TITLE}}</strong>.</p><a href='{{contact.LINK}}'>View Contract</a>",
  },
]

async function createTemplate(params: { apiKey: string; template: BrevoTemplateSeed }): Promise<number> {
  const response = await fetch(`${BREVO_API_BASE_URL}/smtp/templates`, {
    method: 'POST',
    headers: {
      'api-key': params.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: BREVO_TEMPLATE_SENDER_NAME,
        email: BREVO_TEMPLATE_SENDER_EMAIL,
      },
      templateName: params.template.templateName,
      subject: params.template.subject,
      htmlContent: params.template.htmlContent,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Failed to create template ${params.template.templateName}: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const payload = (await response.json()) as BrevoCreateTemplateResponse
  if (typeof payload.id !== 'number') {
    throw new Error(`Brevo response missing template id for ${params.template.templateName}`)
  }

  return payload.id
}

async function main(): Promise<void> {
  const brevoApiKey = process.env.BREVO_API_KEY

  if (!brevoApiKey) {
    throw new Error('Missing required environment variable: BREVO_API_KEY')
  }

  const createdTemplateIds: Array<{ envKey: string; id: number }> = []

  for (const template of templatesToCreate) {
    const id = await createTemplate({
      apiKey: brevoApiKey,
      template,
    })

    createdTemplateIds.push({ envKey: template.envKey, id })
  }

  console.log('\n# Copy these into .env.local')
  for (const entry of createdTemplateIds) {
    console.log(`${entry.envKey}=${entry.id}`)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`❌ ${message}`)
  process.exit(1)
})
