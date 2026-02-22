import { adminGovernance } from '@/core/constants/admin-governance'
import { AuthorizationError, ValidationError } from '@/core/http/errors'
import type { SessionData } from '@/core/infra/session/jwt-session-store'

export type ChangeUserRoleParams = {
  tenantId: string
  adminUserId: string
  targetUserId: string
  roleKey: string
  operation: 'grant' | 'revoke'
  reason?: string
}

export type ChangeUserRoleResult = {
  changed: boolean
  operation: 'grant' | 'revoke'
  roleKey: string
  targetUserId: string
  targetEmail: string
  beforeStateSnapshot: Record<string, unknown>
  afterStateSnapshot: Record<string, unknown>
  oldTokenVersion: number
  newTokenVersion: number
}

export interface IRoleGovernanceRepository {
  changeUserRole(params: ChangeUserRoleParams): Promise<ChangeUserRoleResult>
}

const adminRolesSet = new Set<string>(adminGovernance.adminActorRoles)

export class RoleGovernanceService {
  constructor(private readonly roleGovernanceRepository: IRoleGovernanceRepository) {}

  async changeUserRole(params: {
    session: SessionData
    targetUserId: string
    roleKey: string
    operation: 'grant' | 'revoke'
    reason?: string
  }): Promise<ChangeUserRoleResult> {
    if (!params.session.tenantId) {
      throw new ValidationError('Session tenant is required')
    }

    if (!params.session.employeeId) {
      throw new ValidationError('Session user is required')
    }

    const actorRole = (params.session.role ?? '').toUpperCase()
    if (!adminRolesSet.has(actorRole)) {
      throw new AuthorizationError('FORBIDDEN_ROLE_MANAGEMENT', 'Insufficient permissions to manage roles')
    }

    if (params.targetUserId === params.session.employeeId && params.operation === 'revoke') {
      throw new ValidationError('Self role revocation is not allowed from this endpoint')
    }

    return this.roleGovernanceRepository.changeUserRole({
      tenantId: params.session.tenantId,
      adminUserId: params.session.employeeId,
      targetUserId: params.targetUserId,
      roleKey: params.roleKey,
      operation: params.operation,
      reason: params.reason,
    })
  }
}
