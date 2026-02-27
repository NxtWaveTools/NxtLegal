import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractApprovalNotificationService, getContractQueryService } from '@/core/registry/service-registry'
import { contractApproverSchema } from '@/core/domain/contracts/schemas'

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractApproverSchema.parse(await request.json())
    const contractQueryService = getContractQueryService()
    const contractView = await contractQueryService.addAdditionalApprover({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      actorEmail: session.email ?? '',
      approverEmail: payload.approverEmail,
    })

    const contractApprovalNotificationService = getContractApprovalNotificationService()
    await contractApprovalNotificationService.notifyAdditionalApproverAdded({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      approverEmail: payload.approverEmail,
    })

    return NextResponse.json(okResponse(contractView))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid approver payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to add additional approver'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
