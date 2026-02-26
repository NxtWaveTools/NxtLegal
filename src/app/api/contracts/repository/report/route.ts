import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { repositoryReportingQuerySchema } from '@/core/domain/contracts/schemas'

const repositoryReportingAllowedRoles = new Set(['LEGAL_TEAM', 'ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN'])

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const normalizedRole = (session.role ?? '').toUpperCase()
    if (!repositoryReportingAllowedRoles.has(normalizedRole)) {
      return NextResponse.json(errorResponse('FORBIDDEN', 'You are not allowed to access repository reporting'), {
        status: 403,
      })
    }

    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const { search, status, repositoryStatus, dateBasis, datePreset, fromDate, toDate } =
      repositoryReportingQuerySchema.parse(queryParams)

    const contractQueryService = getContractQueryService()
    const report = await contractQueryService.getRepositoryReport({
      tenantId: session.tenantId,
      employeeId: session.employeeId,
      role: session.role,
      search,
      status,
      repositoryStatus,
      dateBasis,
      datePreset,
      fromDate,
      toDate,
    })

    return NextResponse.json(okResponse({ report }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid repository report query params'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to generate repository report'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
