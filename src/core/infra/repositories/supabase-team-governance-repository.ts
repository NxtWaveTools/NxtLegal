import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { contractWorkflowIdentities } from '@/core/constants/contracts'
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
  poc_name: string | null
  hod_name: string | null
}

type TeamRoleMappingRow = {
  team_id: string
  email: string
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
  poc_name?: string | null
  hod_name?: string | null
  poc_email: string | null
  hod_email: string | null
  before_state_snapshot: Record<string, unknown> | null
  after_state_snapshot: Record<string, unknown> | null
}

type PrimaryRoleRpcRow = {
  team_id: string
  role_type: 'POC' | 'HOD'
  previous_email: string | null
  next_email: string
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

  private async enforceRoleReplacementConsistency(params: {
    tenantId: string
    teamId: string
    roleType: 'POC' | 'HOD'
    previousEmail: string | null
    nextEmail: string
  }): Promise<void> {
    const previousEmail = params.previousEmail?.trim().toLowerCase() ?? null
    const nextEmail = params.nextEmail.trim().toLowerCase()

    if (!previousEmail || !nextEmail || previousEmail === nextEmail) {
      return
    }

    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, email, token_version')
      .eq('tenant_id', params.tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('email', [previousEmail, nextEmail])

    if (usersError) {
      throw new DatabaseError('Failed to resolve replacement users for role reassignment', undefined, {
        errorCode: usersError.code,
        errorMessage: usersError.message,
      })
    }

    const previousUser = (users ?? []).find((item) => item.email === previousEmail)
    const nextUser = (users ?? []).find((item) => item.email === nextEmail)

    if (!previousUser || !nextUser) {
      return
    }

    const restrictedUserRoles = new Set(['USER', 'POC', 'HOD'])

    const normalizeRole = (role: unknown): string => {
      if (typeof role !== 'string') {
        return 'USER'
      }

      return role.trim().toUpperCase()
    }

    const { data: nextRoleRecord, error: nextRoleError } = await this.supabase
      .from('users')
      .select('role')
      .eq('tenant_id', params.tenantId)
      .eq('id', nextUser.id)
      .is('deleted_at', null)
      .maybeSingle<{ role: string | null }>()

    if (nextRoleError) {
      throw new DatabaseError('Failed to resolve replacement user role state', undefined, {
        errorCode: nextRoleError.code,
        errorMessage: nextRoleError.message,
      })
    }

    const nextCurrentRole = normalizeRole(nextRoleRecord?.role)
    if (restrictedUserRoles.has(nextCurrentRole) && nextCurrentRole !== params.roleType) {
      const { error: setNextRoleError } = await this.supabase
        .from('users')
        .update({
          role: params.roleType,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', params.tenantId)
        .eq('id', nextUser.id)
        .is('deleted_at', null)

      if (setNextRoleError) {
        throw new DatabaseError('Failed to sync replacement user role after role email replacement', undefined, {
          errorCode: setNextRoleError.code,
          errorMessage: setNextRoleError.message,
        })
      }
    }

    if (params.roleType === 'POC') {
      const { error: updateUploadedByError } = await this.supabase
        .from('contracts')
        .update({
          uploaded_by_employee_id: nextUser.id,
          uploaded_by_email: nextEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', params.tenantId)
        .is('deleted_at', null)
        .eq('department_id', params.teamId)
        .or(`uploaded_by_employee_id.eq.${previousUser.id},uploaded_by_email.eq.${previousEmail}`)

      if (updateUploadedByError) {
        throw new DatabaseError('Failed to reassign POC-owned contracts after email replacement', undefined, {
          errorCode: updateUploadedByError.code,
          errorMessage: updateUploadedByError.message,
        })
      }
    } else {
      const { error: updateAssigneeError } = await this.supabase
        .from('contracts')
        .update({
          current_assignee_employee_id: nextUser.id,
          current_assignee_email: nextEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', params.tenantId)
        .is('deleted_at', null)
        .eq('department_id', params.teamId)
        .eq('status', 'HOD_PENDING')
        .or(`current_assignee_employee_id.eq.${previousUser.id},current_assignee_email.eq.${previousEmail}`)

      if (updateAssigneeError) {
        throw new DatabaseError('Failed to reassign HOD-pending contracts after email replacement', undefined, {
          errorCode: updateAssigneeError.code,
          errorMessage: updateAssigneeError.message,
        })
      }
    }

    const { error: updateApproversError } = await this.supabase
      .from('contract_additional_approvers')
      .update({
        approver_employee_id: nextUser.id,
        approver_email: nextEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .is('deleted_at', null)
      .eq('status', 'PENDING')
      .eq('approver_employee_id', previousUser.id)

    if (updateApproversError) {
      throw new DatabaseError('Failed to reassign pending additional approvers after email replacement', undefined, {
        errorCode: updateApproversError.code,
        errorMessage: updateApproversError.message,
      })
    }

    const previousTokenVersion =
      typeof previousUser.token_version === 'number' && Number.isFinite(previousUser.token_version)
        ? Math.max(0, Math.trunc(previousUser.token_version))
        : 0

    const { error: tokenVersionError } = await this.supabase
      .from('users')
      .update({
        token_version: previousTokenVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', previousUser.id)
      .is('deleted_at', null)

    if (tokenVersionError) {
      throw new DatabaseError('Failed to revoke old user sessions after role replacement', undefined, {
        errorCode: tokenVersionError.code,
        errorMessage: tokenVersionError.message,
      })
    }

    const { count: remainingPrimaryRoleCount, error: remainingRoleError } = await this.supabase
      .from('team_role_mappings')
      .select('id', { head: true, count: 'exact' })
      .eq('tenant_id', params.tenantId)
      .eq('email', previousEmail)
      .in('role_type', ['POC', 'HOD'])
      .eq('active_flag', true)
      .is('deleted_at', null)

    if (remainingRoleError) {
      throw new DatabaseError('Failed to validate remaining mapped primary roles for replaced user', undefined, {
        errorCode: remainingRoleError.code,
        errorMessage: remainingRoleError.message,
      })
    }

    if ((remainingPrimaryRoleCount ?? 0) === 0) {
      const { data: previousRoleRecord, error: previousRoleError } = await this.supabase
        .from('users')
        .select('role')
        .eq('tenant_id', params.tenantId)
        .eq('id', previousUser.id)
        .is('deleted_at', null)
        .maybeSingle<{ role: string | null }>()

      if (previousRoleError) {
        throw new DatabaseError('Failed to resolve previous user role state for downgrade', undefined, {
          errorCode: previousRoleError.code,
          errorMessage: previousRoleError.message,
        })
      }

      const previousCurrentRole = normalizeRole(previousRoleRecord?.role)
      if (restrictedUserRoles.has(previousCurrentRole) && previousCurrentRole !== 'USER') {
        const { error: downgradeRoleError } = await this.supabase
          .from('users')
          .update({
            role: 'USER',
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', params.tenantId)
          .eq('id', previousUser.id)
          .is('deleted_at', null)

        if (downgradeRoleError) {
          throw new DatabaseError('Failed to downgrade previous user role after role email replacement', undefined, {
            errorCode: downgradeRoleError.code,
            errorMessage: downgradeRoleError.message,
          })
        }
      }
    }
  }

  async listDepartments(tenantId: string): Promise<DepartmentSummary[]> {
    const { data: teams, error: teamsError } = await this.supabase
      .from('teams')
      .select('id, name, is_active, poc_name, hod_name')
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

    const { data: roleMappings, error: roleMappingsError } = await this.supabase
      .from('team_role_mappings')
      .select('team_id, email, role_type')
      .eq('tenant_id', tenantId)
      .eq('active_flag', true)
      .is('deleted_at', null)
      .in('team_id', teamIds)

    if (roleMappingsError) {
      throw new DatabaseError('Failed to load department primary assignments', undefined, {
        errorCode: roleMappingsError.code,
        errorMessage: roleMappingsError.message,
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
      new Set(((legalAssignments ?? []) as LegalAssignmentRow[]).map((item) => item.user_id))
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
    for (const mapping of (roleMappings ?? []) as TeamRoleMappingRow[]) {
      if (!primaryMap.has(mapping.team_id)) {
        primaryMap.set(mapping.team_id, {
          hodUserId: null,
          hodEmail: null,
          pocUserId: null,
          pocEmail: null,
        })
      }

      const current = primaryMap.get(mapping.team_id)
      if (!current) {
        continue
      }

      if (mapping.role_type === 'HOD') {
        current.hodUserId = null
        current.hodEmail = mapping.email
      }

      if (mapping.role_type === 'POC') {
        current.pocUserId = null
        current.pocEmail = mapping.email
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

    const legalDepartment = teamRows.find(
      (team) => team.name.trim().toLowerCase() === contractWorkflowIdentities.legalDepartmentName.trim().toLowerCase()
    )

    if (legalDepartment) {
      const { data: legalRoleUsers, error: legalRoleUsersError } = await this.supabase
        .from('users')
        .select('id, email, full_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .eq('role', 'LEGAL_TEAM')
        .order('full_name', { ascending: true })
        .order('email', { ascending: true })

      if (legalRoleUsersError) {
        throw new DatabaseError('Failed to load legal department users by role fallback', undefined, {
          errorCode: legalRoleUsersError.code,
          errorMessage: legalRoleUsersError.message,
        })
      }

      const existingAssignments = legalByTeamId.get(legalDepartment.id) ?? []
      const deduplicatedAssignments = new Map<string, LegalAssignment>()

      for (const assignment of existingAssignments) {
        deduplicatedAssignments.set(assignment.userId, assignment)
      }

      for (const user of ((legalRoleUsers ?? []) as UserRow[]).filter((item) => Boolean(item.id))) {
        if (!deduplicatedAssignments.has(user.id)) {
          deduplicatedAssignments.set(user.id, {
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
          })
        }
      }

      legalByTeamId.set(
        legalDepartment.id,
        Array.from(deduplicatedAssignments.values()).sort((left, right) => left.email.localeCompare(right.email))
      )
    }

    return teamRows.map((team) => {
      const primary = primaryMap.get(team.id)

      return {
        id: team.id,
        name: team.name,
        isActive: team.is_active !== false,
        pocName: team.poc_name,
        hodName: team.hod_name,
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
    pocEmail: string
    pocName: string
    hodEmail: string
    hodName: string
    reason?: string
  }): Promise<TeamMutationResult> {
    const { data, error } = await this.supabase.rpc('admin_create_department_with_emails', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_department_name: params.name,
      p_poc_email: params.pocEmail,
      p_hod_email: params.hodEmail,
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

    const { error: updateNamesError } = await this.supabase
      .from('teams')
      .update({
        poc_name: params.pocName,
        hod_name: params.hodName,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', row.team_id)
      .is('deleted_at', null)

    if (updateNamesError) {
      throw new DatabaseError('Failed to persist department owner names', undefined, {
        errorCode: updateNamesError.code,
        errorMessage: updateNamesError.message,
      })
    }

    return {
      teamId: row.team_id,
      departmentName: row.department_name,
      isActive: row.is_active,
      pocName: row.poc_name ?? params.pocName,
      hodName: row.hod_name ?? params.hodName,
      pocEmail: row.poc_email,
      hodEmail: row.hod_email,
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
      pocName: row.poc_name ?? null,
      hodName: row.hod_name ?? null,
      pocEmail: row.poc_email,
      hodEmail: row.hod_email,
      beforeStateSnapshot: row.before_state_snapshot ?? {},
      afterStateSnapshot: row.after_state_snapshot ?? {},
    }
  }

  async assignPrimaryRole(params: {
    tenantId: string
    adminUserId: string
    teamId: string
    newEmail: string
    newName: string
    roleType: 'POC' | 'HOD'
    reason?: string
  }): Promise<PrimaryRoleMutationResult> {
    const { data, error } = await this.supabase.rpc('admin_replace_team_role_email', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_team_id: params.teamId,
      p_new_email: params.newEmail,
      p_new_name: params.newName,
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

    await this.enforceRoleReplacementConsistency({
      tenantId: params.tenantId,
      teamId: params.teamId,
      roleType: row.role_type,
      previousEmail: row.previous_email,
      nextEmail: row.next_email,
    })

    return {
      teamId: row.team_id,
      roleType: row.role_type,
      previousEmail: row.previous_email,
      nextEmail: row.next_email,
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
