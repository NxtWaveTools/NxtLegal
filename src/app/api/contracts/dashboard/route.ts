import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { dashboardContractsQuerySchema } from '@/core/domain/contracts/schemas'

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const { filter, cursor, limit } = dashboardContractsQuerySchema.parse(queryParams)

    const contractQueryService = getContractQueryService()
    const result = await contractQueryService.getDashboardContracts({
      tenantId: session.tenantId,
      employeeId: session.employeeId,
      role: session.role,
      filter,
      cursor,
      limit,
    })

    return NextResponse.json(
      okResponse({
        filter,
        contracts: result.items,
        pagination: {
          cursor: result.nextCursor ?? null,
          limit,
          total: result.total,
        },
      })
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid dashboard contracts query params'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to list dashboard contracts'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
