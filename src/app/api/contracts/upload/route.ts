import { NextResponse, type NextRequest } from 'next/server'
import { getContractUploadService, getIdempotencyService } from '@/core/registry/service-registry'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { logger } from '@/core/infra/logging/logger'
import { isAppError } from '@/core/http/errors'
import { z } from 'zod'

const uploadContractFormSchema = z.object({
  title: z.string().trim().min(1, 'Contract title is required').max(200, 'Contract title exceeds maximum length'),
  contractTypeId: z.string().trim().uuid('Valid contractTypeId is required'),
  signatoryName: z.string().trim().min(1, 'Signatory name is required').max(200, 'Signatory name is too long'),
  signatoryDesignation: z
    .string()
    .trim()
    .min(1, 'Signatory designation is required')
    .max(200, 'Signatory designation is too long'),
  signatoryEmail: z.string().trim().toLowerCase().email('Valid signatory email is required'),
  backgroundOfRequest: z
    .string()
    .trim()
    .min(1, 'Background of request is required')
    .max(4000, 'Background of request exceeds maximum length'),
  departmentId: z.string().trim().uuid('Valid departmentId is required'),
  budgetApproved: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

const POSTHandler = withAuth(async (request: NextRequest, { session }) => {
  let shouldReleaseClaim = false

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

    const formData = await request.formData()
    const parsedForm = uploadContractFormSchema.safeParse({
      title: String(formData.get('title') ?? ''),
      contractTypeId: String(formData.get('contractTypeId') ?? ''),
      signatoryName: String(formData.get('signatoryName') ?? ''),
      signatoryDesignation: String(formData.get('signatoryDesignation') ?? ''),
      signatoryEmail: String(formData.get('signatoryEmail') ?? ''),
      backgroundOfRequest: String(formData.get('backgroundOfRequest') ?? ''),
      departmentId: String(formData.get('departmentId') ?? ''),
      budgetApproved: formData.get('budgetApproved') ? String(formData.get('budgetApproved')) : undefined,
    })

    if (!parsedForm.success) {
      return NextResponse.json(
        errorResponse('VALIDATION_ERROR', parsedForm.error.issues[0]?.message ?? 'Invalid input'),
        {
          status: 400,
        }
      )
    }

    const uploadedFile = formData.get('file')

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(errorResponse('CONTRACT_FILE_REQUIRED', 'A file is required for contract upload'), {
        status: 400,
      })
    }

    const idempotencyService = getIdempotencyService()
    const claimResult = await idempotencyService.claimOrGet(idempotencyKey, session.tenantId)
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

    const fileArrayBuffer = await uploadedFile.arrayBuffer()
    const fileBytes = new Uint8Array(fileArrayBuffer)

    const contractUploadService = getContractUploadService()
    const contract = await contractUploadService.uploadContract({
      tenantId: session.tenantId,
      uploadedByEmployeeId: session.employeeId,
      uploadedByEmail: session.email,
      uploadedByRole: session.role,
      title: parsedForm.data.title,
      contractTypeId: parsedForm.data.contractTypeId,
      signatoryName: parsedForm.data.signatoryName,
      signatoryDesignation: parsedForm.data.signatoryDesignation,
      signatoryEmail: parsedForm.data.signatoryEmail,
      backgroundOfRequest: parsedForm.data.backgroundOfRequest,
      departmentId: parsedForm.data.departmentId,
      budgetApproved: parsedForm.data.budgetApproved,
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
    shouldReleaseClaim = false

    return NextResponse.json(responseData, { status: 201 })
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
