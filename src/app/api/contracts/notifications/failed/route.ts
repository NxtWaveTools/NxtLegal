import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { failedContractNotificationsQuerySchema } from '@/core/domain/contracts/schemas'

const ALLOWED_ROLES = new Set(['LEGAL_TEAM', 'ADMIN'])

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    if (!session.role || !ALLOWED_ROLES.has(session.role)) {
      return NextResponse.json(errorResponse('CONTRACT_NOTIFICATION_READ_FORBIDDEN', 'Access denied'), { status: 403 })
    }

    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const { cursor, limit, contractId } = failedContractNotificationsQuerySchema.parse(queryParams)

    const contractQueryService = getContractQueryService()
    const result = await contractQueryService.listFailedNotificationDeliveries({
      tenantId: session.tenantId,
      cursor,
      limit,
      contractId,
    })

    return NextResponse.json(
      okResponse({
        items: result.items,
        pagination: {
          cursor: result.nextCursor ?? null,
          limit,
          total: result.total,
        },
      })
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid failed notifications query params'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to list failed notification deliveries'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
