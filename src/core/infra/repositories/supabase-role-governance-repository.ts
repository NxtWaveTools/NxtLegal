import 'server-only'

import { adminGovernance } from '@/core/constants/admin-governance'
import { createServiceSupabase } from '@/lib/supabase/service'
import { DatabaseError, NotFoundError } from '@/core/http/errors'
import type {
  ChangeUserRoleParams,
  ChangeUserRoleResult,
  IRoleGovernanceRepository,
} from '@/core/domain/admin/role-governance-service'

type RoleChangeRpcRow = {
  changed: boolean
  operation: 'grant' | 'revoke'
  role_key: string
  target_user_id: string
  target_email: string
  before_state_snapshot: Record<string, unknown>
  after_state_snapshot: Record<string, unknown>
  old_token_version: number
  new_token_version: number
}

class SupabaseRoleGovernanceRepository implements IRoleGovernanceRepository {
  private readonly supabase = createServiceSupabase()

  private readonly canonicalRolePrecedence = [
    'SUPER_ADMIN',
    'LEGAL_ADMIN',
    'ADMIN',
    'LEGAL_TEAM',
    'HOD',
    'POC',
    'USER',
  ] as const

  private normalizeRole(value: unknown): string {
    if (typeof value !== 'string') {
      return ''
    }

    return value.trim().toUpperCase()
  }

  private selectHighestPrecedenceRole(activeRoleKeys: string[]): string {
    const normalized = Array.from(new Set(activeRoleKeys.map((value) => this.normalizeRole(value)).filter(Boolean)))
    if (normalized.length === 0) {
      return adminGovernance.userRoleTypes[0]
    }

    for (const roleKey of this.canonicalRolePrecedence) {
      if (normalized.includes(roleKey)) {
        return roleKey
      }
    }

    return normalized[0]
  }

  private async syncLegacyRoleCompatibility(params: {
    tenantId: string
    targetUserId: string
    roleKey: string
    operation: 'grant' | 'revoke'
    changed: boolean
  }): Promise<void> {
    const { data: currentUser, error: currentUserError } = await this.supabase
      .from('users')
      .select('role, token_version')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.targetUserId)
      .is('deleted_at', null)
      .maybeSingle<{ role: string | null; token_version: number | null }>()

    if (currentUserError) {
      throw new DatabaseError('Failed to synchronize legacy role state', undefined, {
        errorCode: currentUserError.code,
        errorMessage: currentUserError.message,
      })
    }

    if (!currentUser) {
      throw new NotFoundError('User', params.targetUserId)
    }

    const { data: canonicalRoleRows, error: canonicalRoleError } = await this.supabase
      .from('user_roles')
      .select('roles:role_id(role_key)')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', params.targetUserId)
      .eq('is_active', true)
      .is('deleted_at', null)

    if (canonicalRoleError) {
      throw new DatabaseError('Failed to synchronize legacy role state', undefined, {
        errorCode: canonicalRoleError.code,
        errorMessage: canonicalRoleError.message,
      })
    }

    const activeRoleKeys: string[] = []
    for (const row of (canonicalRoleRows ?? []) as Array<{
      roles: { role_key?: string } | Array<{ role_key?: string }> | null
    }>) {
      const relation = row.roles
      const entries = Array.isArray(relation) ? relation : relation ? [relation] : []
      for (const entry of entries) {
        const roleKey = this.normalizeRole(entry.role_key)
        if (roleKey.length > 0) {
          activeRoleKeys.push(roleKey)
        }
      }
    }

    const nextLegacyRole = this.selectHighestPrecedenceRole(activeRoleKeys)
    const currentLegacyRole = this.normalizeRole(currentUser.role)
    const hasExpectedLegacyRole = currentLegacyRole === nextLegacyRole

    if (hasExpectedLegacyRole && params.changed) {
      return
    }

    const previousTokenVersion =
      typeof currentUser.token_version === 'number' && Number.isFinite(currentUser.token_version)
        ? Math.max(0, Math.trunc(currentUser.token_version))
        : 0

    const shouldBumpTokenVersion = !params.changed
    const patch: { role: string; updated_at: string; token_version?: number } = {
      role: nextLegacyRole,
      updated_at: new Date().toISOString(),
    }

    if (shouldBumpTokenVersion) {
      patch.token_version = previousTokenVersion + 1
    }

    const { error: updateError } = await this.supabase
      .from('users')
      .update(patch)
      .eq('tenant_id', params.tenantId)
      .eq('id', params.targetUserId)
      .is('deleted_at', null)

    if (updateError) {
      throw new DatabaseError('Failed to synchronize legacy role state', undefined, {
        errorCode: updateError.code,
        errorMessage: updateError.message,
      })
    }
  }

  async changeUserRole(params: ChangeUserRoleParams): Promise<ChangeUserRoleResult> {
    const { data, error } = await this.supabase.rpc('admin_change_user_role', {
      p_tenant_id: params.tenantId,
      p_admin_user_id: params.adminUserId,
      p_target_user_id: params.targetUserId,
      p_role_key: params.roleKey,
      p_operation: params.operation.toUpperCase(),
      p_reason: params.reason ?? null,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('target user not found')) {
        throw new NotFoundError('User', params.targetUserId)
      }

      if (message.includes('role key') && message.includes('not found')) {
        throw new NotFoundError('Role', params.roleKey)
      }

      throw new DatabaseError('Failed to change user role', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const row = ((data ?? [])[0] ?? null) as RoleChangeRpcRow | null

    if (!row) {
      throw new DatabaseError('Role change RPC returned no result')
    }

    await this.syncLegacyRoleCompatibility({
      tenantId: params.tenantId,
      targetUserId: row.target_user_id,
      roleKey: row.role_key,
      operation: row.operation,
      changed: row.changed,
    })

    return {
      changed: row.changed,
      operation: row.operation,
      roleKey: row.role_key,
      targetUserId: row.target_user_id,
      targetEmail: row.target_email,
      beforeStateSnapshot: row.before_state_snapshot ?? {},
      afterStateSnapshot: row.after_state_snapshot ?? {},
      oldTokenVersion: row.old_token_version,
      newTokenVersion: row.new_token_version,
    }
  }
}

export const supabaseRoleGovernanceRepository = new SupabaseRoleGovernanceRepository()
