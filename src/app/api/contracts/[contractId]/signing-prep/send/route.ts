import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { BusinessRuleError, isAppError } from '@/core/http/errors'
import { getContractSignatoryService } from '@/core/registry/service-registry'
import { logger } from '@/core/infra/logging/logger'

const POSTHandler = withAuth(async (_request: NextRequest, { session, params }) => {
  const routeStartedAt = Date.now()
  const elapsedMs = () => Date.now() - routeStartedAt

  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const contractSignatoryService = getContractSignatoryService()
    const result = await contractSignatoryService.sendSigningPreparationDraft({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      actorEmail: session.email ?? '',
    })

    logger.info('Contract signing preparation sent', {
      contractId,
      tenantId: session.tenantId,
      employeeId: session.employeeId,
      envelopeId: result.envelopeId,
      signatoryCount: result.contractView.signatories.length,
      contractStatus: result.contractView.contract.status,
      currentDocumentId: result.contractView.contract.currentDocumentId,
      elapsedMs: elapsedMs(),
    })

    return NextResponse.json(okResponse(result))
  } catch (error) {
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

    logger.error('Contract signing preparation send failed', {
      error: error instanceof Error ? error.message : String(error),
      errorDetails,
      stack: error instanceof Error ? error.stack : undefined,
      contractId: params?.contractId,
      tenantId: session.tenantId,
      employeeId: session.employeeId,
      elapsedMs: elapsedMs(),
    })

    if (error instanceof BusinessRuleError) {
      return NextResponse.json(errorResponse(error.code, error.message), { status: error.statusCode })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to send signing preparation draft'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
