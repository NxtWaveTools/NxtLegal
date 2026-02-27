import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { contractLegalMetadataSchema } from '@/core/domain/contracts/schemas'

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractLegalMetadataSchema.parse(await request.json())

    const contractQueryService = getContractQueryService()
    const contractView = await contractQueryService.updateLegalMetadata({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      actorEmail: session.email ?? '',
      metadata: {
        effectiveDate: payload.effectiveDate,
        terminationDate: payload.terminationDate,
        noticePeriod: payload.noticePeriod,
        autoRenewal: payload.autoRenewal,
      },
    })

    return NextResponse.json(okResponse(contractView))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid legal metadata payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to update legal metadata'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
