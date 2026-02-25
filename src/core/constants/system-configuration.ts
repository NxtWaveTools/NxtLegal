import { limits } from '@/core/constants/limits'
import { adminGovernance } from '@/core/constants/admin-governance'

export const systemConfigurationDefaults = {
  featureFlags: {
    enableAdminGovernance: true,
    enableContractWorkflow: false,
  },
  securitySessionPolicies: {
    accessTokenDays: limits.sessionDays,
    refreshTokenDays: Math.round(limits.sessionDays * 3.5),
    maxLoginAttempts: limits.maxLoginAttempts,
  },
  defaults: {
    defaultDepartmentRole: adminGovernance.departmentRoleTypes[0],
    defaultUserRole: adminGovernance.userRoleTypes[1],
  },
} as const
