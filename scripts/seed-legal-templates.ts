import { config } from 'dotenv'
import { resolve } from 'path'
import { buildMasterTemplate, type MasterTemplateData } from '../src/lib/email/master-template'

config({ path: resolve(process.cwd(), '.env.local') })

type BrevoTemplateSeed = {
  envKey: string
  templateName: string
  subject: string
  templateData: MasterTemplateData
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
    templateData: {
      title: 'Contract Assignment',
      greeting: 'Hello Legal Team,',
      messageText: 'You were assigned legal work for {{contact.CONTRACT_TITLE}}.',
      buttonText: 'Open Contract',
      buttonLink: '{{contact.LINK}}',
      footerText: 'Please review the assignment and proceed with the next required action.',
    },
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_HOD_ID',
    templateName: 'NXT_LEGAL_APPROVAL_RECEIVED_HOD',
    subject: 'HOD Approved: {{contact.CONTRACT_TITLE}}',
    templateData: {
      title: 'HOD Approval Received',
      greeting: 'Hello Legal Team,',
      messageText: 'The HOD has completed approval for {{contact.CONTRACT_TITLE}}.',
      buttonText: 'Review Contract',
      buttonLink: '{{contact.LINK}}',
      footerText: 'No further HOD action is required for this step.',
    },
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_ADDITIONAL_ID',
    templateName: 'NXT_LEGAL_APPROVAL_RECEIVED_ADDITIONAL',
    subject: 'Additional Approval Received: {{contact.CONTRACT_TITLE}}',
    templateData: {
      title: 'Additional Approval Received',
      greeting: 'Hello Legal Team,',
      messageText: 'An additional approver has completed approval for {{contact.CONTRACT_TITLE}}.',
      buttonText: 'Review Contract',
      buttonLink: '{{contact.LINK}}',
      footerText: 'Continue the workflow based on current contract status.',
    },
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_RETURNED_TO_HOD_ID',
    templateName: 'NXT_LEGAL_RETURNED_TO_HOD',
    subject: 'Returned to HOD: {{contact.CONTRACT_TITLE}}',
    templateData: {
      title: 'Contract Returned to HOD',
      greeting: 'Hello HOD,',
      messageText: '{{contact.CONTRACT_TITLE}} has been rerouted to you for HOD review.',
      buttonText: 'Open Contract',
      buttonLink: '{{contact.LINK}}',
      footerText: 'Please review the contract and submit your decision.',
    },
  },
  {
    envKey: 'BREVO_TEMPLATE_LEGAL_CONTRACT_REJECTED_ID',
    templateName: 'NXT_LEGAL_CONTRACT_REJECTED',
    subject: 'Contract Rejected: {{contact.CONTRACT_TITLE}}',
    templateData: {
      title: 'Contract Rejected',
      greeting: 'Hello,',
      messageText: '{{contact.CONTRACT_TITLE}} has been rejected in the approval workflow.',
      buttonText: 'View Details',
      buttonLink: '{{contact.LINK}}',
      footerText: 'Open the contract for rejection context and next-step guidance.',
    },
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
      htmlContent: buildMasterTemplate(params.template.templateData),
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
