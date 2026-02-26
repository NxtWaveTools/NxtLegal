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

const BREVO_API_BASE_URL = process.env.BREVO_API_BASE_URL ?? 'https://api.brevo.com/v3'
const BREVO_TEMPLATE_SENDER_NAME = process.env.BREVO_TEMPLATE_SENDER_NAME ?? 'NxtLegal System'
const BREVO_TEMPLATE_SENDER_EMAIL = process.env.BREVO_TEMPLATE_SENDER_EMAIL ?? 'no-reply@nxtwave.co.in'

const templatesToCreate: BrevoTemplateSeed[] = [
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_INTERNAL_ASSIGNMENT_ID',
    templateName: 'NXT_LEGAL_INTERNAL_ASSIGNMENT',
    subject: 'Legal Assignment: {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>Contract Assignment</h1><p>You were assigned legal work for <strong>{{contact.CONTRACT_TITLE}}</strong>.</p><a href='{{contact.LINK}}'>Open Contract</a>",
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_HOD_ID',
    templateName: 'NXT_LEGAL_APPROVAL_RECEIVED_HOD',
    subject: 'HOD Approved: {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>HOD Approval Received</h1><p>The HOD completed approval for <strong>{{contact.CONTRACT_TITLE}}</strong>.</p><a href='{{contact.LINK}}'>Review Contract</a>",
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_ADDITIONAL_ID',
    templateName: 'NXT_LEGAL_APPROVAL_RECEIVED_ADDITIONAL',
    subject: 'Additional Approval Received: {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>Additional Approval Received</h1><p>An additional approver completed their approval for <strong>{{contact.CONTRACT_TITLE}}</strong>.</p><a href='{{contact.LINK}}'>Review Contract</a>",
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_RETURNED_TO_HOD_ID',
    templateName: 'NXT_LEGAL_RETURNED_TO_HOD',
    subject: 'Returned to HOD: {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>Contract Returned to HOD</h1><p>The contract <strong>{{contact.CONTRACT_TITLE}}</strong> has been rerouted to you for HOD review.</p><a href='{{contact.LINK}}'>Open Contract</a>",
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_CONTRACT_REJECTED_ID',
    templateName: 'NXT_LEGAL_CONTRACT_REJECTED',
    subject: 'Contract Rejected: {{contact.CONTRACT_TITLE}}',
    htmlContent:
      "<h1>Contract Rejected</h1><p>The contract <strong>{{contact.CONTRACT_TITLE}}</strong> has been rejected.</p><a href='{{contact.LINK}}'>View Details</a>",
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
