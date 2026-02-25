import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { appConfig } from '@/core/config/app-config'
import { adminErrorResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { auditViewerExportQuerySchema } from '@/core/domain/admin/schemas'
import { getAuditViewerService } from '@/core/registry/service-registry'

const buildCsv = (rows: Array<Record<string, unknown>>): string => {
  const header = ['id', 'createdAt', 'userId', 'action', 'resourceType', 'resourceId', 'changes', 'metadata']
  const escaped = (value: unknown): string => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '')
    const normalized = raw.replace(/"/g, '""')
    return `"${normalized}"`
  }

  const body = rows.map((row) =>
    [row.id, row.createdAt, row.userId, row.action, row.resourceType, row.resourceId, row.changes, row.metadata]
      .map((value) => escaped(value))
      .join(',')
  )

  return [header.join(','), ...body].join('\n')
}

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const query = auditViewerExportQuerySchema.parse({
      action: request.nextUrl.searchParams.get('action') ?? undefined,
      resourceType: request.nextUrl.searchParams.get('resourceType') ?? undefined,
      userId: request.nextUrl.searchParams.get('userId') ?? undefined,
      query: request.nextUrl.searchParams.get('query') ?? undefined,
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })

    const auditViewerService = getAuditViewerService()
    const result = await auditViewerService.listLogs({
      session,
      filters: {
        action: query.action,
        resourceType: query.resourceType,
        userId: query.userId,
        query: query.query,
        from: query.from,
        to: query.to,
      },
      limit: query.limit,
    })

    const csv = buildCsv(result.items)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-logs.csv"',
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid audit export query parameters'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to export audit logs'
    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const GET = GETHandler
