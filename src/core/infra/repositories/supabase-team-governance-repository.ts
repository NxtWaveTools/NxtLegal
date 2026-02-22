import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { DatabaseError, NotFoundError } from '@/core/http/errors'
import type {
  DepartmentSummary,
  ITeamGovernanceRepository,
  LegalAssignment,
  LegalMatrixMutationResult,
  PrimaryRoleMutationResult,
  TeamMutationResult,
} from '@/core/domain/admin/team-governance-service'

type TeamRow = {
  id: string
  name: string
  is_active: boolean | null
}

type TeamMemberRow = {
  team_id: string
  user_id: string
  role_type: 'POC' | 'HOD'
}

type UserRow = {
  id: string
  email: string
  full_name: string | null
}

type LegalAssignmentRow = {
  department_id: string
  user_id: string
}

type TeamRpcRow = {
  team_id: string
  department_name: string
  is_active: boolean
  before_state_snapshot: Record<string, unknown> | null
  after_state_snapshot: Record<string, unknown> | null
}

type PrimaryRoleRpcRow = {
  team_id: string
  role_type: 'POC' | 'HOD'
  previous_user_id: string | null
  next_user_id: string
  affected_contracts: number
  before_state_snapshot: Record<string, unknown> | null
  after_state_snapshot: Record<string, unknown> | null
}

type LegalMatrixRpcRow = {
  team_id: string
  active_legal_user_ids: string[] | null
  before_state_snapshot: Record<string, unknown> | null
  after_state_snapshot: Record<string, unknown> | null
}

class SupabaseTeamGovernanceRepository implements ITeamGovernanceRepository {
  private readonly supabase = createServiceSupabase()

