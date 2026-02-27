import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { DatabaseError } from '@/core/http/errors'
import type {
  AuditViewerFilters,
  AuditViewerExportChunkResult,
  AuditViewerListResult,
  AuditViewerLogItem,
  IAuditViewerRepository,
} from '@/core/domain/admin/audit-viewer-service'

type AuditLogRow = {
  id: string
  user_id: string
  action: string
  event_type: string | null
  actor_email: string | null
  actor_role: string | null
  target_email: string | null
  note_text: string | null
  resource_type: string
  resource_id: string
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type ActorUserRow = {
  id: string
  email: string
  full_name: string | null
}

const encodeCursor = (createdAt: string): string => Buffer.from(createdAt, 'utf8').toString('base64url')
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8')

class SupabaseAdminAuditViewerRepository implements IAuditViewerRepository {
  private readonly supabase = createServiceSupabase()

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }

  private async enrichRows(params: { tenantId: string; auditRows: AuditLogRow[] }): Promise<AuditViewerLogItem[]> {
    const actorUserIds = Array.from(
      new Set(params.auditRows.map((row) => row.user_id).filter((userId) => this.isUuid(userId)))
    )

    const actorById = new Map<string, ActorUserRow>()
    if (actorUserIds.length > 0) {
      const { data: actorUsers, error: actorUsersError } = await this.supabase
        .from('users')
        .select('id, email, full_name')
        .eq('tenant_id', params.tenantId)
        .is('deleted_at', null)
        .in('id', actorUserIds)

      if (actorUsersError) {
        throw new DatabaseError('Failed to resolve audit actor users', undefined, {
          errorCode: actorUsersError.code,
          errorMessage: actorUsersError.message,
        })
      }

      for (const actor of (actorUsers ?? []) as ActorUserRow[]) {
        actorById.set(actor.id, actor)
      }
    }

    return params.auditRows.map((row): AuditViewerLogItem => {
      const actor = actorById.get(row.user_id)

      return {
        id: row.id,
        userId: row.user_id,
        action: row.action,
        eventType: row.event_type,
        actorEmail: row.actor_email,
        actorRole: row.actor_role,
        targetEmail: row.target_email,
        noteText: row.note_text,
        actorName: actor?.full_name ?? null,
        actorResolvedEmail: actor?.email ?? null,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        changes: row.changes,
        metadata: row.metadata,
        createdAt: row.created_at,
      }
    })
  }

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
      .select(
        'id, user_id, action, event_type, actor_email, actor_role, target_email, note_text, resource_type, resource_id, changes, metadata, created_at'
      )
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

    const rows = await this.enrichRows({
      tenantId: params.tenantId,
      auditRows: (data ?? []) as AuditLogRow[],
    })

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

  async listExportChunk(params: {
    tenantId: string
    filters: AuditViewerFilters
    cursor?: string
    limit: number
  }): Promise<AuditViewerExportChunkResult> {
    let dataQuery = this.supabase
      .from('audit_logs')
      .select(
        'id, user_id, action, event_type, actor_email, actor_role, target_email, note_text, resource_type, resource_id, changes, metadata, created_at'
      )
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
      throw new DatabaseError('Failed to load audit log export chunk', undefined, {
        errorCode: error.code,
        errorMessage: error.message,
      })
    }

    const rows = await this.enrichRows({
      tenantId: params.tenantId,
      auditRows: (data ?? []) as AuditLogRow[],
    })

    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1].createdAt) : null

    return {
      items,
      cursor: nextCursor,
      limit: params.limit,
    }
  }
}

export const supabaseAdminAuditViewerRepository = new SupabaseAdminAuditViewerRepository()
