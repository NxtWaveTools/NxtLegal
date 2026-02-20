import { NextResponse, type NextRequest } from 'next/server'
import { getContractUploadService, getIdempotencyService } from '@/core/registry/service-registry'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { logger } from '@/core/infra/logging/logger'
import { isAppError } from '@/core/http/errors'

const POSTHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    if (!session.email || !session.role) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session is missing required user details'), {
        status: 401,
      })
    }

    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim()
    if (!idempotencyKey) {
      return NextResponse.json(errorResponse('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'), {
        status: 400,
      })
    }

    const idempotencyService = getIdempotencyService()
    const existingResponse = await idempotencyService.getIfExists(idempotencyKey, session.tenantId)
    if (existingResponse) {
      return NextResponse.json(existingResponse.responseData, { status: existingResponse.statusCode })
    }

    const formData = await request.formData()
    const title = String(formData.get('title') ?? '').trim()
    const uploadedFile = formData.get('file')

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(errorResponse('CONTRACT_FILE_REQUIRED', 'A file is required for contract upload'), {
        status: 400,
      })
    }

    const fileArrayBuffer = await uploadedFile.arrayBuffer()
    const fileBytes = new Uint8Array(fileArrayBuffer)

    const contractUploadService = getContractUploadService()
    const contract = await contractUploadService.uploadContract({
      tenantId: session.tenantId,
      uploadedByEmployeeId: session.employeeId,
      uploadedByEmail: session.email,
      uploadedByRole: session.role,
      title,
      fileName: uploadedFile.name,
      fileSizeBytes: uploadedFile.size,
      fileMimeType: uploadedFile.type || 'application/octet-stream',
      fileBytes,
    })

    logger.info('Contract uploaded successfully', {
      tenantId: session.tenantId,
      contractId: contract.id,
      userId: session.employeeId,
      role: session.role,
    })

    const responseData = okResponse({
      contract: {
        id: contract.id,
        title: contract.title,
        status: contract.status,
        currentAssigneeEmployeeId: contract.currentAssigneeEmployeeId,
        currentAssigneeEmail: contract.currentAssigneeEmail,
        fileName: contract.fileName,
        fileSizeBytes: contract.fileSizeBytes,
      },
    })

    await idempotencyService.store(idempotencyKey, session.tenantId, responseData, 201)

    return NextResponse.json(responseData, { status: 201 })
  } catch (error) {
    logger.error('Contract upload failed', {
      error: String(error),
      errorCode: isAppError(error) ? error.code : 'INTERNAL_ERROR',
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to upload contract'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
