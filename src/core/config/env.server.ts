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
} as const
