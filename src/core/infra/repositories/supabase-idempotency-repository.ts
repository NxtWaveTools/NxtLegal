import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import type { IIdempotencyRepository, IdempotencyRecord } from '@/core/domain/idempotency/idempotency-service'

class SupabaseIdempotencyRepository implements IIdempotencyRepository {
  private supabase = createServiceSupabase()

  async get(key: string, tenantId: string): Promise<IdempotencyRecord | null> {
    const { data, error } = await this.supabase
      .from('idempotency_keys')
      .select('id, key, tenant_id, response_data, status_code, expires_at, created_at')
      .eq('key', key)
      .eq('tenant_id', tenantId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      throw error
    }

    return {
      id: data.id,
      key: data.key,
      tenantId: data.tenant_id,
      responseData: data.response_data,
      statusCode: data.status_code,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    }
  }

  async set(record: IdempotencyRecord): Promise<void> {
    const { error } = await this.supabase.from('idempotency_keys').upsert(
      [
        {
          key: record.key,
          tenant_id: record.tenantId,
          response_data: record.responseData,
          status_code: record.statusCode,
          expires_at: record.expiresAt,
        },
      ],
      { onConflict: 'key,tenant_id' }
    )

    if (error) throw error
  }

  async delete(key: string, tenantId: string): Promise<void> {
    const { error } = await this.supabase.from('idempotency_keys').delete().eq('key', key).eq('tenant_id', tenantId)

    if (error) throw error
  }
}

export const supabaseIdempotencyRepository = new SupabaseIdempotencyRepository()
