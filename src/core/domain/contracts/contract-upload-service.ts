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
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  fileBytes: Uint8Array
}

export class ContractUploadService {
  private readonly allowedUploadRoles = new Set(['POC', 'LEGAL_TEAM'])
  private readonly privilegedReadRoles = new Set(['ADMIN', 'LEGAL_TEAM'])

  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly contractStorageRepository: ContractStorageRepository,
    private readonly logger: Logger
  ) {}

  async uploadContract(input: UploadContractInput): Promise<ContractRecord> {
    this.validateUploadInput(input)

    if (!this.allowedUploadRoles.has(input.uploadedByRole)) {
      throw new AuthorizationError('CONTRACT_UPLOAD_FORBIDDEN', 'Only POC and LEGAL_TEAM can upload contracts')
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
      contract.currentAssigneeEmployeeId === params.requestorEmployeeId

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
  }

  private sanitizeFileName(fileName: string): string {
    const normalized = fileName.replace(/\\/g, '/').split('/').pop() ?? 'contract-file'
    const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_')
    return safe.slice(0, 180)
  }
}
