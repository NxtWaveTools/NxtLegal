import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { contractStatuses } from '@/core/constants/contracts'
import { getContractQueryService, getContractSignatoryService } from '@/core/registry/service-registry'
import { contractSignatorySchema } from '@/core/domain/contracts/schemas'
import { logger } from '@/core/infra/logging/logger'

const POSTHandler = withAuth(async (request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const payload = contractSignatorySchema.parse(await request.json())

    const contractQueryService = getContractQueryService()
    const contractView = await contractQueryService.getContractDetail({
      tenantId: session.tenantId,
      contractId,
      employeeId: session.employeeId,
      role: session.role,
    })

    const allowedSigningPrepStatuses: string[] = [contractStatuses.underReview, contractStatuses.completed]
    if (!allowedSigningPrepStatuses.includes(contractView.contract.status)) {
      return NextResponse.json(
        errorResponse(
          'SIGNATORY_ASSIGN_INVALID_STATUS',
          'Signatories can only be assigned in UNDER_REVIEW or COMPLETED'
        ),
        { status: 409 }
      )
    }

    const contractSignatoryService = getContractSignatoryService()
    const updatedContractView = await contractSignatoryService.assignSignatory({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      actorEmail: session.email ?? '',
      recipients: payload.recipients,
    })

    return NextResponse.json(okResponse(updatedContractView))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid signatory payload'), { status: 400 })
    }

    if (
      error instanceof Error &&
      (error.message.includes('Zoho Sign config is incomplete') || error.message.includes('Brevo config is incomplete'))
    ) {
      return NextResponse.json(
        errorResponse('SIGNATORY_PROVIDER_NOT_CONFIGURED', 'Signatory provider integration is not configured'),
        { status: 503 }
      )
    }

    // Include original error details when available to aid debugging
    const errorDetails = (() => {
      if (error && typeof error === 'object') {
        // ExternalServiceError stores originalError
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e: any = error
        if (e.originalError instanceof Error) {
          return { message: e.originalError.message, stack: e.originalError.stack }
        }
        if (error instanceof Error) {
          return { message: error.message, stack: error.stack }
        }
      }
      return { info: String(error) }
    })()

    logger.error('Contract signatory assignment failed', {
      error: error instanceof Error ? error.message : String(error),
      errorDetails,
      contractId: params?.contractId,
      tenantId: session.tenantId,
      employeeId: session.employeeId,
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to add signatory'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
