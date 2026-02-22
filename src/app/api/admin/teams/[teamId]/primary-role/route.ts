import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { assignPrimaryRoleRequestSchema, teamPathSchema } from '@/core/domain/admin/schemas'
import { getTeamGovernanceService } from '@/core/registry/service-registry'

const PUTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(errorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const parsedParams = teamPathSchema.parse({
      teamId: params?.teamId,
    })

    const payload = assignPrimaryRoleRequestSchema.parse(await request.json())

    const teamGovernanceService = getTeamGovernanceService()
    const assignment = await teamGovernanceService.assignPrimaryRole({
      session,
      teamId: parsedParams.teamId,
      roleType: payload.roleType,
      userId: payload.userId,
      reason: payload.reason,
    })

    return NextResponse.json(okResponse({ assignment }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid primary role assignment payload'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to assign primary team role'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const PUT = PUTHandler
