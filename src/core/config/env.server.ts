import 'server-only'

const requireEnv = (key: string): string => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

const optionalEnv = (key: string): string | undefined => {
  const value = process.env[key]
  return value && value.length > 0 ? value : undefined
}

export const envServer = {
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  jwtSecretKey: requireEnv('JWT_SECRET_KEY'),
  allowedDomains: requireEnv('AUTH_ALLOWED_DOMAINS'),
  siteUrl: requireEnv('NEXT_PUBLIC_SITE_URL'),
  featureMicrosoftOAuth: optionalEnv('FEATURE_MICROSOFT_OAUTH') ?? 'true',
  featurePasswordLogin: optionalEnv('FEATURE_PASSWORD_LOGIN') ?? 'true',
  featureContractWorkflow: optionalEnv('FEATURE_CONTRACT_WORKFLOW') ?? 'false',
  featureAdminGovernance: optionalEnv('FEATURE_ADMIN_GOVERNANCE') ?? 'true',
  nodeEnv: optionalEnv('NODE_ENV') ?? 'development',
  zohoSignApiBaseUrl: optionalEnv('ZOHO_SIGN_API_BASE_URL'),
  zohoSignAccessToken: optionalEnv('ZOHO_SIGN_ACCESS_TOKEN'),
  zohoSignWebhookSecret: optionalEnv('ZOHO_SIGN_WEBHOOK_SECRET'),
  brevoApiBaseUrl: optionalEnv('BREVO_API_BASE_URL'),
  brevoApiKey: optionalEnv('BREVO_API_KEY'),
  brevoSignatoryLinkTemplateId: optionalEnv('BREVO_TEMPLATE_SIGNATORY_LINK_ID'),
  brevoSigningCompletedTemplateId: optionalEnv('BREVO_TEMPLATE_SIGNING_COMPLETED_ID'),
  brevoHodApprovalRequestedTemplateId: optionalEnv('BREVO_TEMPLATE_HOD_APPROVAL_REQUESTED_ID'),
  brevoApprovalReminderTemplateId: optionalEnv('BREVO_TEMPLATE_APPROVAL_REMINDER_ID'),
  brevoAdditionalApproverAddedTemplateId: optionalEnv('BREVO_TEMPLATE_ADDITIONAL_APPROVER_ADDED_ID'),
  brevoLegalInternalAssignmentTemplateId: optionalEnv('BREVO_TEMPLATE_LEGAL_INTERNAL_ASSIGNMENT_ID'),
  brevoLegalApprovalReceivedHodTemplateId: optionalEnv('BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_HOD_ID'),
  brevoLegalApprovalReceivedAdditionalTemplateId: optionalEnv('BREVO_TEMPLATE_LEGAL_APPROVAL_RECEIVED_ADDITIONAL_ID'),
  brevoLegalReturnedToHodTemplateId: optionalEnv('BREVO_TEMPLATE_LEGAL_RETURNED_TO_HOD_ID'),
  brevoLegalContractRejectedTemplateId: optionalEnv('BREVO_TEMPLATE_LEGAL_CONTRACT_REJECTED_ID'),
  mailFromName: optionalEnv('MAIL_FROM_NAME'),
  mailFromEmail: optionalEnv('MAIL_FROM_EMAIL'),
} as const
