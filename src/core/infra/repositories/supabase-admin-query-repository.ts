import 'server-only'

import { DatabaseError } from '@/core/http/errors'
import type { AdminRoleOption, AdminUserOption, IAdminQueryRepository } from '@/core/domain/admin/admin-query-service'
import { createServiceSupabase } from '@/lib/supabase/service'

type RoleRow = {
  role_key: string
  display_name: string
}

type UserRow = {
  id: string
  email: string
  full_name: string | null
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
    const { data: usersData, error: usersError } = await this.supabase
      .from('users')
      .select('id, email, full_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('email', { ascending: true })
      .limit(200)

    if (usersError) {
      throw new DatabaseError('Failed to load users', undefined, {
        errorCode: usersError.code,
        errorMessage: usersError.message,
      })
    }

    const users = (usersData ?? []) as UserRow[]
    if (users.length === 0) {
      return []
    }

    const userIds = users.map((user) => user.id)

    const { data: userRolesData, error: userRolesError } = await this.supabase
      .from('user_roles')
      .select('user_id, roles:roles!inner(role_key)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('user_id', userIds)

    if (userRolesError) {
      throw new DatabaseError('Failed to load user roles', undefined, {
        errorCode: userRolesError.code,
        errorMessage: userRolesError.message,
      })
    }

    const roleMap = new Map<string, Set<string>>()
    for (const row of (userRolesData ?? []) as UserRoleRow[]) {
      if (!roleMap.has(row.user_id)) {
        roleMap.set(row.user_id, new Set<string>())
      }

      for (const roleKey of normalizeRoleKeys(row.roles)) {
        roleMap.get(row.user_id)?.add(roleKey)
      }
    }

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      roles: Array.from(roleMap.get(user.id) ?? []),
    }))
  }
}

export const supabaseAdminQueryRepository = new SupabaseAdminQueryRepository()
