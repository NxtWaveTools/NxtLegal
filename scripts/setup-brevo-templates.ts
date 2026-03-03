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

const BREVO_API_BASE_URL = 'https://api.brevo.com/v3'
const BREVO_TEMPLATE_SENDER_NAME = process.env.BREVO_TEMPLATE_SENDER_NAME ?? 'NxtLegal System'
const BREVO_TEMPLATE_SENDER_EMAIL = process.env.BREVO_TEMPLATE_SENDER_EMAIL ?? 'no-reply@nxtwave.co.in'

const templatesToCreate: BrevoTemplateSeed[] = [
  {
    envKey: 'BREVO_TEMPLATE_HOD_APPROVAL_REQUESTED_ID',
    templateName: 'NXT_LEGAL_HOD_APPROVAL_REQUEST',
    subject: 'Action Required: Approve Contract for {{contact.POC_NAME}}',
    templateData: {
      title: 'Contract Approval Request',
      greeting: 'Hello {{contact.APPROVER_ROLE}},',
      messageText: 'A new contract, {{contact.CONTRACT_TITLE}}, requires your approval.',
      buttonText: 'Review Contract',
      buttonLink: '{{contact.LINK}}',
      footerText: 'Please review and take action as soon as possible.',
    },
  },
  {
    envKey: 'BREVO_TEMPLATE_APPROVAL_REMINDER_ID',
    templateName: 'NXT_LEGAL_APPROVAL_REMINDER',
    subject: 'Reminder: Pending Approval for {{contact.CONTRACT_TITLE}}',
    templateData: {
      title: 'Approval Reminder',
      greeting: 'Hello {{contact.APPROVER_ROLE}},',
      messageText: 'This is a reminder that {{contact.CONTRACT_TITLE}} is still pending your approval.',
      buttonText: 'Review Now',
      buttonLink: '{{contact.LINK}}',
      footerText: 'Thank you for helping keep the contract workflow on track.',
    },
  },
  {
    envKey: 'BREVO_TEMPLATE_ADDITIONAL_APPROVER_ADDED_ID',
    templateName: 'NXT_LEGAL_NEW_APPROVER_ADDED',
    subject: 'You have been added as an approver for {{contact.CONTRACT_TITLE}}',
    templateData: {
      title: 'New Approval Assignment',
      greeting: 'Hello {{contact.APPROVER_ROLE}},',
      messageText: 'You have been added as an approver for {{contact.CONTRACT_TITLE}}.',
      buttonText: 'View Contract',
      buttonLink: '{{contact.LINK}}',
      footerText: 'If this assignment looks incorrect, please contact your legal operations team.',
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
