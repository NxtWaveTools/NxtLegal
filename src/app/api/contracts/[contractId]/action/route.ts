import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import {
  getContractApprovalNotificationService,
  getContractQueryService,
  getIdempotencyService,
  getContractSignatoryService,
} from '@/core/registry/service-registry'
import { contractActionCommandSchema, bypassApprovalActionName } from '@/core/domain/contracts/schemas'
import { contractWorkflowRoles } from '@/core/constants/contracts'
import { logger } from '@/core/infra/logging/logger'

const dispatchNotificationInBackground = (notification: Promise<unknown>, event: string, contractId: string): void => {
  void notification.catch((error) => {
    logger.warn('Contract action notification dispatch failed', {
      event,
      contractId,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  let shouldReleaseClaim = false

  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const tenantId = session.tenantId

    const contractId = params?.contractId

    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractActionCommandSchema.parse(await request.json())

    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim()
    if (idempotencyKey) {
      const idempotencyService = getIdempotencyService()
      const claimResult = await idempotencyService.claimOrGet(idempotencyKey, tenantId)

      if (claimResult.status === 'cached') {
        return NextResponse.json(claimResult.record.responseData, { status: claimResult.record.statusCode })
      }

      if (claimResult.status === 'in-progress') {
        return NextResponse.json(
          errorResponse('IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is already in progress'),
          { status: 409 }
        )
      }

      shouldReleaseClaim = true
    }

    const contractQueryService = getContractQueryService()

    const contractView =
      payload.action === bypassApprovalActionName
        ? await (() => {
            if (session.role !== contractWorkflowRoles.legalTeam && session.role !== contractWorkflowRoles.admin) {
              return NextResponse.json(
                errorResponse('CONTRACT_ACTION_FORBIDDEN', 'Only LEGAL_TEAM or ADMIN can bypass approvals'),
                { status: 403 }
              )
            }

            return contractQueryService.bypassAdditionalApprover({
              tenantId,
              contractId,
              approverId: payload.approverId,
              actorEmployeeId: session.employeeId,
              actorRole: session.role,
              actorEmail: session.email ?? '',
              reason: payload.reason,
            })
          })()
        : await contractQueryService.applyContractAction({
            tenantId,
            contractId,
            action: payload.action,
            actorEmployeeId: session.employeeId,
            actorRole: session.role,
            actorEmail: session.email ?? '',
            noteText: payload.noteText,
          })

    if (contractView instanceof NextResponse) {
      return contractView
    }

    const contractApprovalNotificationService = getContractApprovalNotificationService()

    if (payload.action !== bypassApprovalActionName && payload.action === 'hod.approve') {
      dispatchNotificationInBackground(
        contractApprovalNotificationService.notifyApprovalReceived({
          tenantId,
          contractId,
          actorEmployeeId: session.employeeId,
          actorRole: session.role,
          event: 'HOD_APPROVED',
          legalOwnerEmail: contractView.contract.currentAssigneeEmail,
        }),
        'HOD_APPROVED',
        contractId
      )
    }

    if (payload.action !== bypassApprovalActionName && payload.action === 'approver.approve') {
      dispatchNotificationInBackground(
        contractApprovalNotificationService.notifyApprovalReceived({
          tenantId,
          contractId,
          actorEmployeeId: session.employeeId,
          actorRole: session.role,
          event: 'ADDITIONAL_APPROVED',
          legalOwnerEmail: contractView.contract.currentAssigneeEmail,
        }),
        'ADDITIONAL_APPROVED',
        contractId
      )
    }

    if (payload.action !== bypassApprovalActionName && payload.action === 'legal.query.reroute') {
      dispatchNotificationInBackground(
        contractApprovalNotificationService.notifyReturnedToHod({
          tenantId,
          contractId,
          actorEmployeeId: session.employeeId,
          actorRole: session.role,
          hodEmail: contractView.contract.currentAssigneeEmail,
        }),
        'REROUTED_TO_HOD',
        contractId
      )
    }

    if (
      payload.action !== bypassApprovalActionName &&
      (payload.action === 'legal.reject' || payload.action === 'hod.reject')
    ) {
      dispatchNotificationInBackground(
        contractApprovalNotificationService.notifyContractRejected({
          tenantId,
          contractId,
          actorEmployeeId: session.employeeId,
          actorRole: session.role,
          recipientEmails: [
            contractView.contract.uploadedByEmail,
            contractView.contract.currentAssigneeEmail || contractView.contract.departmentHodEmail || '',
          ],
          trigger: payload.action === 'legal.reject' ? 'LEGAL_REJECTION' : 'HOD_REJECTED',
        }),
        payload.action === 'legal.reject' ? 'LEGAL_REJECTION' : 'HOD_REJECTED',
        contractId
      )
    }

    if (payload.action !== bypassApprovalActionName && payload.action === 'legal.void') {
      const envelopeIds = Array.from(
        new Set(contractView.signatories.map((item) => item.zohoSignEnvelopeId?.trim()).filter(Boolean) as string[])
      )

      if (envelopeIds.length > 0) {
        const contractSignatoryService = getContractSignatoryService()
        dispatchNotificationInBackground(
          contractSignatoryService.recallSigningEnvelopes({
            tenantId,
            contractId,
            envelopeIds,
            actorEmployeeId: session.employeeId,
            actorRole: session.role,
            actorEmail: session.email ?? '',
            reason: payload.noteText,
          }),
          'LEGAL_VOID_ZOHO_RECALL',
          contractId
        )
      }
    }

    const responseData = okResponse(contractView)

    if (idempotencyKey) {
      const idempotencyService = getIdempotencyService()
      await idempotencyService.store(idempotencyKey, tenantId, responseData, 200)
      shouldReleaseClaim = false
    }

    return NextResponse.json(responseData)
  } catch (error) {
    const tenantId = session.tenantId
    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim()
    if (tenantId && idempotencyKey && shouldReleaseClaim) {
      try {
        const idempotencyService = getIdempotencyService()
        await idempotencyService.releaseClaim(idempotencyKey, tenantId)
      } catch {
        // noop - keep original failure path
      }
    }

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
