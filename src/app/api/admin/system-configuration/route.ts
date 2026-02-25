import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { appConfig } from '@/core/config/app-config'
import { adminErrorResponse, adminOkResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { getSystemConfigurationService } from '@/core/registry/service-registry'
import { systemConfigurationRequestSchema } from '@/core/domain/admin/schemas'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  void _request
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const systemConfigurationService = getSystemConfigurationService()
    const config = await systemConfigurationService.getConfiguration(session)

    return NextResponse.json(adminOkResponse({ config }, { cursor: null, limit: 1, total: 1 }))
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load system configuration'
    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

const PATCHHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const payload = systemConfigurationRequestSchema.parse(await request.json())

    const systemConfigurationService = getSystemConfigurationService()
    const config = await systemConfigurationService.updateConfiguration({
      session,
      config: {
        featureFlags: payload.featureFlags,
        securitySessionPolicies: payload.securitySessionPolicies,
        defaults: payload.defaults,
      },
      reason: payload.reason,
    })

    return NextResponse.json(adminOkResponse({ config }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid system configuration payload'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to update system configuration'
    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const GET = GETHandler
export const PATCH = PATCHHandler
