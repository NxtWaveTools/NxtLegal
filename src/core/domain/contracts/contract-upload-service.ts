import { randomUUID } from 'crypto'
import {
  contractCounterpartyValues,
  contractDocumentMimeTypes,
  contractDocumentUploadRules,
  contractUploadModes,
  contractDocumentVersioning,
  contractStatuses,
  contractStorage,
} from '@/core/constants/contracts'
import { limits } from '@/core/constants/limits'
import { AuthorizationError, BusinessRuleError, DatabaseError } from '@/core/http/errors'
import type { ContractRepository } from '@/core/domain/contracts/contract-repository'
import type { ContractStorageRepository } from '@/core/domain/contracts/contract-storage-repository'
import type { ContractDocumentRecord, ContractRecord } from '@/core/domain/contracts/types'

type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
}

export type UploadContractInput = {
  tenantId: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole: string
  uploadMode: 'DEFAULT' | 'LEGAL_SEND_FOR_SIGNING'
  bypassHodApproval?: boolean
  bypassReason?: string
  title: string
  contractTypeId: string
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  departmentId: string
  budgetApproved: boolean
  counterpartyName?: string
  counterparties?: Array<{
    counterpartyName: string
    backgroundOfRequest?: string
    budgetApproved?: boolean
    signatories?: Array<{
      name: string
      designation: string
      email: string
    }>
    supportingFiles: Array<{
      fileName: string
      fileSizeBytes: number
      fileMimeType: string
      fileBody: Blob
    }>
  }>
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  fileBody: Blob
  supportingFiles?: Array<{
    fileName: string
    fileSizeBytes: number
    fileMimeType: string
    fileBody: Blob
  }>
}

export type ReplacePrimaryDocumentInput = {
  tenantId: string
  contractId: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole: string
  isFinalExecuted?: boolean
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  fileBody: Blob
}

