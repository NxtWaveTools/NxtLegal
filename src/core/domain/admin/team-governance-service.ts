import { adminGovernance } from '@/core/constants/admin-governance'
import { AuthorizationError, ValidationError } from '@/core/http/errors'
import type { SessionData } from '@/core/infra/session/jwt-session-store'

export type LegalAssignment = {
  userId: string
  email: string
  fullName: string | null
}

export type DepartmentSummary = {
  id: string
  name: string
  isActive: boolean
  pocName: string | null
  hodName: string | null
  hodUserId: string | null
  hodEmail: string | null
  pocUserId: string | null
  pocEmail: string | null
  legalAssignments: LegalAssignment[]
}

export type TeamMutationResult = {
  teamId: string
  departmentName: string
  isActive: boolean
  pocName: string | null
  hodName: string | null
  pocEmail: string | null
  hodEmail: string | null
  beforeStateSnapshot: Record<string, unknown>
  afterStateSnapshot: Record<string, unknown>
}

export type PrimaryRoleMutationResult = {
  teamId: string
  roleType: 'POC' | 'HOD'
  previousEmail: string | null
  nextEmail: string
  beforeStateSnapshot: Record<string, unknown>
  afterStateSnapshot: Record<string, unknown>
}

export type LegalMatrixMutationResult = {
  teamId: string
  activeLegalUserIds: string[]
  beforeStateSnapshot: Record<string, unknown>
  afterStateSnapshot: Record<string, unknown>
}

export interface ITeamGovernanceRepository {
  listDepartments(tenantId: string): Promise<DepartmentSummary[]>
  createDepartment(params: {
    tenantId: string
    adminUserId: string
    name: string
    pocEmail: string
    pocName: string
    hodEmail: string
    hodName: string
    reason?: string
  }): Promise<TeamMutationResult>
  updateDepartment(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    operation: 'rename' | 'deactivate'
    name?: string
    reason?: string
  }): Promise<TeamMutationResult>
  assignPrimaryRole(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    newEmail: string
    newName: string
    roleType: 'POC' | 'HOD'
    reason?: string
  }): Promise<PrimaryRoleMutationResult>
  setLegalMatrix(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    legalUserIds: string[]
    reason?: string
  }): Promise<LegalMatrixMutationResult>
}

const adminRolesSet = new Set<string>(adminGovernance.adminActorRoles)

export class TeamGovernanceService {
  constructor(private readonly teamGovernanceRepository: ITeamGovernanceRepository) {}

  private assertAdminSession(session: SessionData) {
    if (!session.tenantId) {
      throw new ValidationError('Session tenant is required')
    }

    if (!session.employeeId) {
      throw new ValidationError('Session user is required')
    }

    const actorRole = (session.role ?? '').toUpperCase()
    if (!adminRolesSet.has(actorRole)) {
      throw new AuthorizationError('FORBIDDEN_TEAM_GOVERNANCE', 'Insufficient permissions to manage departments')
    }
  }

  async listDepartments(session: SessionData): Promise<DepartmentSummary[]> {
    this.assertAdminSession(session)
    return this.teamGovernanceRepository.listDepartments(session.tenantId as string)
  }

  async createDepartment(params: {
    session: SessionData
    name: string
    pocEmail: string
    pocName: string
    hodEmail: string
    hodName: string
    reason?: string
  }): Promise<TeamMutationResult> {
    this.assertAdminSession(params.session)

    return this.teamGovernanceRepository.createDepartment({
      tenantId: params.session.tenantId as string,
      adminUserId: params.session.employeeId as string,
      name: params.name,
      pocEmail: params.pocEmail,
      pocName: params.pocName,
      hodEmail: params.hodEmail,
      hodName: params.hodName,
      reason: params.reason,
    })
  }

  async updateDepartment(params: {
    session: SessionData
    teamId: string
    operation: 'rename' | 'deactivate'
    name?: string
    reason?: string
  }): Promise<TeamMutationResult> {
    this.assertAdminSession(params.session)

    return this.teamGovernanceRepository.updateDepartment({
      tenantId: params.session.tenantId as string,
      adminUserId: params.session.employeeId as string,
      teamId: params.teamId,
      operation: params.operation,
      name: params.name,
      reason: params.reason,
    })
  }

  async assignPrimaryRole(params: {
    session: SessionData
    teamId: string
    newEmail: string
    newName: string
    roleType: 'POC' | 'HOD'
    reason?: string
  }): Promise<PrimaryRoleMutationResult> {
    this.assertAdminSession(params.session)

    return this.teamGovernanceRepository.assignPrimaryRole({
      tenantId: params.session.tenantId as string,
      adminUserId: params.session.employeeId as string,
      teamId: params.teamId,
      newEmail: params.newEmail,
      newName: params.newName,
      roleType: params.roleType,
      reason: params.reason,
    })
  }

  async setLegalMatrix(params: {
    session: SessionData
    teamId: string
    legalUserIds: string[]
    reason?: string
  }): Promise<LegalMatrixMutationResult> {
    this.assertAdminSession(params.session)

    return this.teamGovernanceRepository.setLegalMatrix({
      tenantId: params.session.tenantId as string,
      adminUserId: params.session.employeeId as string,
      teamId: params.teamId,
      legalUserIds: params.legalUserIds,
      reason: params.reason,
    })
  }
}
