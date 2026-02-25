import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { appConfig } from '@/core/config/app-config'
import { adminErrorResponse, adminOkResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { auditViewerQuerySchema } from '@/core/domain/admin/schemas'
import { getAuditViewerService } from '@/core/registry/service-registry'

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const query = auditViewerQuerySchema.parse({
      action: request.nextUrl.searchParams.get('action') ?? undefined,
      resourceType: request.nextUrl.searchParams.get('resourceType') ?? undefined,
      userId: request.nextUrl.searchParams.get('userId') ?? undefined,
      query: request.nextUrl.searchParams.get('query') ?? undefined,
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
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
      cursor: query.cursor,
      limit: query.limit,
    })

    return NextResponse.json(
      adminOkResponse(
        {
          logs: result.items,
        },
        {
          cursor: result.cursor,
          limit: result.limit,
          total: result.total,
        }
      )
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid audit log query parameters'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load audit logs'
    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const GET = GETHandler
