import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { adminErrorResponse, adminOkResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { createUserRequestSchema, usersQuerySchema } from '@/core/domain/admin/schemas'
import { getAdminQueryService } from '@/core/registry/service-registry'

const GETHandler = withAuth<unknown>(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const adminQueryService = getAdminQueryService()
    const query = usersQuerySchema.parse({
      groupBy: request.nextUrl.searchParams.get('groupBy') ?? undefined,
    })

    if (query.groupBy === 'department') {
      const departments = await adminQueryService.listUsersGroupedByDepartment(session)
      return NextResponse.json(
        adminOkResponse({ departments }, { cursor: null, limit: departments.length, total: departments.length })
      )
    }

    const users = await adminQueryService.listUsers(session)

    return NextResponse.json(adminOkResponse({ users }, { cursor: null, limit: users.length, total: users.length }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid users query parameters'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load users'

    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

const POSTHandler = withAuth<unknown>(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const payload = createUserRequestSchema.parse(await request.json())
    const adminQueryService = getAdminQueryService()
    const user = await adminQueryService.createUser({
      session,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
      isActive: payload.isActive,
    })

    return NextResponse.json(adminOkResponse({ user }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid user creation payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to create user'

    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const GET = GETHandler
export const POST = POSTHandler
