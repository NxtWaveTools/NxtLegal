import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractApprovalNotificationService, getContractQueryService } from '@/core/registry/service-registry'
import { contractLegalAssignmentSchema } from '@/core/domain/contracts/schemas'
import { logger } from '@/core/infra/logging/logger'

const dispatchNotificationInBackground = (notification: Promise<unknown>, contractId: string): void => {
  void notification.catch((error) => {
    logger.warn('Legal assignment notification dispatch failed', {
      contractId,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractLegalAssignmentSchema.parse(await request.json())
    const contractQueryService = getContractQueryService()
    const contractView = await contractQueryService.manageLegalAssignment({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      actorEmail: session.email ?? '',
      operation: payload.operation,
      collaboratorEmail: 'collaboratorEmail' in payload ? payload.collaboratorEmail : undefined,
    })

    const contractApprovalNotificationService = getContractApprovalNotificationService()
    if (payload.operation === 'add_collaborator') {
      dispatchNotificationInBackground(
        contractApprovalNotificationService.notifyInternalAssignment({
          tenantId: session.tenantId,
          contractId,
          actorEmployeeId: session.employeeId,
          actorRole: session.role,
          assignedEmail: payload.collaboratorEmail,
          contractTitle: contractView.contract.title,
        }),
        contractId
      )
    }

    return NextResponse.json(okResponse(contractView))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid legal assignment payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to update legal assignment'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
