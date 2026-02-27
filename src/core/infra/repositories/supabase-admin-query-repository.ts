import 'server-only'

import { BusinessRuleError, DatabaseError, NotFoundError } from '@/core/http/errors'
import type {
  AdminDepartmentUserGroup,
  AdminRoleOption,
  AdminUserOption,
  IAdminQueryRepository,
} from '@/core/domain/admin/admin-query-service'
import { createServiceSupabase } from '@/lib/supabase/service'

type RoleRow = {
  role_key: string
  display_name: string
}

type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
}

type TeamRow = {
  id: string
  name: string
  is_active: boolean | null
}

type TeamRoleMappingRow = {
  team_id: string
  email: string
  role_type: 'POC' | 'HOD'
  active_flag: boolean
}

type RoleRelation =
  | {
      role_key: string
    }
  | Array<{
      role_key: string
    }>
  | null

type UserRoleRow = {
  user_id: string
  roles: RoleRelation
}

function normalizeRoleKeys(roles: RoleRelation): string[] {
  if (!roles) {
    return []
  }

  const roleEntries = Array.isArray(roles) ? roles : [roles]
  return roleEntries.map((role) => role?.role_key).filter((roleKey): roleKey is string => Boolean(roleKey))
}

function mapRoleSet(params: { userRoleKeys: string[]; fallbackRole: string }): string[] {
  const roleSet = new Set<string>(params.userRoleKeys)
  if (roleSet.size === 0 && params.fallbackRole) {
    roleSet.add(params.fallbackRole)
  }
  return Array.from(roleSet)
}

class SupabaseAdminQueryRepository implements IAdminQueryRepository {
  private readonly supabase = createServiceSupabase()

  async listRoles(tenantId: string): Promise<AdminRoleOption[]> {
    const { data, error } = await this.supabase
      .from('roles')
      .select('role_key, display_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('role_key', { ascending: true })

    if (error) {
      throw new DatabaseError('Failed to load roles', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    return ((data ?? []) as RoleRow[]).map((role) => ({
      roleKey: role.role_key,
      displayName: role.display_name,
    }))
  }

  async listUsers(tenantId: string): Promise<AdminUserOption[]> {
    const users = await this.loadUsersByTenant(tenantId)
    if (users.length === 0) {
      return []
    }

    const roleMap = await this.loadRoleMap(
      tenantId,
      users.map((user) => user.id)
    )
    const assignmentsMap = await this.loadDepartmentAssignmentsByEmail(
      tenantId,
      users.map((user) => user.email)
    )

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      isActive: user.is_active,
      roles: mapRoleSet({
        userRoleKeys: Array.from(roleMap.get(user.id) ?? []),
        fallbackRole: user.role,
      }),
      departmentAssignments: assignmentsMap.get(user.email.toLowerCase()) ?? [],
    }))
  }

