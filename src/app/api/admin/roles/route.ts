import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { adminErrorResponse, adminOkResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { getAdminQueryService } from '@/core/registry/service-registry'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const adminQueryService = getAdminQueryService()
    const roles = await adminQueryService.listRoles(session)

    return NextResponse.json(adminOkResponse({ roles }, { cursor: null, limit: roles.length, total: roles.length }))
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load roles'

    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const GET = GETHandler
