import { adminGovernance } from '@/core/constants/admin-governance'
import { AuthorizationError, ValidationError } from '@/core/http/errors'
import type { SessionData } from '@/core/infra/session/jwt-session-store'

export type AdminRoleOption = {
  roleKey: string
  displayName: string
}

export type AdminUserOption = {
  id: string
  email: string
  fullName: string | null
  roles: string[]
}

export interface IAdminQueryRepository {
  listRoles(tenantId: string): Promise<AdminRoleOption[]>
  listUsers(tenantId: string): Promise<AdminUserOption[]>
}

const adminRolesSet = new Set<string>(adminGovernance.adminActorRoles)

export class AdminQueryService {
  constructor(private readonly adminQueryRepository: IAdminQueryRepository) {}

  private assertAdminSession(session: SessionData) {
    if (!session.tenantId) {
      throw new ValidationError('Session tenant is required')
    }

    if (!session.employeeId) {
      throw new ValidationError('Session user is required')
    }

    const actorRole = (session.role ?? '').toUpperCase()
    if (!adminRolesSet.has(actorRole)) {
      throw new AuthorizationError('FORBIDDEN_ADMIN_CONSOLE', 'Insufficient permissions to access admin console')
    }
  }

  async listRoles(session: SessionData): Promise<AdminRoleOption[]> {
    this.assertAdminSession(session)
    return this.adminQueryRepository.listRoles(session.tenantId as string)
  }

  async listUsers(session: SessionData): Promise<AdminUserOption[]> {
    this.assertAdminSession(session)
    return this.adminQueryRepository.listUsers(session.tenantId as string)
  }
}
