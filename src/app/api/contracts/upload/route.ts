import { NextResponse, type NextRequest } from 'next/server'
import {
  getContractApprovalNotificationService,
  getContractUploadService,
  getIdempotencyService,
} from '@/core/registry/service-registry'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { logger } from '@/core/infra/logging/logger'
import { isAppError } from '@/core/http/errors'
import { contractUploadModes, contractWorkflowRoles } from '@/core/constants/contracts'
import { z } from 'zod'

const uploadContractFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Contract title is required').max(200, 'Contract title exceeds maximum length'),
    contractTypeId: z.string().trim().uuid('Valid contractTypeId is required'),
    signatoryName: z.string().trim().min(1, 'Signatory name is required').max(200, 'Signatory name is too long'),
    signatoryDesignation: z.string().trim().max(200, 'Signatory designation is too long').optional(),
    signatoryEmail: z.string().trim().toLowerCase().optional(),
    backgroundOfRequest: z.string().trim().max(4000, 'Background of request exceeds maximum length').optional(),
    departmentId: z.string().trim().optional(),
    budgetApproved: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    uploadMode: z
      .enum([contractUploadModes.default, contractUploadModes.legalSendForSigning])
      .optional()
      .default(contractUploadModes.default),
    bypassHodApproval: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    bypassReason: z.string().trim().max(2000, 'Bypass reason exceeds maximum length').optional(),
    counterpartyName: z.string().trim().max(200, 'Counterparty name is too long').optional(),
    counterparties: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return undefined
        }

        let parsedValue: unknown
        try {
          parsedValue = JSON.parse(value) as unknown
        } catch {
          return z.NEVER
        }

        const counterpartiesSchema = z.array(
          z.object({
            counterpartyName: z.string().trim().min(1).max(200),
            supportingFileIndices: z.array(z.number().int().nonnegative()).default([]),
          })
        )

        const parsedCounterparties = counterpartiesSchema.safeParse(parsedValue)
        if (!parsedCounterparties.success) {
          return z.NEVER
        }

        return parsedCounterparties.data
      }),
  })
  .superRefine((data, context) => {
    if (data.uploadMode === contractUploadModes.legalSendForSigning) {
      return
    }

    if (!data.signatoryDesignation?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Signatory designation is required',
        path: ['signatoryDesignation'],
      })
    }

    if (!data.signatoryEmail?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid signatory email is required',
        path: ['signatoryEmail'],
      })
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(data.signatoryEmail.trim())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid signatory email is required',
        path: ['signatoryEmail'],
      })
    }

    if (!data.backgroundOfRequest?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Background of request is required',
        path: ['backgroundOfRequest'],
      })
    }
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
      signatoryDesignation: formData.get('signatoryDesignation')
        ? String(formData.get('signatoryDesignation'))
        : undefined,
      signatoryEmail: formData.get('signatoryEmail') ? String(formData.get('signatoryEmail')) : undefined,
      backgroundOfRequest: formData.get('backgroundOfRequest')
        ? String(formData.get('backgroundOfRequest'))
        : undefined,
      departmentId: String(formData.get('departmentId') ?? ''),
      budgetApproved: formData.get('budgetApproved') ? String(formData.get('budgetApproved')) : undefined,
      uploadMode: formData.get('uploadMode') ? String(formData.get('uploadMode')) : undefined,
      bypassHodApproval: formData.get('bypassHodApproval') ? String(formData.get('bypassHodApproval')) : undefined,
      bypassReason: formData.get('bypassReason') ? String(formData.get('bypassReason')) : undefined,
      counterpartyName: formData.get('counterpartyName') ? String(formData.get('counterpartyName')) : undefined,
      counterparties: formData.get('counterparties') ? String(formData.get('counterparties')) : undefined,
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
    const supportingUploadFiles = formData
      .getAll('supportingFiles')
      .filter((entry): entry is File => entry instanceof File)

    const supportingFiles = await Promise.all(
      supportingUploadFiles.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer()
        return {
          fileName: file.name,
          fileSizeBytes: file.size,
          fileMimeType: file.type || 'application/octet-stream',
          fileBytes: new Uint8Array(arrayBuffer),
        }
      })
    )

    const counterparties = parsedForm.data.counterparties?.map((counterparty) => ({
      counterpartyName: counterparty.counterpartyName,
      supportingFiles: counterparty.supportingFileIndices.reduce<typeof supportingFiles>((accumulator, index) => {
        const supportingFile = supportingFiles[index]
        if (supportingFile) {
          accumulator.push(supportingFile)
        }
        return accumulator
      }, []),
    }))

    const isLegalSendForSigningMode = parsedForm.data.uploadMode === contractUploadModes.legalSendForSigning
    if (isLegalSendForSigningMode && session.role !== contractWorkflowRoles.legalTeam) {
      return NextResponse.json(errorResponse('CONTRACT_UPLOAD_FORBIDDEN', 'Only LEGAL_TEAM can use send for signing'), {
        status: 403,
      })
    }

    if (isLegalSendForSigningMode && parsedForm.data.bypassHodApproval && !parsedForm.data.bypassReason?.trim()) {
      return NextResponse.json(errorResponse('BYPASS_REASON_REQUIRED', 'Bypass reason is required'), {
        status: 400,
      })
    }

    const parsedDepartmentId = z.string().uuid('Valid departmentId is required').safeParse(parsedForm.data.departmentId)
    if (!parsedDepartmentId.success) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Valid departmentId is required'), {
        status: 400,
      })
    }

    const resolvedDepartmentId = parsedDepartmentId.data

    const fallbackSignatoryDesignation = 'Not provided'
    const fallbackSignatoryEmail = session.email
    const fallbackBackgroundOfRequest = 'Send for signing workflow'

    const contractUploadService = getContractUploadService()
    const contract = await contractUploadService.uploadContract({
      tenantId: session.tenantId,
      uploadedByEmployeeId: session.employeeId,
      uploadedByEmail: session.email,
      uploadedByRole: session.role,
      title: parsedForm.data.title,
      contractTypeId: parsedForm.data.contractTypeId,
      signatoryName: parsedForm.data.signatoryName,
      signatoryDesignation: isLegalSendForSigningMode
        ? fallbackSignatoryDesignation
        : (parsedForm.data.signatoryDesignation ?? ''),
      signatoryEmail: isLegalSendForSigningMode ? fallbackSignatoryEmail : (parsedForm.data.signatoryEmail ?? ''),
      backgroundOfRequest: isLegalSendForSigningMode
        ? fallbackBackgroundOfRequest
        : (parsedForm.data.backgroundOfRequest ?? ''),
      departmentId: resolvedDepartmentId,
      budgetApproved: parsedForm.data.budgetApproved ?? false,
      uploadMode: parsedForm.data.uploadMode,
      bypassHodApproval: parsedForm.data.bypassHodApproval,
      bypassReason: parsedForm.data.bypassReason,
      counterpartyName: parsedForm.data.counterpartyName,
      counterparties,
      fileName: uploadedFile.name,
      fileSizeBytes: uploadedFile.size,
      fileMimeType: uploadedFile.type || 'application/octet-stream',
      fileBytes,
      supportingFiles,
    })

    if (!parsedForm.data.bypassHodApproval) {
      const contractApprovalNotificationService = getContractApprovalNotificationService()
      await contractApprovalNotificationService.notifyHodOnContractUpload({
        tenantId: session.tenantId,
        contractId: contract.id,
        actorEmployeeId: session.employeeId,
        actorRole: session.role,
      })
    }

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
