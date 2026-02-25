import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractQueryService } from '@/core/registry/service-registry'
import { contractSigningPreparationDraftSchema } from '@/core/domain/contracts/schemas'
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

    const payload = contractSigningPreparationDraftSchema.parse(await request.json())

    const contractQueryService = getContractQueryService()
    const draft = await contractQueryService.saveSigningPreparationDraft({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      recipients: payload.recipients.map((recipient) => ({
        name: recipient.name,
        email: recipient.email,
        recipientType: recipient.recipient_type,
        routingOrder: recipient.routing_order,
      })),
      fields: payload.fields.map((field) => ({
        fieldType: field.field_type,
        pageNumber: field.page_number ?? null,
        xPosition: field.x_position ?? null,
        yPosition: field.y_position ?? null,
        anchorString: field.anchor_string ?? null,
        assignedSignerEmail: field.assigned_signer_email,
      })),
    })

    return NextResponse.json(okResponse(draft))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid signing preparation draft payload'), {
        status: 400,
      })
    }

    logger.error('Contract signing preparation draft save failed', {
      error: error instanceof Error ? error.message : String(error),
      contractId: params?.contractId,
      tenantId: session.tenantId,
      employeeId: session.employeeId,
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to save signing preparation draft'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

const GETHandler = withAuth(async (_request: NextRequest, { session, params }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const contractQueryService = getContractQueryService()
    const draft = await contractQueryService.getSigningPreparationDraft({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
    })

    return NextResponse.json(okResponse(draft))
  } catch (error) {
    logger.error('Contract signing preparation draft load failed', {
      error: error instanceof Error ? error.message : String(error),
      contractId: params?.contractId,
      tenantId: session.tenantId,
      employeeId: session.employeeId,
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to load signing preparation draft'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
export const GET = GETHandler
