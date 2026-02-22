import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { getAdminQueryService } from '@/core/registry/service-registry'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(errorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const adminQueryService = getAdminQueryService()
    const users = await adminQueryService.listUsers(session)

    return NextResponse.json(okResponse({ users }))
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load users'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
