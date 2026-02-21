import { randomUUID } from 'crypto'
import { contractStorage } from '@/core/constants/contracts'
import { limits } from '@/core/constants/limits'
import { AuthorizationError, BusinessRuleError, DatabaseError } from '@/core/http/errors'
import type { ContractRepository } from '@/core/domain/contracts/contract-repository'
import type { ContractStorageRepository } from '@/core/domain/contracts/contract-storage-repository'
import type { ContractRecord } from '@/core/domain/contracts/types'

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
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  fileBytes: Uint8Array
}

export class ContractUploadService {
  private readonly allowedUploadRoles = new Set(['POC', 'LEGAL_TEAM', 'USER'])
  private readonly privilegedReadRoles = new Set(['ADMIN', 'LEGAL_TEAM'])

  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly contractStorageRepository: ContractStorageRepository,
    private readonly logger: Logger
  ) {}

  async uploadContract(input: UploadContractInput): Promise<ContractRecord> {
    this.validateUploadInput(input)

    if (!this.allowedUploadRoles.has(input.uploadedByRole)) {
      throw new AuthorizationError('CONTRACT_UPLOAD_FORBIDDEN', 'Only POC, LEGAL_TEAM, and USER can upload contracts')
    }

    const contractId = randomUUID()
    const safeFileName = this.sanitizeFileName(input.fileName)
    const filePath = `${input.tenantId}/${contractId}/${safeFileName}`

    await this.contractStorageRepository.upload({
      path: filePath,
      fileBytes: input.fileBytes,
      contentType: input.fileMimeType,
    })

    try {
      return await this.contractRepository.createWithAudit({
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
  }

  async createSignedDownloadUrl(params: {
    contractId: string
    tenantId: string
    requestorEmployeeId: string
    requestorRole: string
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

    const signedUrl = await this.contractStorageRepository.createSignedDownloadUrl(
      contract.filePath,
      contractStorage.signedUrlExpirySeconds
    )

    return {
      signedUrl,
      fileName: contract.fileName,
    }
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
  }

  private sanitizeFileName(fileName: string): string {
    const normalized = fileName.replace(/\\/g, '/').split('/').pop() ?? 'contract-file'
    const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_')
    return safe.slice(0, 180)
  }
}
