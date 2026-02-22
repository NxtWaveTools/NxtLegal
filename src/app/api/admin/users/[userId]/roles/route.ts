import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { getRoleGovernanceService } from '@/core/registry/service-registry'
import { adminGovernance } from '@/core/constants/admin-governance'
import { roleManagementPathSchema, roleManagementRequestSchema } from '@/core/domain/admin/schemas'

const PATCHHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(errorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const parsedParams = roleManagementPathSchema.parse({
      userId: params?.userId,
    })

    const payload = roleManagementRequestSchema.parse(await request.json())

    const roleGovernanceService = getRoleGovernanceService()
    const result = await roleGovernanceService.changeUserRole({
      session,
      targetUserId: parsedParams.userId,
      roleKey: payload.roleKey,
      operation: payload.operation,
      reason: payload.reason,
    })

    return NextResponse.json(
      okResponse({
        roleChange: result,
        reauthentication: result.changed
          ? {
              required: true,
              message: adminGovernance.sessionReauthMessage,
            }
          : {
              required: false,
              message: null,
            },
      })
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid role management payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to manage user role'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const PATCH = PATCHHandler
