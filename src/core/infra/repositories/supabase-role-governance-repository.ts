import 'server-only'

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
