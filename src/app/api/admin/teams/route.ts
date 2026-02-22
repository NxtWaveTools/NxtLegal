import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { createDepartmentRequestSchema } from '@/core/domain/admin/schemas'
import { getTeamGovernanceService } from '@/core/registry/service-registry'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(errorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const teamGovernanceService = getTeamGovernanceService()
    const departments = await teamGovernanceService.listDepartments(session)

    return NextResponse.json(okResponse({ departments }))
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load departments'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

const POSTHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(errorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const payload = createDepartmentRequestSchema.parse(await request.json())
    const teamGovernanceService = getTeamGovernanceService()

    const department = await teamGovernanceService.createDepartment({
      session,
      name: payload.name,
      reason: payload.reason,
    })

    return NextResponse.json(okResponse({ department }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid department payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to create department'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
export const POST = POSTHandler
