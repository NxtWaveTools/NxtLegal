import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractApprovalNotificationService, getContractQueryService } from '@/core/registry/service-registry'
import { contractActionSchema } from '@/core/domain/contracts/schemas'

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const tenantId = session.tenantId

    const contractId = params?.contractId

    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractActionSchema.parse(await request.json())

    const contractQueryService = getContractQueryService()
    const contractView = await contractQueryService.applyContractAction({
      tenantId,
      contractId,
      action: payload.action,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      actorEmail: session.email ?? '',
      noteText: payload.noteText,
    })

    const contractApprovalNotificationService = getContractApprovalNotificationService()

    if (payload.action === 'hod.approve') {
      await contractApprovalNotificationService.notifyApprovalReceived({
        tenantId,
        contractId,
        actorEmployeeId: session.employeeId,
        actorRole: session.role,
        event: 'HOD_APPROVED',
        legalOwnerEmail: contractView.contract.currentAssigneeEmail,
      })
    }

    if (payload.action === 'approver.approve') {
      await contractApprovalNotificationService.notifyApprovalReceived({
        tenantId,
        contractId,
        actorEmployeeId: session.employeeId,
        actorRole: session.role,
        event: 'ADDITIONAL_APPROVED',
        legalOwnerEmail: contractView.contract.currentAssigneeEmail,
      })
    }

    if (payload.action === 'legal.query.reroute') {
      await contractApprovalNotificationService.notifyReturnedToHod({
        tenantId,
        contractId,
        actorEmployeeId: session.employeeId,
        actorRole: session.role,
        hodEmail: contractView.contract.currentAssigneeEmail,
      })
    }

    if (payload.action === 'legal.reject' || payload.action === 'hod.reject') {
      await contractApprovalNotificationService.notifyContractRejected({
        tenantId,
        contractId,
        actorEmployeeId: session.employeeId,
        actorRole: session.role,
        recipientEmails: [contractView.contract.uploadedByEmail, contractView.contract.departmentHodEmail ?? ''],
        trigger: payload.action === 'legal.reject' ? 'LEGAL_REJECTION' : 'HOD_REJECTED',
      })
    }

    return NextResponse.json(okResponse(contractView))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid contract action payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to apply contract action'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
