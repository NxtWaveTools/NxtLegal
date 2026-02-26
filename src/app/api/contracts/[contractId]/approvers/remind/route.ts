import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { contractNotificationPolicy } from '@/core/constants/contracts'
import { contractApproverReminderSchema } from '@/core/domain/contracts/schemas'
import { getContractApprovalNotificationService } from '@/core/registry/service-registry'

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractApproverReminderSchema.parse(await request.json())
    const contractApprovalNotificationService = getContractApprovalNotificationService()

    const result = await contractApprovalNotificationService.remindPendingApprover({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      requestedApproverEmail: payload.approverEmail,
    })

    if (result.blockedByCooldown) {
      return NextResponse.json(
        errorResponse(
          'REMINDER_COOLDOWN_ACTIVE',
          `Reminder already sent in last ${contractNotificationPolicy.approvalReminderCooldownHours} hours`
        ),
        { status: 429 }
      )
    }

    return NextResponse.json(
      okResponse({
        remindedApproverEmail: result.recipientEmail,
        remindedApproverRole: result.recipientRole,
      })
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid reminder payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to send reminder'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
