import 'server-only'

import { envServer } from './env.server'

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback
  }
  return value.toLowerCase() === 'true'
}

export const featureFlags = {
  enablePasswordLogin: parseBoolean(envServer.featurePasswordLogin, true),
  enableMicrosoftOAuth: parseBoolean(envServer.featureMicrosoftOAuth, true),
  enableContractWorkflow: parseBoolean(envServer.featureContractWorkflow, false),
  enableAdminGovernance: parseBoolean(envServer.featureAdminGovernance, true),
} as const
