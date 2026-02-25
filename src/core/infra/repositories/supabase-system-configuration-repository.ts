import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { DatabaseError } from '@/core/http/errors'
import type {
  ISystemConfigurationRepository,
  SystemConfiguration,
} from '@/core/domain/admin/system-configuration-service'

type AuditLogRow = {
  user_id: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const SYSTEM_CONFIG_RESOURCE_TYPE = 'system_configuration'
const SYSTEM_CONFIG_RESOURCE_ID = 'tenant'
const SYSTEM_CONFIG_ACTION = 'admin.system_configuration.updated'

function coercePersistedSystemConfig(
  metadata: Record<string, unknown> | null
): Omit<SystemConfiguration, 'updatedAt' | 'updatedByUserId'> | null {
  if (!metadata) {
    return null
  }

  const rawConfig = metadata.config as Record<string, unknown> | undefined
  if (!rawConfig) {
    return null
  }

  const featureFlags = (rawConfig.featureFlags ?? {}) as Record<string, unknown>
  const securitySessionPolicies = (rawConfig.securitySessionPolicies ?? {}) as Record<string, unknown>
  const defaults = (rawConfig.defaults ?? {}) as Record<string, unknown>

  return {
    featureFlags: {
      enableAdminGovernance: Boolean(featureFlags.enableAdminGovernance),
      enableContractWorkflow: Boolean(featureFlags.enableContractWorkflow),
    },
    securitySessionPolicies: {
      accessTokenDays: Number(securitySessionPolicies.accessTokenDays ?? 2),
      refreshTokenDays: Number(securitySessionPolicies.refreshTokenDays ?? 7),
      maxLoginAttempts: Number(securitySessionPolicies.maxLoginAttempts ?? 5),
    },
    defaults: {
      defaultDepartmentRole: defaults.defaultDepartmentRole === 'HOD' ? 'HOD' : 'POC',
      defaultUserRole: defaults.defaultUserRole === 'USER' ? 'USER' : 'LEGAL_TEAM',
    },
  }
}

class SupabaseSystemConfigurationRepository implements ISystemConfigurationRepository {
  private readonly supabase = createServiceSupabase()

  async getLatestByTenant(tenantId: string): Promise<SystemConfiguration | null> {
    const { data, error } = await this.supabase
      .from('audit_logs')
      .select('user_id, metadata, created_at')
      .eq('tenant_id', tenantId)
      .eq('resource_type', SYSTEM_CONFIG_RESOURCE_TYPE)
      .eq('resource_id', SYSTEM_CONFIG_RESOURCE_ID)
      .eq('action', SYSTEM_CONFIG_ACTION)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      throw new DatabaseError('Failed to load system configuration from audit logs', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const row = ((data ?? [])[0] ?? null) as AuditLogRow | null
    if (!row) {
      return null
    }

    const config = coercePersistedSystemConfig(row.metadata)
    if (!config) {
      return null
    }

    return {
      ...config,
      updatedAt: row.created_at,
      updatedByUserId: row.user_id,
    }
  }

  async saveByTenant(params: {
    tenantId: string
    adminUserId: string
    config: Omit<SystemConfiguration, 'updatedAt' | 'updatedByUserId'>
    reason?: string
  }): Promise<SystemConfiguration> {
    const nowIso = new Date().toISOString()

    const { error } = await this.supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.adminUserId,
        action: SYSTEM_CONFIG_ACTION,
        resource_type: SYSTEM_CONFIG_RESOURCE_TYPE,
        resource_id: SYSTEM_CONFIG_RESOURCE_ID,
        changes: {
          reason: params.reason ?? null,
        },
        metadata: {
          config: params.config,
        },
        created_at: nowIso,
      },
    ])

    if (error) {
      throw new DatabaseError('Failed to persist system configuration to audit logs', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    return {
      ...params.config,
      updatedAt: nowIso,
      updatedByUserId: params.adminUserId,
    }
  }
}

export const supabaseSystemConfigurationRepository = new SupabaseSystemConfigurationRepository()