  async listUsersGroupedByDepartment(tenantId: string): Promise<AdminDepartmentUserGroup[]> {
    const users = await this.loadUsersByTenant(tenantId)
    if (users.length === 0) {
      return []
    }

    const roleMap = await this.loadRoleMap(
      tenantId,
      users.map((user) => user.id)
    )
    const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))

    const { data: mappingsData, error: mappingsError } = await this.supabase
      .from('team_role_mappings')
      .select('team_id, email, role_type, active_flag')
      .eq('tenant_id', tenantId)
      .eq('active_flag', true)
      .is('deleted_at', null)

    if (mappingsError) {
      throw new DatabaseError('Failed to load team role mappings', undefined, {
        errorCode: mappingsError.code,
        errorMessage: mappingsError.message,
      })
    }

    const mappings = (mappingsData ?? []) as TeamRoleMappingRow[]
    const uniqueTeamIds = Array.from(new Set(mappings.map((item) => item.team_id)))

    const teamById = new Map<string, TeamRow>()
    if (uniqueTeamIds.length > 0) {
      const { data: teamsData, error: teamsError } = await this.supabase
        .from('teams')
        .select('id, name, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('id', uniqueTeamIds)

      if (teamsError) {
        throw new DatabaseError('Failed to load departments for grouped users', undefined, {
          errorCode: teamsError.code,
          errorMessage: teamsError.message,
        })
      }

      for (const team of (teamsData ?? []) as TeamRow[]) {
        teamById.set(team.id, team)
      }
    }

    const groupsMap = new Map<string, AdminDepartmentUserGroup>()
    for (const mapping of mappings) {
      const team = teamById.get(mapping.team_id)
      if (!team) {
        continue
      }

      if (!groupsMap.has(mapping.team_id)) {
        groupsMap.set(mapping.team_id, {
          departmentId: mapping.team_id,
          departmentName: team.name,
          isDepartmentActive: team.is_active ?? true,
          users: [],
        })
      }

      const user = userByEmail.get(mapping.email.toLowerCase())
      if (!user) {
        continue
      }

      const group = groupsMap.get(mapping.team_id)
      if (!group) {
        continue
      }

      if (group.users.some((item) => item.id === user.id && item.departmentRole === mapping.role_type)) {
        continue
      }

      group.users.push({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isActive: user.is_active,
        roles: mapRoleSet({
          userRoleKeys: Array.from(roleMap.get(user.id) ?? []),
          fallbackRole: user.role,
        }),
        departmentRole: mapping.role_type,
      })
    }

    return Array.from(groupsMap.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName))
  }

  async createUser(params: {
    tenantId: string
    adminUserId: string
    email: string
    fullName?: string
    role: 'USER' | 'LEGAL_TEAM'
    isActive: boolean
    passwordHash: string
  }): Promise<AdminUserOption> {
    const normalizedEmail = params.email.trim().toLowerCase()

    const { data: existingUser, error: existingUserError } = await this.supabase
      .from('users')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('email', normalizedEmail)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>()

    if (existingUserError) {
      throw new DatabaseError('Failed to validate existing user', undefined, {
        errorCode: existingUserError.code,
        errorMessage: existingUserError.message,
      })
    }

    if (existingUser?.id) {
      throw new BusinessRuleError('USER_ALREADY_EXISTS', 'User already exists in this tenant')
    }

    const userId = crypto.randomUUID()

    const { error: insertUserError } = await this.supabase.from('users').insert([
      {
        id: userId,
        tenant_id: params.tenantId,
        email: normalizedEmail,
        full_name: params.fullName?.trim() || null,
        is_active: params.isActive,
        password_hash: params.passwordHash,
        role: params.role,
        token_version: 0,
      },
    ])

    if (insertUserError) {
      throw new DatabaseError('Failed to create user', undefined, {
        errorCode: insertUserError.code,
        errorMessage: insertUserError.message,
      })
    }

    const { error: auditError } = await this.supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.adminUserId,
        action: 'admin.user.created',
        actor_email: null,
        actor_role: null,
        resource_type: 'user',
        resource_id: userId,
        target_email: normalizedEmail,
        metadata: {
          full_name: params.fullName?.trim() || null,
          role: params.role,
          is_active: params.isActive,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write user creation audit event', undefined, {
        errorCode: auditError.code,
        errorMessage: auditError.message,
      })
    }

    const users = await this.listUsers(params.tenantId)
    const createdUser = users.find((user) => user.id === userId)
    if (!createdUser) {
      throw new DatabaseError('Failed to load created user')
    }

    return createdUser
  }

  async setUserStatus(params: {
    tenantId: string
    adminUserId: string
    userId: string
    isActive: boolean
  }): Promise<AdminUserOption> {
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id, email, is_active, token_version')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.userId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; email: string; is_active: boolean; token_version: number | null }>()

    if (userError) {
      throw new DatabaseError('Failed to resolve target user', undefined, {
        errorCode: userError.code,
        errorMessage: userError.message,
      })
    }

    if (!user?.id) {
      throw new NotFoundError('User', params.userId)
    }

    const tokenVersion = typeof user.token_version === 'number' ? Math.max(0, Math.trunc(user.token_version)) : 0

    const { error: updateError } = await this.supabase
      .from('users')
      .update({
        is_active: params.isActive,
        token_version: tokenVersion + 1,
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', params.userId)
      .is('deleted_at', null)

    if (updateError) {
      throw new DatabaseError('Failed to update user status', undefined, {
        errorCode: updateError.code,
        errorMessage: updateError.message,
      })
    }

    const { error: auditError } = await this.supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.adminUserId,
        action: 'admin.user.status.updated',
        actor_email: null,
        actor_role: null,
        resource_type: 'user',
        resource_id: params.userId,
        target_email: user.email,
        metadata: {
          previous_is_active: user.is_active,
          next_is_active: params.isActive,
          token_version_before: tokenVersion,
          token_version_after: tokenVersion + 1,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write user status audit event', undefined, {
        errorCode: auditError.code,
        errorMessage: auditError.message,
      })
    }

    const users = await this.listUsers(params.tenantId)
    const updatedUser = users.find((item) => item.id === params.userId)
    if (!updatedUser) {
      throw new DatabaseError('Failed to load updated user')
    }

    return updatedUser
  }

  async assignUserDepartmentRole(params: {
    tenantId: string
    adminUserId: string
    userId: string
    departmentId: string
    departmentRole: 'POC' | 'HOD'
  }): Promise<void> {
    await this.assertDepartmentExists(params.tenantId, params.departmentId)

    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('email')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.userId)
      .is('deleted_at', null)
      .maybeSingle<{ email: string }>()

    if (userError) {
      throw new DatabaseError('Failed to load user for department assignment', undefined, {
        errorCode: userError.code,
        errorMessage: userError.message,
      })
    }

    if (!user?.email) {
      throw new NotFoundError('User', params.userId)
    }

    await this.upsertDepartmentRoleMapping({
      tenantId: params.tenantId,
      departmentId: params.departmentId,
      email: user.email,
      departmentRole: params.departmentRole,
      adminUserId: params.adminUserId,
    })
  }

  private async loadUsersByTenant(tenantId: string): Promise<UserRow[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, full_name, role, is_active')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('email', { ascending: true })
      .limit(500)

    if (error) {
      throw new DatabaseError('Failed to load users', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    return (data ?? []) as UserRow[]
  }

  private async loadRoleMap(tenantId: string, userIds: string[]): Promise<Map<string, Set<string>>> {
    const roleMap = new Map<string, Set<string>>()
    if (userIds.length === 0) {
      return roleMap
    }

    const { data, error } = await this.supabase
      .from('user_roles')
      .select('user_id, roles:roles!inner(role_key)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('user_id', userIds)

    if (error) {
      throw new DatabaseError('Failed to load user roles', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    for (const row of (data ?? []) as UserRoleRow[]) {
      if (!roleMap.has(row.user_id)) {
        roleMap.set(row.user_id, new Set<string>())
      }

      for (const roleKey of normalizeRoleKeys(row.roles)) {
        roleMap.get(row.user_id)?.add(roleKey)
      }
    }

    return roleMap
  }

  private async loadDepartmentAssignmentsByEmail(
    tenantId: string,
    userEmails: string[]
  ): Promise<
    Map<
      string,
      Array<{
        departmentId: string
        departmentName: string
        departmentRole: 'POC' | 'HOD'
      }>
    >
  > {
    const map = new Map<
      string,
      Array<{
        departmentId: string
        departmentName: string
        departmentRole: 'POC' | 'HOD'
      }>
    >()

    if (userEmails.length === 0) {
      return map
    }

    const normalizedEmails = Array.from(new Set(userEmails.map((email) => email.toLowerCase())))

    const { data: mappingsData, error: mappingsError } = await this.supabase
      .from('team_role_mappings')
      .select('team_id, email, role_type')
      .eq('tenant_id', tenantId)
      .eq('active_flag', true)
      .is('deleted_at', null)
      .in('email', normalizedEmails)

    if (mappingsError) {
      throw new DatabaseError('Failed to load department assignments', undefined, {
        errorCode: mappingsError.code,
        errorMessage: mappingsError.message,
      })
    }

    const mappings = (mappingsData ?? []) as TeamRoleMappingRow[]
    const teamIds = Array.from(new Set(mappings.map((mapping) => mapping.team_id)))

    const teamNameById = new Map<string, string>()
    if (teamIds.length > 0) {
      const { data: teamsData, error: teamsError } = await this.supabase
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('id', teamIds)

      if (teamsError) {
        throw new DatabaseError('Failed to load departments for user assignments', undefined, {
          errorCode: teamsError.code,
          errorMessage: teamsError.message,
        })
      }

      for (const team of (teamsData ?? []) as Array<{ id: string; name: string }>) {
        teamNameById.set(team.id, team.name)
      }
    }

    for (const mapping of mappings) {
      const email = mapping.email.toLowerCase()
      if (!map.has(email)) {
        map.set(email, [])
      }

      map.get(email)?.push({
        departmentId: mapping.team_id,
        departmentName: teamNameById.get(mapping.team_id) ?? 'Unknown Department',
        departmentRole: mapping.role_type,
      })
    }

    return map
  }

  private async assertDepartmentExists(tenantId: string, departmentId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('teams')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', departmentId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>()

    if (error) {
      throw new DatabaseError('Failed to validate department', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    if (!data?.id) {
      throw new NotFoundError('Department', departmentId)
    }
  }

  private async upsertDepartmentRoleMapping(params: {
    tenantId: string
    departmentId: string
    email: string
    departmentRole: 'POC' | 'HOD'
    adminUserId: string
  }): Promise<void> {
    const normalizedEmail = params.email.trim().toLowerCase()

    const { error } = await this.supabase.from('team_role_mappings').upsert(
      {
        tenant_id: params.tenantId,
        team_id: params.departmentId,
        email: normalizedEmail,
        role_type: params.departmentRole,
        active_flag: true,
        assigned_by: params.adminUserId,
        assigned_at: new Date().toISOString(),
        replaced_by: null,
        replaced_at: null,
        deleted_at: null,
      },
      {
        onConflict: 'tenant_id,team_id,email,role_type',
      }
    )

    if (error) {
      if (error.code === '23505') {
        throw new BusinessRuleError(
          'DEPARTMENT_PRIMARY_ROLE_ALREADY_ASSIGNED',
          `${params.departmentRole} is already assigned for this department`
        )
      }

      throw new DatabaseError('Failed to assign department role mapping', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const { error: auditError } = await this.supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.adminUserId,
        action: 'team.primary_role.assigned_legacy',
        actor_email: null,
        actor_role: null,
        resource_type: 'team_role_mappings',
        resource_id: params.departmentId,
        target_email: normalizedEmail,
        metadata: {
          department_id: params.departmentId,
          department_role: params.departmentRole,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write legacy primary-role assignment audit event', undefined, {
        errorCode: auditError.code,
        errorMessage: auditError.message,
      })
    }
  }
}

export const supabaseAdminQueryRepository = new SupabaseAdminQueryRepository()
