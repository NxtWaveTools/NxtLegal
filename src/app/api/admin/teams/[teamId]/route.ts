import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { adminErrorResponse, adminOkResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { teamPathSchema, updateDepartmentRequestSchema } from '@/core/domain/admin/schemas'
import { getTeamGovernanceService } from '@/core/registry/service-registry'

const PATCHHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const parsedParams = teamPathSchema.parse({
      teamId: params?.teamId,
    })

    const payload = updateDepartmentRequestSchema.parse(await request.json())

    const teamGovernanceService = getTeamGovernanceService()
    const department = await teamGovernanceService.updateDepartment({
      session,
      teamId: parsedParams.teamId,
      operation: payload.operation,
      name: payload.name,
      reason: payload.reason,
    })

    return NextResponse.json(adminOkResponse({ department }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid department update payload'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to update department'

    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const PATCH = PATCHHandler