export class ContractUploadService {
  private readonly allowedInitialUploadRoles = new Set(contractDocumentUploadRules.initialAllowedRoles)
  private readonly allowedReplacementUploadRoles = new Set(contractDocumentUploadRules.replacementAllowedRoles)
  private readonly privilegedReadRoles = new Set(['ADMIN', 'LEGAL_TEAM'])
  private readonly emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly contractStorageRepository: ContractStorageRepository,
    private readonly logger: Logger
  ) {}

  async uploadContract(input: UploadContractInput): Promise<ContractRecord> {
    this.validateUploadInput(input)

    if (
      !this.allowedInitialUploadRoles.has(
        input.uploadedByRole as (typeof contractDocumentUploadRules.initialAllowedRoles)[number]
      )
    ) {
      throw new AuthorizationError(
        'CONTRACT_UPLOAD_FORBIDDEN',
        'Only POC, HOD, LEGAL_TEAM, or ADMIN can upload initial contracts'
      )
    }

    const isLegalSendForSigning = input.uploadMode === contractUploadModes.legalSendForSigning
    const isLegalOrAdminUpload = input.uploadedByRole === 'LEGAL_TEAM' || input.uploadedByRole === 'ADMIN'

    if (input.uploadedByRole === 'POC') {
      const isPocAssignedToDepartment = await this.contractRepository.isPocAssignedToDepartment({
        tenantId: input.tenantId,
        pocEmail: input.uploadedByEmail,
        departmentId: input.departmentId,
      })

      if (!isPocAssignedToDepartment) {
        throw new AuthorizationError(
          'CONTRACT_UPLOAD_DEPARTMENT_FORBIDDEN',
          'You can upload contracts only for departments assigned to your POC account'
        )
      }
    }

    if (input.uploadedByRole === 'HOD') {
      const isHodAssignedToDepartment = await this.contractRepository.isHodAssignedToDepartment({
        tenantId: input.tenantId,
        hodEmail: input.uploadedByEmail,
        departmentId: input.departmentId,
      })

      if (!isHodAssignedToDepartment) {
        throw new AuthorizationError(
          'CONTRACT_UPLOAD_DEPARTMENT_FORBIDDEN',
          'You can upload contracts only for your assigned HOD department'
        )
      }
    }

    if (isLegalSendForSigning && !isLegalOrAdminUpload) {
      throw new AuthorizationError(
        'CONTRACT_UPLOAD_FORBIDDEN',
        'Only LEGAL_TEAM or ADMIN can use send-for-signing upload mode'
      )
    }

    if (isLegalSendForSigning && input.bypassHodApproval && !input.bypassReason?.trim()) {
      throw new BusinessRuleError('BYPASS_REASON_REQUIRED', 'Bypass reason is required when bypassing HOD approval')
    }

    if (isLegalSendForSigning) {
      if (!this.isPdfUpload(input.fileName, input.fileMimeType)) {
        throw new BusinessRuleError('CONTRACT_FILE_FORMAT_INVALID', 'Legal send-for-signing upload must be a PDF file')
      }
    } else if (!this.isDocxUpload(input.fileName, input.fileMimeType)) {
      throw new BusinessRuleError('CONTRACT_FILE_FORMAT_INVALID', 'Initial contract upload must be a DOCX file')
    }

    const contractId = randomUUID()
    const normalizedCounterparties = this.normalizeCounterparties(input)
    const trimmedCounterpartyName = normalizedCounterparties[0]?.counterpartyName ?? ''
    const safeFileName = this.sanitizeFileName(input.fileName)
    const filePath = `${input.tenantId}/${contractId}/${safeFileName}`
    const uploadedSupportingFiles: Array<{
      filePath: string
      fileName: string
      fileSizeBytes: number
      fileMimeType: string
      counterpartySequenceOrder: number | null
      counterpartyName: string | null
    }> = []

    await this.contractStorageRepository.upload({
      path: filePath,
      fileBody: input.fileBody,
      contentType: input.fileMimeType,
    })

    for (const [counterpartyIndex, counterparty] of normalizedCounterparties.entries()) {
      for (const [supportingIndex, supportingFile] of counterparty.supportingFiles.entries()) {
        const safeSupportingFileName = this.sanitizeFileName(supportingFile.fileName)
        const supportingFilePath = `${input.tenantId}/${contractId}/counterparty/${String(counterpartyIndex + 1).padStart(3, '0')}/${String(supportingIndex + 1).padStart(3, '0')}-${safeSupportingFileName}`

        await this.contractStorageRepository.upload({
          path: supportingFilePath,
          fileBody: supportingFile.fileBody,
          contentType: supportingFile.fileMimeType,
        })

        uploadedSupportingFiles.push({
          filePath: supportingFilePath,
          fileName: safeSupportingFileName,
          fileSizeBytes: supportingFile.fileSizeBytes,
          fileMimeType: supportingFile.fileMimeType,
          counterpartySequenceOrder: counterpartyIndex + 1,
          counterpartyName: counterparty.counterpartyName,
        })
      }
    }

    for (const [supportingIndex, supportingFile] of (input.supportingFiles ?? []).entries()) {
      const safeSupportingFileName = this.sanitizeFileName(supportingFile.fileName)
      const supportingFilePath = `${input.tenantId}/${contractId}/supporting/common/${String(supportingIndex + 1).padStart(3, '0')}-${safeSupportingFileName}`

      await this.contractStorageRepository.upload({
        path: supportingFilePath,
        fileBody: supportingFile.fileBody,
        contentType: supportingFile.fileMimeType,
      })

      uploadedSupportingFiles.push({
        filePath: supportingFilePath,
        fileName: safeSupportingFileName,
        fileSizeBytes: supportingFile.fileSizeBytes,
        fileMimeType: supportingFile.fileMimeType,
        counterpartySequenceOrder: null,
        counterpartyName: null,
      })
    }

    let contract: ContractRecord
    try {
      contract = await this.contractRepository.createWithAudit({
        contractId,
        tenantId: input.tenantId,
        title: input.title.trim(),
        contractTypeId: input.contractTypeId,
        signatoryName: input.signatoryName.trim(),
        signatoryDesignation: input.signatoryDesignation.trim(),
        signatoryEmail: input.signatoryEmail.trim().toLowerCase(),
        backgroundOfRequest: input.backgroundOfRequest.trim(),
        departmentId: input.departmentId,
        budgetApproved: input.budgetApproved,
        uploadedByEmployeeId: input.uploadedByEmployeeId,
        uploadedByEmail: input.uploadedByEmail,
        uploadedByRole: input.uploadedByRole,
        uploadMode: input.uploadMode,
        bypassHodApproval: Boolean(input.bypassHodApproval),
        bypassReason: input.bypassReason?.trim() || undefined,
        filePath,
        fileName: safeFileName,
        fileSizeBytes: input.fileSizeBytes,
        fileMimeType: input.fileMimeType,
      })
    } catch (error) {
      try {
        await this.contractStorageRepository.remove(filePath)
        await Promise.all(
          uploadedSupportingFiles.map((supportingFile) =>
            this.contractStorageRepository.remove(supportingFile.filePath)
          )
        )
      } catch (rollbackError) {
        this.logger.error('Contract upload rollback failed', {
          tenantId: input.tenantId,
          contractId,
          filePath,
          rollbackError: String(rollbackError),
        })
      }

      throw new DatabaseError('Failed to initialize contract after upload', error as Error, {
        tenantId: input.tenantId,
        contractId,
      })
    }

    try {
      const createdCounterparties = await this.contractRepository.createCounterparties(
        normalizedCounterparties.map((counterparty, index) => ({
          tenantId: input.tenantId,
          contractId,
          counterpartyName: counterparty.counterpartyName,
          sequenceOrder: index + 1,
        }))
      )

      const counterpartyIdBySequenceOrder = new Map<number, string>()
      for (const counterparty of createdCounterparties) {
        counterpartyIdBySequenceOrder.set(counterparty.sequenceOrder, counterparty.id)
      }

      if (trimmedCounterpartyName) {
        await this.contractRepository.setCounterpartyName({
          tenantId: input.tenantId,
          contractId,
          counterpartyName: trimmedCounterpartyName,
        })
      }

      await this.contractRepository.createDocument({
        tenantId: input.tenantId,
        contractId,
        documentKind: 'PRIMARY',
        versionNumber: contractDocumentVersioning.initialVersion,
        displayName: 'Primary Contract',
        fileName: safeFileName,
        filePath,
        fileSizeBytes: input.fileSizeBytes,
        fileMimeType: input.fileMimeType,
        uploadedByEmployeeId: input.uploadedByEmployeeId,
        uploadedByEmail: input.uploadedByEmail,
        uploadedByRole: input.uploadedByRole,
      })

      for (const [index, supportingFile] of uploadedSupportingFiles.entries()) {
        const displayNameBase = supportingFile.counterpartyName
          ? `Counterparty Docs - ${supportingFile.counterpartyName}`
          : 'Budget Approval Supporting Docs'

        await this.contractRepository.createDocument({
          tenantId: input.tenantId,
          contractId,
          documentKind: 'COUNTERPARTY_SUPPORTING',
          counterpartyId:
            supportingFile.counterpartySequenceOrder === null
              ? undefined
              : counterpartyIdBySequenceOrder.get(supportingFile.counterpartySequenceOrder),
          displayName: `${displayNameBase} (${index + 1})`,
          fileName: supportingFile.fileName,
          filePath: supportingFile.filePath,
          fileSizeBytes: supportingFile.fileSizeBytes,
          fileMimeType: supportingFile.fileMimeType,
          uploadedByEmployeeId: input.uploadedByEmployeeId,
          uploadedByEmail: input.uploadedByEmail,
        })
      }

      await this.contractRepository.upsertMasterCounterpartyNames({
        tenantId: input.tenantId,
        names: normalizedCounterparties
          .map((counterparty) => counterparty.counterpartyName)
          .filter((name) => name.toUpperCase() !== contractCounterpartyValues.notApplicable),
      })

      const draftRecipients = normalizedCounterparties
        .filter(
          (counterparty) => counterparty.counterpartyName.toUpperCase() !== contractCounterpartyValues.notApplicable
        )
        .flatMap((counterparty, counterpartyIndex) =>
          counterparty.signatories.map((signatory) => ({
            name: signatory.name,
            email: signatory.email,
            designation: signatory.designation,
            counterpartyId: counterpartyIdBySequenceOrder.get(counterpartyIndex + 1),
            counterpartyName: counterparty.counterpartyName,
            backgroundOfRequest: counterparty.backgroundOfRequest,
            budgetApproved: counterparty.budgetApproved,
            recipientType: 'EXTERNAL' as const,
          }))
        )
      const draftRecipientsByEmail = new Map<
        string,
        {
          name: string
          email: string
          designation?: string
          counterpartyId?: string
          counterpartyName?: string
          backgroundOfRequest?: string
          budgetApproved?: boolean
          recipientType: 'INTERNAL' | 'EXTERNAL'
        }
      >()
      for (const recipient of draftRecipients) {
        if (!recipient.email) {
          continue
        }
        if (!draftRecipientsByEmail.has(recipient.email)) {
          draftRecipientsByEmail.set(recipient.email, recipient)
        }
      }

      const seededDraftRecipients = Array.from(draftRecipientsByEmail.values()).map((recipient) => ({
        ...recipient,
        // Default all auto-seeded recipients to parallel signing priority.
        routingOrder: 1,
      }))

      if (seededDraftRecipients.length > 0) {
        try {
          if (typeof this.contractRepository.seedSigningPreparationDraft === 'function') {
            await this.contractRepository.seedSigningPreparationDraft({
              tenantId: input.tenantId,
              contractId,
              actorEmployeeId: input.uploadedByEmployeeId,
              recipients: seededDraftRecipients,
            })
          }
        } catch (error) {
          this.logger.warn('Signing preparation draft seed failed during upload', {
            tenantId: input.tenantId,
            contractId,
            recipientCount: seededDraftRecipients.length,
            error: String(error),
          })
        }
      }
    } catch (error) {
      this.logger.error('Contract document metadata persistence failed', {
        tenantId: input.tenantId,
        contractId,
        error: String(error),
      })

      throw new DatabaseError('Failed to persist contract metadata', error as Error, {
        tenantId: input.tenantId,
        contractId,
      })
    }

    return contract
  }

  async replacePrimaryDocument(input: ReplacePrimaryDocumentInput): Promise<ContractDocumentRecord> {
    this.validateReplacementInput(input)

    if (
      !this.allowedReplacementUploadRoles.has(
        input.uploadedByRole as (typeof contractDocumentUploadRules.replacementAllowedRoles)[number]
      )
    ) {
      throw new AuthorizationError(
        'CONTRACT_REPLACEMENT_FORBIDDEN',
        'Only LEGAL_TEAM or ADMIN can replace main contract documents'
      )
    }

    if (!this.isAllowedReplacementUpload(input.fileName, input.fileMimeType)) {
      throw new BusinessRuleError('CONTRACT_REPLACEMENT_FILE_FORMAT_INVALID', 'Replacement must be DOCX or PDF')
    }

    const contract = await this.contractRepository.getForAccess(input.contractId, input.tenantId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found for tenant')
    }

    if (contract.status === contractStatuses.signing || contract.status === contractStatuses.pendingExternal) {
      throw new BusinessRuleError(
        'CONTRACT_IN_SIGNATURE_REPLACEMENT_FORBIDDEN',
        'Main document replacement is blocked while contract is in signature'
      )
    }

    const safeFileName = this.sanitizeFileName(input.fileName)
    const filePath = `${input.tenantId}/${input.contractId}/versions/${randomUUID()}-${safeFileName}`

    await this.contractStorageRepository.upload({
      path: filePath,
      fileBody: input.fileBody,
      contentType: input.fileMimeType,
    })

    try {
      const replaceDocumentPromise = this.contractRepository.replacePrimaryDocument({
        tenantId: input.tenantId,
        contractId: input.contractId,
        fileName: safeFileName,
        filePath,
        fileSizeBytes: input.fileSizeBytes,
        fileMimeType: input.fileMimeType,
        uploadedByEmployeeId: input.uploadedByEmployeeId,
        uploadedByEmail: input.uploadedByEmail,
        uploadedByRole: input.uploadedByRole,
      })

      const updateStatusPromise = input.isFinalExecuted
        ? this.contractRepository.updateContractStatus({
            tenantId: input.tenantId,
            contractId: input.contractId,
            status: contractStatuses.executed,
          })
        : Promise.resolve()

      const [document] = await Promise.all([replaceDocumentPromise, updateStatusPromise])
      return document
    } catch (error) {
      try {
        await this.contractStorageRepository.remove(filePath)
      } catch (rollbackError) {
        this.logger.error('Contract replacement rollback failed', {
          tenantId: input.tenantId,
          contractId: input.contractId,
          filePath,
          rollbackError: String(rollbackError),
        })
      }

      throw new DatabaseError('Failed to replace main contract document', error as Error, {
        tenantId: input.tenantId,
        contractId: input.contractId,
      })
    }
  }

  async createSignedDownloadUrl(params: {
    contractId: string
    tenantId: string
    requestorEmployeeId: string
    requestorRole: string
    documentId?: string
  }): Promise<{ signedUrl: string; fileName: string }> {
    const contract = await this.contractRepository.getForAccess(params.contractId, params.tenantId)

    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found for tenant')
    }

    const canRead =
      this.privilegedReadRoles.has(params.requestorRole) ||
      contract.uploadedByEmployeeId === params.requestorEmployeeId ||
      contract.currentAssigneeEmployeeId === params.requestorEmployeeId ||
      (params.requestorRole === 'HOD' &&
        (await this.contractRepository.isUploaderInActorTeam({
          tenantId: params.tenantId,
          actorEmployeeId: params.requestorEmployeeId,
          uploaderEmployeeId: contract.uploadedByEmployeeId,
        })))

    if (!canRead) {
      throw new AuthorizationError('CONTRACT_READ_FORBIDDEN', 'You do not have access to this contract')
    }

    if (params.documentId) {
      const document = await this.contractRepository.getDocumentForAccess({
        tenantId: params.tenantId,
        contractId: params.contractId,
        documentId: params.documentId,
      })

      if (!document) {
        throw new BusinessRuleError('DOCUMENT_NOT_FOUND', 'Requested document is not available for this contract')
      }

      const signedUrl = await this.contractStorageRepository.createSignedDownloadUrl(
        document.filePath,
        contractStorage.signedUrlExpirySeconds
      )

      return {
        signedUrl,
        fileName: document.fileName,
      }
    }

    if (!contract.currentDocumentId || contract.currentDocumentId.trim().length === 0) {
      throw new BusinessRuleError('CONTRACT_CURRENT_DOCUMENT_MISSING', 'Active contract document is missing')
    }

    const activeDocument = await this.contractRepository.getDocumentForAccess({
      tenantId: params.tenantId,
      contractId: params.contractId,
      documentId: contract.currentDocumentId,
    })

    if (!activeDocument) {
      throw new BusinessRuleError('CONTRACT_CURRENT_DOCUMENT_INVALID', 'Active contract document could not be resolved')
    }

    const signedUrl = await this.contractStorageRepository.createSignedDownloadUrl(
      activeDocument.filePath,
      contractStorage.signedUrlExpirySeconds
    )

    return {
      signedUrl,
      fileName: activeDocument.fileName,
    }
  }

  private isDocxUpload(fileName: string, mimeType: string): boolean {
    const normalizedMimeType = mimeType.trim().toLowerCase()
    const normalizedFileName = fileName.trim().toLowerCase()

    return (
      normalizedMimeType === contractDocumentMimeTypes.docx ||
      normalizedFileName.endsWith('.docx') ||
      (normalizedMimeType === 'application/octet-stream' && normalizedFileName.endsWith('.docx'))
    )
  }

  private isAllowedReplacementUpload(fileName: string, mimeType: string): boolean {
    const normalizedMimeType = mimeType.trim().toLowerCase()
    const normalizedFileName = fileName.trim().toLowerCase()

    if (normalizedMimeType === contractDocumentMimeTypes.docx || normalizedFileName.endsWith('.docx')) {
      return true
    }

    if (normalizedMimeType === contractDocumentMimeTypes.pdf || normalizedFileName.endsWith('.pdf')) {
      return true
    }

    return false
  }

  private isPdfUpload(fileName: string, mimeType: string): boolean {
    const normalizedMimeType = mimeType.trim().toLowerCase()
    const normalizedFileName = fileName.trim().toLowerCase()

    return (
      normalizedMimeType === contractDocumentMimeTypes.pdf ||
      normalizedFileName.endsWith('.pdf') ||
      (normalizedMimeType === 'application/octet-stream' && normalizedFileName.endsWith('.pdf'))
    )
  }

  private validateUploadInput(input: UploadContractInput): void {
    const isLegalSendForSigning = input.uploadMode === contractUploadModes.legalSendForSigning

    if (!input.title.trim()) {
      throw new BusinessRuleError('CONTRACT_TITLE_REQUIRED', 'Contract title is required')
    }

    if (!input.fileName.trim()) {
      throw new BusinessRuleError('CONTRACT_FILE_REQUIRED', 'A contract file is required')
    }

    if (input.fileSizeBytes <= 0) {
      throw new BusinessRuleError('CONTRACT_FILE_EMPTY', 'Uploaded contract file is empty')
    }

    const maxFileSizeBytes = limits.maxUploadSizeMb * 1024 * 1024
    if (input.fileSizeBytes > maxFileSizeBytes) {
      throw new BusinessRuleError('CONTRACT_FILE_TOO_LARGE', `Uploaded file exceeds ${limits.maxUploadSizeMb}MB limit`)
    }

    if (!input.fileMimeType.trim()) {
      throw new BusinessRuleError('CONTRACT_FILE_MIME_REQUIRED', 'File MIME type is required')
    }

    if (!input.signatoryName.trim()) {
      throw new BusinessRuleError('SIGNATORY_NAME_REQUIRED', 'Signatory name is required')
    }

    if (!input.signatoryDesignation.trim()) {
      throw new BusinessRuleError('SIGNATORY_DESIGNATION_REQUIRED', 'Signatory designation is required')
    }

    if (!input.signatoryEmail.trim()) {
      throw new BusinessRuleError('SIGNATORY_EMAIL_REQUIRED', 'Signatory email is required')
    }

    if (!this.isValidSignatoryEmail(input.signatoryEmail)) {
      throw new BusinessRuleError('SIGNATORY_EMAIL_INVALID', 'Signatory email format is invalid')
    }

    if (!input.backgroundOfRequest.trim()) {
      throw new BusinessRuleError('BACKGROUND_OF_REQUEST_REQUIRED', 'Background of request is required')
    }

    const totalSupportingFileCount =
      (input.supportingFiles?.length ?? 0) +
      (input.counterparties?.reduce((count, counterparty) => count + counterparty.supportingFiles.length, 0) ?? 0)
    if (input.budgetApproved && totalSupportingFileCount === 0) {
      throw new BusinessRuleError(
        'BUDGET_APPROVAL_SUPPORTING_REQUIRED',
        'Supporting document is required when budget approved is set to yes'
      )
    }

    if (!input.departmentId.trim()) {
      throw new BusinessRuleError('DEPARTMENT_ID_REQUIRED', 'Department is required')
    }

    if (!input.contractTypeId.trim()) {
      throw new BusinessRuleError('CONTRACT_TYPE_ID_REQUIRED', 'Contract type is required')
    }

    const normalizedCounterparties = this.normalizeCounterparties(input)
    if (normalizedCounterparties.length === 0) {
      throw new BusinessRuleError('COUNTERPARTY_REQUIRED', 'At least one counterparty is required')
    }

    for (const counterparty of normalizedCounterparties) {
      const isNotApplicableCounterparty =
        counterparty.counterpartyName.toUpperCase() === contractCounterpartyValues.notApplicable

      if (counterparty.counterpartyName.length > 200) {
        throw new BusinessRuleError('COUNTERPARTY_NAME_TOO_LONG', 'Counterparty name exceeds maximum length')
      }

      if (!isNotApplicableCounterparty && counterparty.signatories.length === 0) {
        throw new BusinessRuleError(
          'SIGNATORY_NAME_REQUIRED',
          `At least one signatory is required for counterparty ${counterparty.counterpartyName}`
        )
      }

      if (isNotApplicableCounterparty && counterparty.signatories.length > 0) {
        throw new BusinessRuleError(
          'SIGNATORY_NAME_REQUIRED',
          `Signatories are not allowed for counterparty ${counterparty.counterpartyName}`
        )
      }

      const seenSignatoryEmails = new Set<string>()
      for (const signatory of counterparty.signatories) {
        if (!isNotApplicableCounterparty && !signatory.name.trim()) {
          throw new BusinessRuleError(
            'SIGNATORY_NAME_REQUIRED',
            `Signatory name is required for counterparty ${counterparty.counterpartyName}`
          )
        }

        if (!isNotApplicableCounterparty && !signatory.designation.trim()) {
          throw new BusinessRuleError(
            'SIGNATORY_DESIGNATION_REQUIRED',
            `Signatory designation is required for counterparty ${counterparty.counterpartyName}`
          )
        }

        if (!isNotApplicableCounterparty && !signatory.email.trim()) {
          throw new BusinessRuleError(
            'SIGNATORY_EMAIL_REQUIRED',
            `Signatory email is required for counterparty ${counterparty.counterpartyName}`
          )
        }

        if (!isNotApplicableCounterparty && !this.isValidSignatoryEmail(signatory.email)) {
          throw new BusinessRuleError(
            'SIGNATORY_EMAIL_INVALID',
            `Signatory email format is invalid for counterparty ${counterparty.counterpartyName}`
          )
        }

        const normalizedEmail = signatory.email.trim().toLowerCase()
        if (normalizedEmail) {
          if (seenSignatoryEmails.has(normalizedEmail)) {
            throw new BusinessRuleError(
              'SIGNATORY_EMAIL_INVALID',
              `Duplicate signatory emails are not allowed for counterparty ${counterparty.counterpartyName}`
            )
          }
          seenSignatoryEmails.add(normalizedEmail)
        }
      }

      const requiresSupportingDocs =
        !isNotApplicableCounterparty &&
        counterparty.counterpartyName.toUpperCase() !== contractCounterpartyValues.notApplicable
      if (requiresSupportingDocs && counterparty.supportingFiles.length === 0) {
        throw new BusinessRuleError(
          'COUNTERPARTY_SUPPORTING_REQUIRED',
          `Supporting documents are required for counterparty ${counterparty.counterpartyName}`
        )
      }

      for (const supportingFile of counterparty.supportingFiles) {
        if (!supportingFile.fileName.trim()) {
          throw new BusinessRuleError('SUPPORTING_FILE_NAME_REQUIRED', 'Supporting document name is required')
        }

        if (supportingFile.fileSizeBytes <= 0) {
          throw new BusinessRuleError('SUPPORTING_FILE_EMPTY', 'Supporting document cannot be empty')
        }

        if (supportingFile.fileSizeBytes > maxFileSizeBytes) {
          throw new BusinessRuleError(
            'SUPPORTING_FILE_TOO_LARGE',
            `Supporting file exceeds ${limits.maxUploadSizeMb}MB limit`
          )
        }

        if (!supportingFile.fileMimeType.trim()) {
          throw new BusinessRuleError('SUPPORTING_FILE_MIME_REQUIRED', 'Supporting document MIME type is required')
        }
      }
    }
  }

  private normalizeCounterparties(input: UploadContractInput): Array<{
    counterpartyName: string
    backgroundOfRequest: string
    budgetApproved: boolean
    signatories: Array<{
      name: string
      designation: string
      email: string
    }>
    supportingFiles: Array<{
      fileName: string
      fileSizeBytes: number
      fileMimeType: string
      fileBody: Blob
    }>
  }> {
    if (input.counterparties && input.counterparties.length > 0) {
      return input.counterparties
        .map((entry) => {
          const normalizedCounterpartyName = entry.counterpartyName.trim()
          const isNotApplicableCounterparty =
            normalizedCounterpartyName.toUpperCase() === contractCounterpartyValues.notApplicable

          return {
            counterpartyName: normalizedCounterpartyName,
            backgroundOfRequest: isNotApplicableCounterparty
              ? contractCounterpartyValues.notApplicable
              : (entry.backgroundOfRequest?.trim() ?? ''),
            budgetApproved: isNotApplicableCounterparty ? false : Boolean(entry.budgetApproved),
            signatories: isNotApplicableCounterparty
              ? []
              : (entry.signatories ?? []).map((signatory) => ({
                  name: signatory.name.trim(),
                  designation: signatory.designation.trim(),
                  email: signatory.email.trim().toLowerCase(),
                })),
            supportingFiles: isNotApplicableCounterparty ? [] : entry.supportingFiles,
          }
        })
        .filter((entry) => entry.counterpartyName.length > 0)
    }

    const counterpartyName = input.counterpartyName?.trim() ?? ''
    if (!counterpartyName) {
      return []
    }
    const isNotApplicableCounterparty = counterpartyName.toUpperCase() === contractCounterpartyValues.notApplicable

    return [
      {
        counterpartyName,
        backgroundOfRequest: isNotApplicableCounterparty
          ? contractCounterpartyValues.notApplicable
          : input.backgroundOfRequest.trim(),
        budgetApproved: isNotApplicableCounterparty ? false : input.budgetApproved,
        signatories: isNotApplicableCounterparty
          ? []
          : [
              {
                name: input.signatoryName.trim(),
                designation: input.signatoryDesignation.trim(),
                email: input.signatoryEmail.trim().toLowerCase(),
              },
            ],
        supportingFiles: isNotApplicableCounterparty ? [] : (input.supportingFiles ?? []),
      },
    ]
  }

  private sanitizeFileName(fileName: string): string {
    const normalized = fileName.replace(/\\/g, '/').split('/').pop() ?? 'contract-file'
    const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_')
    return safe.slice(0, 180)
  }

  private isValidSignatoryEmail(value: string): boolean {
    const normalizedValue = value.trim()
    if (normalizedValue.toUpperCase() === 'NA') {
      return true
    }

    return this.emailPattern.test(normalizedValue)
  }

  private validateReplacementInput(input: ReplacePrimaryDocumentInput): void {
    if (!input.contractId.trim()) {
      throw new BusinessRuleError('CONTRACT_ID_REQUIRED', 'Contract ID is required')
    }

    if (!input.fileName.trim()) {
      throw new BusinessRuleError('CONTRACT_FILE_REQUIRED', 'A contract file is required')
    }

    if (input.fileSizeBytes <= 0) {
      throw new BusinessRuleError('CONTRACT_FILE_EMPTY', 'Uploaded contract file is empty')
    }

    const maxFileSizeBytes = limits.maxUploadSizeMb * 1024 * 1024
    if (input.fileSizeBytes > maxFileSizeBytes) {
      throw new BusinessRuleError('CONTRACT_FILE_TOO_LARGE', `Uploaded file exceeds ${limits.maxUploadSizeMb}MB limit`)
    }

    if (!input.fileMimeType.trim()) {
      throw new BusinessRuleError('CONTRACT_FILE_MIME_REQUIRED', 'File MIME type is required')
    }
  }
}
