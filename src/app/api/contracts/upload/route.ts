import { NextResponse, type NextRequest } from 'next/server'
import {
  getContractApprovalNotificationService,
  getContractUploadService,
  getIdempotencyService,
} from '@/core/registry/service-registry'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { logger } from '@/core/infra/logging/logger'
import { DatabaseError, isAppError } from '@/core/http/errors'
import { contractCounterpartyValues, contractUploadModes, contractWorkflowRoles } from '@/core/constants/contracts'
import { z } from 'zod'

// Route segment config — extends the serverless function execution timeout
// to 300 s (5 min) so large multipart uploads (up to 100 MB) have time to
// be received, validated, and persisted to storage.
export const maxDuration = 300
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

function isValidSignatoryEmail(value: string): boolean {
  const normalizedValue = value.trim()
  if (normalizedValue.toUpperCase() === 'NA') {
    return true
  }

  return EMAIL_PATTERN.test(normalizedValue)
}

const dispatchNotificationInBackground = (notification: Promise<unknown>, event: string, contractId: string): void => {
  void notification.catch((error) => {
    logger.warn('Contract upload notification dispatch failed', {
      event,
      contractId,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

const uploadContractFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Contract title is required').max(200, 'Contract title exceeds maximum length'),
    contractTypeId: z.string().trim().uuid('Valid contractTypeId is required'),
    signatoryName: z.string().trim().max(200, 'Signatory name is too long').optional(),
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
            backgroundOfRequest: z.string().trim().max(4000, 'Background of request exceeds maximum length').optional(),
            budgetApproved: z.boolean().optional(),
            signatories: z
              .array(
                z.object({
                  name: z.string().trim().max(200),
                  designation: z.string().trim().max(200),
                  email: z.string().trim().toLowerCase(),
                })
              )
              .default([]),
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
      if (!data.signatoryName?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Counterparty name is required',
          path: ['signatoryName'],
        })
      }
      return
    }

    if (!data.counterparties || data.counterparties.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one counterparty is required',
        path: ['counterparties'],
      })
      return
    }

    data.counterparties.forEach((counterparty, counterpartyIndex) => {
      const normalizedCounterpartyName = counterparty.counterpartyName.trim()
      const isNotApplicable = normalizedCounterpartyName.toUpperCase() === contractCounterpartyValues.notApplicable

      if (!isNotApplicable && !counterparty.backgroundOfRequest?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Background of request is required',
          path: ['counterparties', counterpartyIndex, 'backgroundOfRequest'],
        })
      }

      if (isNotApplicable && counterparty.signatories.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Signatories are not allowed when counterparty is NA',
          path: ['counterparties', counterpartyIndex, 'signatories'],
        })
        return
      }

      if (!isNotApplicable && (!counterparty.signatories || counterparty.signatories.length === 0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one signatory is required',
          path: ['counterparties', counterpartyIndex, 'signatories'],
        })
        return
      }

      const seenSignatoryEmails = new Set<string>()

      counterparty.signatories.forEach((signatory, signatoryIndex) => {
        if (!signatory.name.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Signatory name is required',
            path: ['counterparties', counterpartyIndex, 'signatories', signatoryIndex, 'name'],
          })
        }

        if (!signatory.designation.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Signatory designation is required',
            path: ['counterparties', counterpartyIndex, 'signatories', signatoryIndex, 'designation'],
          })
        }

        if (!signatory.email.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Valid signatory email is required',
            path: ['counterparties', counterpartyIndex, 'signatories', signatoryIndex, 'email'],
          })
          return
        }

        if (!isValidSignatoryEmail(signatory.email)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Valid signatory email is required',
            path: ['counterparties', counterpartyIndex, 'signatories', signatoryIndex, 'email'],
          })
          return
        }

        const normalizedEmail = signatory.email.trim().toLowerCase()
        if (seenSignatoryEmails.has(normalizedEmail)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Duplicate signatory emails are not allowed within the same counterparty',
            path: ['counterparties', counterpartyIndex, 'signatories', signatoryIndex, 'email'],
          })
          return
        }

        seenSignatoryEmails.add(normalizedEmail)
      })

      if (!isNotApplicable && counterparty.supportingFileIndices.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Supporting documents are required for counterparty ${counterparty.counterpartyName}`,
          path: ['counterparties', counterpartyIndex, 'supportingFileIndices'],
        })
      }
    })
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
      signatoryName: formData.get('signatoryName') ? String(formData.get('signatoryName')) : undefined,
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

    const supportingUploadFiles = formData
      .getAll('supportingFiles')
      .filter((entry): entry is File => entry instanceof File)

    if (parsedForm.data.counterparties && parsedForm.data.counterparties.length > 0) {
      for (const counterparty of parsedForm.data.counterparties) {
        const seen = new Set<number>()

        for (const index of counterparty.supportingFileIndices) {
          if (seen.has(index)) {
            return NextResponse.json(
              errorResponse('VALIDATION_ERROR', 'Duplicate supporting file index is not allowed'),
              {
                status: 400,
              }
            )
          }

          seen.add(index)

          if (index < 0 || index >= supportingUploadFiles.length) {
            return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Supporting file index is out of range'), {
              status: 400,
            })
          }
        }
      }
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

    const supportingFiles = supportingUploadFiles.map((file) => ({
      fileName: file.name,
      fileSizeBytes: file.size,
      fileMimeType: file.type || 'application/octet-stream',
      fileBody: file as Blob,
    }))

    const counterparties = parsedForm.data.counterparties?.map((counterparty) => ({
      counterpartyName: counterparty.counterpartyName,
      supportingFiles:
        counterparty.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
          ? []
          : counterparty.supportingFileIndices.map((index) => supportingFiles[index]!),
      backgroundOfRequest:
        counterparty.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
          ? ''
          : (counterparty.backgroundOfRequest?.trim() ?? ''),
      budgetApproved:
        counterparty.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
          ? false
          : Boolean(counterparty.budgetApproved),
      signatories:
        counterparty.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
          ? []
          : (counterparty.signatories ?? []).map((signatory) => ({
              name: signatory.name.trim(),
              designation: signatory.designation.trim(),
              email: signatory.email.trim().toLowerCase(),
            })),
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
    const primaryCounterpartyForUpload = counterparties?.[0]
    const primarySignatoryForUpload = primaryCounterpartyForUpload?.signatories?.[0]
    const resolvedSignatoryName = isLegalSendForSigningMode
      ? (parsedForm.data.signatoryName ?? '')
      : (primarySignatoryForUpload?.name ??
        (primaryCounterpartyForUpload?.counterpartyName?.toUpperCase() === contractCounterpartyValues.notApplicable
          ? contractCounterpartyValues.notApplicable
          : ''))
    const resolvedSignatoryDesignation = isLegalSendForSigningMode
      ? fallbackSignatoryDesignation
      : (primarySignatoryForUpload?.designation ??
        (primaryCounterpartyForUpload?.counterpartyName?.toUpperCase() === contractCounterpartyValues.notApplicable
          ? contractCounterpartyValues.notApplicable
          : ''))
    const resolvedSignatoryEmail = isLegalSendForSigningMode
      ? fallbackSignatoryEmail
      : (primarySignatoryForUpload?.email ??
        (primaryCounterpartyForUpload?.counterpartyName?.toUpperCase() === contractCounterpartyValues.notApplicable
          ? contractCounterpartyValues.notApplicable
          : ''))
    const resolvedBackgroundOfRequest = isLegalSendForSigningMode
      ? fallbackBackgroundOfRequest
      : (primaryCounterpartyForUpload?.backgroundOfRequest ??
        (primaryCounterpartyForUpload?.counterpartyName?.toUpperCase() === contractCounterpartyValues.notApplicable
          ? contractCounterpartyValues.notApplicable
          : ''))
    const resolvedBudgetApproved = isLegalSendForSigningMode
      ? (parsedForm.data.budgetApproved ?? false)
      : (primaryCounterpartyForUpload?.budgetApproved ?? false)

    const contractUploadService = getContractUploadService()
    const contract = await contractUploadService.uploadContract({
      tenantId: session.tenantId,
      uploadedByEmployeeId: session.employeeId,
      uploadedByEmail: session.email,
      uploadedByRole: session.role,
      title: parsedForm.data.title,
      contractTypeId: parsedForm.data.contractTypeId,
      signatoryName: resolvedSignatoryName,
      signatoryDesignation: resolvedSignatoryDesignation,
      signatoryEmail: resolvedSignatoryEmail,
      backgroundOfRequest: resolvedBackgroundOfRequest,
      departmentId: resolvedDepartmentId,
      budgetApproved: resolvedBudgetApproved,
      uploadMode: parsedForm.data.uploadMode,
      bypassHodApproval: parsedForm.data.bypassHodApproval,
      bypassReason: parsedForm.data.bypassReason,
      counterpartyName: parsedForm.data.counterpartyName,
      counterparties,
      fileName: uploadedFile.name,
      fileSizeBytes: uploadedFile.size,
      fileMimeType: uploadedFile.type || 'application/octet-stream',
      fileBody: uploadedFile as Blob,
      supportingFiles,
    })

    if (!parsedForm.data.bypassHodApproval) {
      const contractApprovalNotificationService = getContractApprovalNotificationService()
      dispatchNotificationInBackground(
        contractApprovalNotificationService.notifyHodOnContractUpload({
          tenantId: session.tenantId,
          contractId: contract.id,
          actorEmployeeId: session.employeeId,
          actorRole: session.role,
        }),
        'HOD_UPLOAD_NOTIFICATION',
        contract.id
      )
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
      errorStatusCode: isAppError(error) ? error.statusCode : 500,
      errorMetadata: isAppError(error) ? error.metadata : undefined,
      originalError:
        error instanceof DatabaseError
          ? error.originalError instanceof Error
            ? error.originalError.message
            : undefined
          : undefined,
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to upload contract'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const POST = POSTHandler
