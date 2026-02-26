import { randomUUID } from 'crypto'
import {
  contractDocumentMimeTypes,
  contractDocumentUploadRules,
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
    supportingFiles: Array<{
      fileName: string
      fileSizeBytes: number
      fileMimeType: string
      fileBytes: Uint8Array
    }>
  }>
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  fileBytes: Uint8Array
  supportingFiles?: Array<{
    fileName: string
    fileSizeBytes: number
    fileMimeType: string
    fileBytes: Uint8Array
  }>
}

export type ReplacePrimaryDocumentInput = {
  tenantId: string
  contractId: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole: string
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  fileBytes: Uint8Array
}

export class ContractUploadService {
  private readonly allowedInitialUploadRoles = new Set(contractDocumentUploadRules.initialAllowedRoles)
  private readonly allowedReplacementUploadRoles = new Set(contractDocumentUploadRules.replacementAllowedRoles)
  private readonly privilegedReadRoles = new Set(['ADMIN', 'LEGAL_TEAM'])

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
      throw new AuthorizationError('CONTRACT_UPLOAD_FORBIDDEN', 'Only POC can upload initial contracts')
    }

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

    if (!this.isDocxUpload(input.fileName, input.fileMimeType)) {
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
      counterpartySequenceOrder: number
      counterpartyName: string
    }> = []

    await this.contractStorageRepository.upload({
      path: filePath,
      fileBytes: input.fileBytes,
      contentType: input.fileMimeType,
    })

    for (const [counterpartyIndex, counterparty] of normalizedCounterparties.entries()) {
      for (const [supportingIndex, supportingFile] of counterparty.supportingFiles.entries()) {
        const safeSupportingFileName = this.sanitizeFileName(supportingFile.fileName)
        const supportingFilePath = `${input.tenantId}/${contractId}/counterparty/${String(counterpartyIndex + 1).padStart(3, '0')}/${String(supportingIndex + 1).padStart(3, '0')}-${safeSupportingFileName}`

        await this.contractStorageRepository.upload({
          path: supportingFilePath,
          fileBytes: supportingFile.fileBytes,
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
          : 'Counterparty Docs'

        await this.contractRepository.createDocument({
          tenantId: input.tenantId,
          contractId,
          documentKind: 'COUNTERPARTY_SUPPORTING',
          counterpartyId: counterpartyIdBySequenceOrder.get(supportingFile.counterpartySequenceOrder),
          displayName: `${displayNameBase} (${index + 1})`,
          fileName: supportingFile.fileName,
          filePath: supportingFile.filePath,
          fileSizeBytes: supportingFile.fileSizeBytes,
          fileMimeType: supportingFile.fileMimeType,
          uploadedByEmployeeId: input.uploadedByEmployeeId,
          uploadedByEmail: input.uploadedByEmail,
        })
      }
    } catch (error) {
      this.logger.error('Contract document metadata persistence failed', {
        tenantId: input.tenantId,
        contractId,
        error: String(error),
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
        'Only LEGAL_TEAM can replace main contract documents'
      )
    }

    if (!this.isAllowedReplacementUpload(input.fileName, input.fileMimeType)) {
      throw new BusinessRuleError('CONTRACT_REPLACEMENT_FILE_FORMAT_INVALID', 'Replacement must be DOCX or PDF')
    }

    const contract = await this.contractRepository.getForAccess(input.contractId, input.tenantId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found for tenant')
    }

    if (contract.status === contractStatuses.pendingExternal) {
      throw new BusinessRuleError(
        'CONTRACT_IN_SIGNATURE_REPLACEMENT_FORBIDDEN',
        'Main document replacement is blocked while contract is in signature'
      )
    }

    const safeFileName = this.sanitizeFileName(input.fileName)
    const filePath = `${input.tenantId}/${input.contractId}/versions/${randomUUID()}-${safeFileName}`

    await this.contractStorageRepository.upload({
      path: filePath,
      fileBytes: input.fileBytes,
      contentType: input.fileMimeType,
    })

    try {
      return await this.contractRepository.replacePrimaryDocument({
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

  private validateUploadInput(input: UploadContractInput): void {
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

    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(input.signatoryEmail.trim())) {
      throw new BusinessRuleError('SIGNATORY_EMAIL_INVALID', 'Signatory email format is invalid')
    }

    if (!input.backgroundOfRequest.trim()) {
      throw new BusinessRuleError('BACKGROUND_OF_REQUEST_REQUIRED', 'Background of request is required')
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
      if (counterparty.counterpartyName.length > 200) {
        throw new BusinessRuleError('COUNTERPARTY_NAME_TOO_LONG', 'Counterparty name exceeds maximum length')
      }

      const requiresSupportingDocs = counterparty.counterpartyName.toUpperCase() !== 'NA'
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
    supportingFiles: Array<{
      fileName: string
      fileSizeBytes: number
      fileMimeType: string
      fileBytes: Uint8Array
    }>
  }> {
    if (input.counterparties && input.counterparties.length > 0) {
      return input.counterparties
        .map((entry) => ({
          counterpartyName: entry.counterpartyName.trim(),
          supportingFiles: entry.supportingFiles,
        }))
        .filter((entry) => entry.counterpartyName.length > 0)
    }

    const counterpartyName = input.counterpartyName?.trim() ?? ''
    if (!counterpartyName) {
      return []
    }

    return [
      {
        counterpartyName,
        supportingFiles: input.supportingFiles ?? [],
      },
    ]
  }

  private sanitizeFileName(fileName: string): string {
    const normalized = fileName.replace(/\\/g, '/').split('/').pop() ?? 'contract-file'
    const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_')
    return safe.slice(0, 180)
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