  async listDepartments(tenantId: string): Promise<DepartmentSummary[]> {
    const { data: teams, error: teamsError } = await this.supabase
      .from('teams')
      .select('id, name, is_active')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (teamsError) {
      throw new DatabaseError('Failed to load departments', undefined, {
        errorCode: teamsError.code,
        errorMessage: teamsError.message,
      })
    }

    const teamRows = (teams ?? []) as TeamRow[]
    if (teamRows.length === 0) {
      return []
    }

    const teamIds = teamRows.map((team) => team.id)

    const { data: teamMembers, error: teamMembersError } = await this.supabase
      .from('team_members')
      .select('team_id, user_id, role_type')
      .eq('tenant_id', tenantId)
      .eq('is_primary', true)
      .in('team_id', teamIds)

    if (teamMembersError) {
      throw new DatabaseError('Failed to load department primary assignments', undefined, {
        errorCode: teamMembersError.code,
        errorMessage: teamMembersError.message,
      })
    }

    const { data: legalAssignments, error: legalAssignmentsError } = await this.supabase
      .from('department_legal_assignments')
      .select('department_id, user_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('department_id', teamIds)

    if (legalAssignmentsError) {
      throw new DatabaseError('Failed to load legal assignment matrix', undefined, {
        errorCode: legalAssignmentsError.code,
        errorMessage: legalAssignmentsError.message,
      })
    }

    const uniqueUserIds = Array.from(
      new Set([
        ...((teamMembers ?? []) as TeamMemberRow[]).map((item) => item.user_id),
        ...((legalAssignments ?? []) as LegalAssignmentRow[]).map((item) => item.user_id),
      ])
    )

    const userById = new Map<string, UserRow>()
    if (uniqueUserIds.length > 0) {
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select('id, email, full_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .in('id', uniqueUserIds)

      if (usersError) {
        throw new DatabaseError('Failed to load team assignment users', undefined, {
          errorCode: usersError.code,
          errorMessage: usersError.message,
        })
      }

      for (const user of (users ?? []) as UserRow[]) {
        userById.set(user.id, user)
      }
    }

    const primaryMap = new Map<
      string,
      { hodUserId: string | null; hodEmail: string | null; pocUserId: string | null; pocEmail: string | null }
    >()
    for (const member of (teamMembers ?? []) as TeamMemberRow[]) {
      if (!primaryMap.has(member.team_id)) {
        primaryMap.set(member.team_id, {
          hodUserId: null,
          hodEmail: null,
          pocUserId: null,
          pocEmail: null,
        })
      }

      const current = primaryMap.get(member.team_id)
      const user = userById.get(member.user_id)
      if (!current || !user) {
        continue
      }

      if (member.role_type === 'HOD') {
        current.hodUserId = member.user_id
        current.hodEmail = user.email
      }

      if (member.role_type === 'POC') {
        current.pocUserId = member.user_id
        current.pocEmail = user.email
      }
    }

    const legalByTeamId = new Map<string, LegalAssignment[]>()
    for (const legalAssignment of (legalAssignments ?? []) as LegalAssignmentRow[]) {
      const user = userById.get(legalAssignment.user_id)
      if (!user) {
        continue
      }

      if (!legalByTeamId.has(legalAssignment.department_id)) {
        legalByTeamId.set(legalAssignment.department_id, [])
      }

      legalByTeamId.get(legalAssignment.department_id)?.push({
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
      })
    }

    return teamRows.map((team) => {
      const primary = primaryMap.get(team.id)

      return {
        id: team.id,
        name: team.name,
        isActive: team.is_active !== false,
        hodUserId: primary?.hodUserId ?? null,
        hodEmail: primary?.hodEmail ?? null,
        pocUserId: primary?.pocUserId ?? null,
        pocEmail: primary?.pocEmail ?? null,
        legalAssignments: legalByTeamId.get(team.id) ?? [],
      }
    })
  }

  async createDepartment(params: {
    tenantId: string
    adminUserId: string
    name: string
    reason?: string
  }): Promise<TeamMutationResult> {
    const { data, error } = await this.supabase.rpc('admin_create_department', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_department_name: params.name,
      p_reason: params.reason ?? null,
    })

    if (error) {
      throw new DatabaseError('Failed to create department', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const row = ((data ?? [])[0] ?? null) as TeamRpcRow | null
    if (!row) {
      throw new DatabaseError('Department create RPC returned no result')
    }

    return {
      teamId: row.team_id,
      departmentName: row.department_name,
      isActive: row.is_active,
      beforeStateSnapshot: row.before_state_snapshot ?? {},
      afterStateSnapshot: row.after_state_snapshot ?? {},
    }
  }

  async updateDepartment(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    operation: 'rename' | 'deactivate'
    name?: string
    reason?: string
  }): Promise<TeamMutationResult> {
    const { data, error } = await this.supabase.rpc('admin_update_department', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_team_id: params.teamId,
      p_operation: params.operation.toUpperCase(),
      p_department_name: params.name ?? null,
      p_reason: params.reason ?? null,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('department not found')) {
        throw new NotFoundError('Department', params.teamId)
      }

      throw new DatabaseError('Failed to update department', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const row = ((data ?? [])[0] ?? null) as TeamRpcRow | null
    if (!row) {
      throw new DatabaseError('Department update RPC returned no result')
    }

    return {
      teamId: row.team_id,
      departmentName: row.department_name,
      isActive: row.is_active,
      beforeStateSnapshot: row.before_state_snapshot ?? {},
      afterStateSnapshot: row.after_state_snapshot ?? {},
    }
  }

  async assignPrimaryRole(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    userId: string
    roleType: 'POC' | 'HOD'
    reason?: string
  }): Promise<PrimaryRoleMutationResult> {
    const { data, error } = await this.supabase.rpc('admin_assign_primary_team_role', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_team_id: params.teamId,
      p_new_user_id: params.userId,
      p_role_type: params.roleType,
      p_reason: params.reason ?? null,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('department not found')) {
        throw new NotFoundError('Department', params.teamId)
      }

      throw new DatabaseError('Failed to assign primary team role', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const row = ((data ?? [])[0] ?? null) as PrimaryRoleRpcRow | null
    if (!row) {
      throw new DatabaseError('Primary assignment RPC returned no result')
    }

    return {
      teamId: row.team_id,
      roleType: row.role_type,
      previousUserId: row.previous_user_id,
      nextUserId: row.next_user_id,
      affectedContracts: row.affected_contracts,
      beforeStateSnapshot: row.before_state_snapshot ?? {},
      afterStateSnapshot: row.after_state_snapshot ?? {},
    }
  }

  async setLegalMatrix(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    legalUserIds: string[]
    reason?: string
  }): Promise<LegalMatrixMutationResult> {
    const { data, error } = await this.supabase.rpc('admin_set_department_legal_matrix', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_team_id: params.teamId,
      p_legal_user_ids: params.legalUserIds,
      p_reason: params.reason ?? null,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('department not found')) {
        throw new NotFoundError('Department', params.teamId)
      }

      throw new DatabaseError('Failed to update legal assignment matrix', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const row = ((data ?? [])[0] ?? null) as LegalMatrixRpcRow | null
    if (!row) {
      throw new DatabaseError('Legal matrix RPC returned no result')
    }

    return {
      teamId: row.team_id,
      activeLegalUserIds: row.active_legal_user_ids ?? [],
      beforeStateSnapshot: row.before_state_snapshot ?? {},
      afterStateSnapshot: row.after_state_snapshot ?? {},
    }
  }
}

export const supabaseTeamGovernanceRepository = new SupabaseTeamGovernanceRepository()
