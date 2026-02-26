import 'server-only'

import { envServer } from '@/core/config/env.server'
import { featureFlags } from '@/core/config/feature-flags'
import { routeRegistry } from '@/core/config/route-registry'

const parseAllowedDomains = (value: string): string[] => {
  return value
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0)
}

const parseInteger = (value: string | undefined, key: string): number | undefined => {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`)
  }

  return parsed
}

const requireConfigGroup = (params: {
  enabled: boolean
  groupName: string
  values: Record<string, string | undefined>
}): Record<string, string | undefined> => {
  if (!params.enabled) {
    return params.values
  }

  const missingKeys = Object.entries(params.values)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missingKeys.length > 0) {
    throw new Error(`Missing required ${params.groupName} environment variables: ${missingKeys.join(', ')}`)
  }

  return params.values
}

const docusignConfig = requireConfigGroup({
  enabled: featureFlags.enableContractWorkflow,
  groupName: 'DocuSign',
  values: {
    DOCUSIGN_AUTH_BASE_URL: envServer.docusignAuthBaseUrl,
    DOCUSIGN_API_BASE_URL: envServer.docusignApiBaseUrl,
    DOCUSIGN_ACCOUNT_ID: envServer.docusignAccountId,
    DOCUSIGN_USER_ID: envServer.docusignUserId,
    DOCUSIGN_INTEGRATION_KEY: envServer.docusignIntegrationKey,
    DOCUSIGN_RSA_PRIVATE_KEY: envServer.docusignRsaPrivateKey,
    DOCUSIGN_WEBHOOK_SECRET: envServer.docusignWebhookSecret,
  },
})

const mailConfig = requireConfigGroup({
  enabled: featureFlags.enableContractWorkflow,
  groupName: 'Brevo',
  values: {
    BREVO_API_KEY: envServer.brevoApiKey,
    BREVO_TEMPLATE_SIGNATORY_LINK_ID: envServer.brevoSignatoryLinkTemplateId,
    BREVO_TEMPLATE_SIGNING_COMPLETED_ID: envServer.brevoSigningCompletedTemplateId,
    BREVO_TEMPLATE_HOD_APPROVAL_REQUESTED_ID: envServer.brevoHodApprovalRequestedTemplateId,
    BREVO_TEMPLATE_APPROVAL_REMINDER_ID: envServer.brevoApprovalReminderTemplateId,
    BREVO_TEMPLATE_ADDITIONAL_APPROVER_ADDED_ID: envServer.brevoAdditionalApproverAddedTemplateId,
    BREVO_TEMPLATE_LEGAL_INTERNAL_ASSIGNMENT_ID: envServer.brevoLegalInternalAssignmentTemplateId,
    BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_HOD_ID: envServer.brevoLegalApprovalReceivedHodTemplateId,
    BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_ADDITIONAL_ID: envServer.brevoLegalApprovalReceivedAdditionalTemplateId,
    BREVO_TEMPLATE_LEGAL_RETURNED_TO_HOD_ID: envServer.brevoLegalReturnedToHodTemplateId,
    BREVO_TEMPLATE_LEGAL_CONTRACT_REJECTED_ID: envServer.brevoLegalContractRejectedTemplateId,
    MAIL_FROM_NAME: envServer.mailFromName,
    MAIL_FROM_EMAIL: envServer.mailFromEmail,
  },
})

export const appConfig = {
  environment: envServer.nodeEnv,
  routes: routeRegistry,
  features: featureFlags,
  auth: {
    allowedDomains: parseAllowedDomains(envServer.allowedDomains),
    siteUrl: envServer.siteUrl,
  },
  supabase: {
    url: envServer.supabaseUrl,
    anonKey: envServer.supabaseAnonKey,
    serviceRoleKey: envServer.supabaseServiceRoleKey,
  },
  security: {
    jwtSecretKey: envServer.jwtSecretKey,
  },
  docusign: {
    authBaseUrl: docusignConfig.DOCUSIGN_AUTH_BASE_URL,
    apiBaseUrl: docusignConfig.DOCUSIGN_API_BASE_URL,
    accountId: docusignConfig.DOCUSIGN_ACCOUNT_ID,
    userId: docusignConfig.DOCUSIGN_USER_ID,
    integrationKey: docusignConfig.DOCUSIGN_INTEGRATION_KEY,
    rsaPrivateKey: docusignConfig.DOCUSIGN_RSA_PRIVATE_KEY,
    webhookSecret: docusignConfig.DOCUSIGN_WEBHOOK_SECRET,
  },
  mail: {
    brevoApiBaseUrl: envServer.brevoApiBaseUrl ?? 'https://api.brevo.com/v3',
    brevoApiKey: mailConfig.BREVO_API_KEY,
    brevoTemplateSignatoryLinkId: parseInteger(
      mailConfig.BREVO_TEMPLATE_SIGNATORY_LINK_ID,
      'BREVO_TEMPLATE_SIGNATORY_LINK_ID'
    ),
    brevoTemplateSigningCompletedId: parseInteger(
      mailConfig.BREVO_TEMPLATE_SIGNING_COMPLETED_ID,
      'BREVO_TEMPLATE_SIGNING_COMPLETED_ID'
    ),
    brevoTemplateHodApprovalRequestedId: parseInteger(
      mailConfig.BREVO_TEMPLATE_HOD_APPROVAL_REQUESTED_ID,
      'BREVO_TEMPLATE_HOD_APPROVAL_REQUESTED_ID'
    ),
    brevoTemplateApprovalReminderId: parseInteger(
      mailConfig.BREVO_TEMPLATE_APPROVAL_REMINDER_ID,
      'BREVO_TEMPLATE_APPROVAL_REMINDER_ID'
    ),
    brevoTemplateAdditionalApproverAddedId: parseInteger(
      mailConfig.BREVO_TEMPLATE_ADDITIONAL_APPROVER_ADDED_ID,
      'BREVO_TEMPLATE_ADDITIONAL_APPROVER_ADDED_ID'
    ),
    brevoTemplateLegalInternalAssignmentId: parseInteger(
      mailConfig.BREVO_TEMPLATE_LEGAL_INTERNAL_ASSIGNMENT_ID,
      'BREVO_TEMPLATE_LEGAL_INTERNAL_ASSIGNMENT_ID'
    ),
    brevoTemplateLegalApprovalReceivedHodId: parseInteger(
      mailConfig.BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_HOD_ID,
      'BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_HOD_ID'
    ),
    brevoTemplateLegalApprovalReceivedAdditionalId: parseInteger(
      mailConfig.BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_ADDITIONAL_ID,
      'BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_ADDITIONAL_ID'
    ),
    brevoTemplateLegalReturnedToHodId: parseInteger(
      mailConfig.BREVO_TEMPLATE_LEGAL_RETURNED_TO_HOD_ID,
      'BREVO_TEMPLATE_LEGAL_RETURNED_TO_HOD_ID'
    ),
    brevoTemplateLegalContractRejectedId: parseInteger(
      mailConfig.BREVO_TEMPLATE_LEGAL_CONTRACT_REJECTED_ID,
      'BREVO_TEMPLATE_LEGAL_CONTRACT_REJECTED_ID'
    ),
    fromName: mailConfig.MAIL_FROM_NAME,
    fromEmail: mailConfig.MAIL_FROM_EMAIL,
  },
} as const
