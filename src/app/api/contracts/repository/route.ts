import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { repositoryContractsQuerySchema } from '@/core/domain/contracts/schemas'
import { logger } from '@/core/infra/logging/logger'

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const { cursor, limit, search, status, sortBy, sortDirection } = repositoryContractsQuerySchema.parse(queryParams)

    const contractQueryService = getContractQueryService()
    const result = await contractQueryService.listRepositoryContracts({
      tenantId: session.tenantId,
      employeeId: session.employeeId,
      role: session.role,
      cursor,
      limit,
      search,
      status,
      sortBy,
      sortDirection,
    })

    return NextResponse.json(
      okResponse({
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
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid repository contracts query params'), {
        status: 400,
      })
    }

    logger.error('Failed to list repository contracts', {
      path: request.nextUrl.pathname,
      query: request.nextUrl.search,
      employeeId: session.employeeId,
      tenantId: session.tenantId,
      role: session.role,
      error: error instanceof Error ? error.message : String(error),
      isAppError: isAppError(error),
      code: isAppError(error) ? error.code : undefined,
      statusCode: isAppError(error) ? error.statusCode : undefined,
      metadata: isAppError(error) ? error.metadata : undefined,
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to list repository contracts'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
