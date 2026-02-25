import { AuthorizationError, ValidationError } from '@/core/http/errors'
import { adminGovernance } from '@/core/constants/admin-governance'
import type { SessionData } from '@/core/infra/session/jwt-session-store'

export type AuditViewerLogItem = {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type AuditViewerFilters = {
  action?: string
  resourceType?: string
  userId?: string
  query?: string
  from?: string
  to?: string
}

export type AuditViewerListResult = {
  items: AuditViewerLogItem[]
  cursor: string | null
  limit: number
  total: number
}

export interface IAuditViewerRepository {
  list(params: {
    tenantId: string
    filters: AuditViewerFilters
    cursor?: string
    limit: number
  }): Promise<AuditViewerListResult>
}

const adminRolesSet = new Set<string>(adminGovernance.adminActorRoles)

export class AuditViewerService {
  constructor(private readonly repository: IAuditViewerRepository) {}

  private assertAdminSession(session: SessionData): { tenantId: string } {
    if (!session.tenantId) {
      throw new ValidationError('Session tenant is required')
    }

    const actorRole = (session.role ?? '').toUpperCase()
    if (!adminRolesSet.has(actorRole)) {
      throw new AuthorizationError('FORBIDDEN_ADMIN_CONSOLE', 'Insufficient permissions to access audit logs')
    }

    return { tenantId: session.tenantId }
  }

  async listLogs(params: {
    session: SessionData
    filters: AuditViewerFilters
    cursor?: string
    limit: number
  }): Promise<AuditViewerListResult> {
    const { tenantId } = this.assertAdminSession(params.session)

    return this.repository.list({
      tenantId,
      filters: params.filters,
      cursor: params.cursor,
      limit: params.limit,
    })
  }
}
