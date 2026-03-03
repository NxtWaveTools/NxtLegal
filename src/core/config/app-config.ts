import 'server-only'

import { envServer } from '@/core/config/env.server'
import { featureFlags } from '@/core/config/feature-flags'
import { routeRegistry } from '@/core/config/route-registry'
import { parseAllowedDomains } from '@/core/config/allowed-domains'

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

const zohoSignConfig = requireConfigGroup({
  enabled: featureFlags.enableContractWorkflow,
  groupName: 'Zoho Sign',
  values: {
    ZOHO_SIGN_API_BASE_URL: envServer.zohoSignApiBaseUrl,
    ZOHO_SIGN_OAUTH_BASE_URL: envServer.zohoSignOauthBaseUrl,
    ZOHO_SIGN_CLIENT_ID: envServer.zohoSignClientId,
    ZOHO_SIGN_CLIENT_SECRET: envServer.zohoSignClientSecret,
    ZOHO_SIGN_REFRESH_TOKEN: envServer.zohoSignRefreshToken,
    ZOHO_SIGN_WEBHOOK_SECRET: envServer.zohoSignWebhookSecret,
  },
})

const mailConfig = requireConfigGroup({
  enabled: featureFlags.enableContractWorkflow,
  groupName: 'Brevo',
  values: {
    BREVO_API_KEY: envServer.brevoApiKey,
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
  zohoSign: {
    apiBaseUrl: zohoSignConfig.ZOHO_SIGN_API_BASE_URL,
    oauthBaseUrl: zohoSignConfig.ZOHO_SIGN_OAUTH_BASE_URL,
    clientId: zohoSignConfig.ZOHO_SIGN_CLIENT_ID,
    clientSecret: zohoSignConfig.ZOHO_SIGN_CLIENT_SECRET,
    refreshToken: zohoSignConfig.ZOHO_SIGN_REFRESH_TOKEN,
    webhookSecret: zohoSignConfig.ZOHO_SIGN_WEBHOOK_SECRET,
  },
  mail: {
    brevoApiBaseUrl: envServer.brevoApiBaseUrl ?? 'https://api.brevo.com/v3',
    brevoApiKey: mailConfig.BREVO_API_KEY,
    fromName: mailConfig.MAIL_FROM_NAME,
    fromEmail: mailConfig.MAIL_FROM_EMAIL,
  },
} as const
