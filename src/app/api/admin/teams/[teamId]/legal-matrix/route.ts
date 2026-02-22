import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { legalMatrixRequestSchema, teamPathSchema } from '@/core/domain/admin/schemas'
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

    const payload = legalMatrixRequestSchema.parse(await request.json())

    const teamGovernanceService = getTeamGovernanceService()
    const legalMatrix = await teamGovernanceService.setLegalMatrix({
      session,
      teamId: parsedParams.teamId,
      legalUserIds: payload.legalUserIds,
      reason: payload.reason,
    })

    return NextResponse.json(okResponse({ legalMatrix }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid legal matrix payload'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to update legal matrix'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const PUT = PUTHandler
