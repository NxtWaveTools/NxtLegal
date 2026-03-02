import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { dashboardCountsQuerySchema } from '@/core/domain/contracts/schemas'
import { contractWorkflowRoles } from '@/core/constants/contracts'
import { logger } from '@/core/infra/logging/logger'

type DashboardContractsFilter = 'ALL' | 'HOD_PENDING' | 'UNDER_REVIEW' | 'COMPLETED' | 'ON_HOLD' | 'ASSIGNED_TO_ME'
type DashboardContractsScope = 'default' | 'personal'

/**
 * Compute the correct query scope for a given filter + session role.
 * Mirrors the resolveFilterScope / approveScope logic in DashboardClient.tsx
 * so the server can batch-count all tabs in one round-trip.
 */
function resolveScope(role: string | undefined, filter: DashboardContractsFilter): DashboardContractsScope {
  if (role === contractWorkflowRoles.admin && filter === 'ASSIGNED_TO_ME') {
    return 'personal'
  }
  return 'default'
}

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const { filters } = dashboardCountsQuerySchema.parse(queryParams)

    const contractQueryService = getContractQueryService()

    // Run all count queries in parallel — each fetches limit=1 just to get the total.
    const results = await Promise.all(
      filters.map(async (filter) => {
        const scope = resolveScope(session.role, filter)
        const count = await contractQueryService.getDashboardFilterCount({
          tenantId: session.tenantId!,
          employeeId: session.employeeId,
          role: session.role,
          filter,
          scope,
        })
        return { filter, count }
      })
    )

    const counts: Partial<Record<DashboardContractsFilter, number>> = {}
    for (const { filter, count } of results) {
      counts[filter] = count
    }

    return NextResponse.json(okResponse({ counts }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid dashboard counts query params'), {
        status: 400,
      })
    }

    logger.error('Failed to batch-fetch dashboard counts', {
      path: request.nextUrl.pathname,
      query: request.nextUrl.search,
      employeeId: session.employeeId,
      tenantId: session.tenantId,
      role: session.role,
      error: error instanceof Error ? error.message : String(error),
      isAppError: isAppError(error),
      code: isAppError(error) ? error.code : undefined,
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to batch-fetch dashboard counts'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
