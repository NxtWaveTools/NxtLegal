import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { DatabaseError } from '@/core/http/errors'
import type {
  AuditViewerFilters,
  AuditViewerListResult,
  AuditViewerLogItem,
  IAuditViewerRepository,
} from '@/core/domain/admin/audit-viewer-service'

type AuditLogRow = {
  id: string
  user_id: string
  action: string
  resource_type: string
  resource_id: string
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const encodeCursor = (createdAt: string): string => Buffer.from(createdAt, 'utf8').toString('base64url')
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8')

class SupabaseAdminAuditViewerRepository implements IAuditViewerRepository {
  private readonly supabase = createServiceSupabase()

  async list(params: {
    tenantId: string
    filters: AuditViewerFilters
    cursor?: string
    limit: number
  }): Promise<AuditViewerListResult> {
    let countQuery = this.supabase
      .from('audit_logs')
      .select('id', { head: true, count: 'exact' })
      .eq('tenant_id', params.tenantId)

    if (params.filters.action) {
      countQuery = countQuery.eq('action', params.filters.action)
    }

    if (params.filters.resourceType) {
      countQuery = countQuery.eq('resource_type', params.filters.resourceType)
    }

    if (params.filters.userId) {
      countQuery = countQuery.eq('user_id', params.filters.userId)
    }

    if (params.filters.from) {
      countQuery = countQuery.gte('created_at', params.filters.from)
    }

    if (params.filters.to) {
      countQuery = countQuery.lte('created_at', params.filters.to)
    }

    if (params.filters.query) {
      const escaped = params.filters.query.replace(/,/g, ' ')
      countQuery = countQuery.or(
        `action.ilike.%${escaped}%,resource_type.ilike.%${escaped}%,resource_id.ilike.%${escaped}%,user_id.ilike.%${escaped}%`
      )
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      throw new DatabaseError('Failed to count audit logs', undefined, {
        errorCode: countError.code,
        errorMessage: countError.message,
      })
    }

    let dataQuery = this.supabase
      .from('audit_logs')
      .select('id, user_id, action, resource_type, resource_id, changes, metadata, created_at')
      .eq('tenant_id', params.tenantId)
      .order('created_at', { ascending: false })
      .limit(params.limit + 1)

    if (params.filters.action) {
      dataQuery = dataQuery.eq('action', params.filters.action)
    }

    if (params.filters.resourceType) {
      dataQuery = dataQuery.eq('resource_type', params.filters.resourceType)
    }

    if (params.filters.userId) {
      dataQuery = dataQuery.eq('user_id', params.filters.userId)
    }

    if (params.filters.from) {
      dataQuery = dataQuery.gte('created_at', params.filters.from)
    }

    if (params.filters.to) {
      dataQuery = dataQuery.lte('created_at', params.filters.to)
    }

    if (params.filters.query) {
      const escaped = params.filters.query.replace(/,/g, ' ')
      dataQuery = dataQuery.or(
        `action.ilike.%${escaped}%,resource_type.ilike.%${escaped}%,resource_id.ilike.%${escaped}%,user_id.ilike.%${escaped}%`
      )
    }

    if (params.cursor) {
      const createdAtCursor = decodeCursor(params.cursor)
      dataQuery = dataQuery.lt('created_at', createdAtCursor)
    }

    const { data, error } = await dataQuery

    if (error) {
      throw new DatabaseError('Failed to load audit logs', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const rows = ((data ?? []) as AuditLogRow[]).map(
      (row): AuditViewerLogItem => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        changes: row.changes,
        metadata: row.metadata,
        createdAt: row.created_at,
      })
    )

    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1].createdAt) : null

    return {
      items,
      cursor: nextCursor,
      limit: params.limit,
      total: count ?? 0,
    }
  }
}

export const supabaseAdminAuditViewerRepository = new SupabaseAdminAuditViewerRepository()
