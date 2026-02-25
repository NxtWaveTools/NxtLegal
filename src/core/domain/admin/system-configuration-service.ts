import { AuthorizationError, ValidationError } from '@/core/http/errors'
import type { SessionData } from '@/core/infra/session/jwt-session-store'
import { adminGovernance } from '@/core/constants/admin-governance'
import { systemConfigurationDefaults } from '@/core/constants/system-configuration'

export type SystemConfiguration = {
  featureFlags: {
    enableAdminGovernance: boolean
    enableContractWorkflow: boolean
  }
  securitySessionPolicies: {
    accessTokenDays: number
    refreshTokenDays: number
    maxLoginAttempts: number
  }
  defaults: {
    defaultDepartmentRole: 'POC' | 'HOD'
    defaultUserRole: 'USER' | 'LEGAL_TEAM'
  }
  updatedAt: string | null
  updatedByUserId: string | null
}

export interface ISystemConfigurationRepository {
  getLatestByTenant(tenantId: string): Promise<SystemConfiguration | null>
  saveByTenant(params: {
    tenantId: string
    adminUserId: string
    config: Omit<SystemConfiguration, 'updatedAt' | 'updatedByUserId'>
    reason?: string
  }): Promise<SystemConfiguration>
}

const adminRolesSet = new Set<string>(adminGovernance.adminActorRoles)

export class SystemConfigurationService {
  constructor(private readonly repository: ISystemConfigurationRepository) {}

  private assertAdminSession(session: SessionData): { tenantId: string; userId: string } {
    if (!session.tenantId) {
      throw new ValidationError('Session tenant is required')
    }

    if (!session.employeeId) {
      throw new ValidationError('Session user is required')
    }

    const actorRole = (session.role ?? '').toUpperCase()
    if (!adminRolesSet.has(actorRole)) {
      throw new AuthorizationError('FORBIDDEN_ADMIN_CONSOLE', 'Insufficient permissions to manage system configuration')
    }

    return { tenantId: session.tenantId, userId: session.employeeId }
  }

  async getConfiguration(session: SessionData): Promise<SystemConfiguration> {
    const { tenantId } = this.assertAdminSession(session)
    const persisted = await this.repository.getLatestByTenant(tenantId)

    if (!persisted) {
      return {
        ...systemConfigurationDefaults,
        updatedAt: null,
        updatedByUserId: null,
      }
    }

    return persisted
  }

  async updateConfiguration(params: {
    session: SessionData
    config: Omit<SystemConfiguration, 'updatedAt' | 'updatedByUserId'>
    reason?: string
  }): Promise<SystemConfiguration> {
    const { tenantId, userId } = this.assertAdminSession(params.session)

    return this.repository.saveByTenant({
      tenantId,
      adminUserId: userId,
      config: params.config,
      reason: params.reason,
    })
  }
}
