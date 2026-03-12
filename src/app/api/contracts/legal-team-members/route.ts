import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const normalizedRole = (session.role ?? '').toUpperCase()
    if (normalizedRole !== 'LEGAL_TEAM' && normalizedRole !== 'ADMIN') {
      return NextResponse.json(
        errorResponse('CONTRACT_ASSIGNMENT_FORBIDDEN', 'Only legal team or admin can access members'),
        {
          status: 403,
        }
      )
    }

    const contractQueryService = getContractQueryService()
    const members = await contractQueryService.getActiveTenantLegalMembers({
      tenantId: session.tenantId,
    })

    return NextResponse.json(okResponse({ members }))
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load legal team members'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
