import { ContractUploadService } from '@/core/domain/contracts/contract-upload-service'
import { AuthorizationError, BusinessRuleError } from '@/core/http/errors'

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

describe('ContractUploadService signing source regression', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses contract.currentDocumentId as default signing source', async () => {
    const contractRepository = {
      getForAccess: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'uploader-1',
        currentAssigneeEmployeeId: 'legal-1',
        status: 'FINAL_APPROVED',
        currentDocumentId: 'doc-active-2',
        filePath: 'legacy/path.docx',
        fileName: 'legacy.docx',
      }),
      getDocumentForAccess: jest.fn().mockResolvedValue({
        id: 'doc-active-2',
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        versionNumber: 2,
        filePath: 'tenant-1/contract-1/versions/v2.docx',
        fileName: 'v2.docx',
      }),
      isUploaderInActorTeam: jest.fn().mockResolvedValue(false),
    }

    const contractStorageRepository = {
      createSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/v2'),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    const result = await service.createSignedDownloadUrl({
      contractId: 'contract-1',
      tenantId: 'tenant-1',
      requestorEmployeeId: 'legal-1',
      requestorRole: 'LEGAL_TEAM',
    })

    expect(contractRepository.getDocumentForAccess).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      documentId: 'doc-active-2',
    })
    expect(contractStorageRepository.createSignedDownloadUrl).toHaveBeenCalledWith(
      'tenant-1/contract-1/versions/v2.docx',
      expect.any(Number)
    )
    expect(result).toEqual({
      signedUrl: 'https://signed.example/v2',
      fileName: 'v2.docx',
    })
  })

  it('throws when current_document_id is missing and no explicit document id is provided', async () => {
    const contractRepository = {
      getForAccess: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'uploader-1',
        currentAssigneeEmployeeId: 'legal-1',
        status: 'FINAL_APPROVED',
        currentDocumentId: null,
        filePath: 'legacy/path.docx',
        fileName: 'legacy.docx',
      }),
      isUploaderInActorTeam: jest.fn().mockResolvedValue(false),
      getDocumentForAccess: jest.fn(),
    }

    const contractStorageRepository = {
      createSignedDownloadUrl: jest.fn(),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.createSignedDownloadUrl({
        contractId: 'contract-1',
        tenantId: 'tenant-1',
        requestorEmployeeId: 'legal-1',
        requestorRole: 'LEGAL_TEAM',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'CONTRACT_CURRENT_DOCUMENT_MISSING',
    })

    expect(contractRepository.getDocumentForAccess).not.toHaveBeenCalled()
    expect(contractStorageRepository.createSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('still serves explicit documentId requests for authorized readers', async () => {
    const contractRepository = {
      getForAccess: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'uploader-1',
        currentAssigneeEmployeeId: 'legal-1',
        status: 'FINAL_APPROVED',
        currentDocumentId: null,
        filePath: 'legacy/path.docx',
        fileName: 'legacy.docx',
      }),
      getDocumentForAccess: jest.fn().mockResolvedValue({
        id: 'doc-explicit-1',
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        versionNumber: 1,
        filePath: 'tenant-1/contract-1/explicit.pdf',
        fileName: 'explicit.pdf',
      }),
      isUploaderInActorTeam: jest.fn().mockResolvedValue(false),
    }

    const contractStorageRepository = {
      createSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/explicit'),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    const result = await service.createSignedDownloadUrl({
      contractId: 'contract-1',
      tenantId: 'tenant-1',
      requestorEmployeeId: 'legal-1',
      requestorRole: 'LEGAL_TEAM',
      documentId: 'doc-explicit-1',
    })

    expect(contractRepository.getDocumentForAccess).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      documentId: 'doc-explicit-1',
    })
    expect(result.fileName).toBe('explicit.pdf')
  })

  it('blocks unauthorized readers', async () => {
    const contractRepository = {
      getForAccess: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'uploader-1',
        currentAssigneeEmployeeId: 'legal-1',
        status: 'FINAL_APPROVED',
        currentDocumentId: 'doc-active-2',
        filePath: 'legacy/path.docx',
        fileName: 'legacy.docx',
      }),
      getDocumentForAccess: jest.fn(),
      isUploaderInActorTeam: jest.fn().mockResolvedValue(false),
    }

    const service = new ContractUploadService(contractRepository as never, {} as never, logger)

    await expect(
      service.createSignedDownloadUrl({
        contractId: 'contract-1',
        tenantId: 'tenant-1',
        requestorEmployeeId: 'random-user',
        requestorRole: 'POC',
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_READ_FORBIDDEN',
    })
  })

  it('blocks upload when POC is not assigned to selected department', async () => {
    const contractRepository = {
      isPocAssignedToDepartment: jest.fn().mockResolvedValue(false),
      createWithAudit: jest.fn(),
      createCounterparties: jest.fn(),
      setCounterpartyName: jest.fn(),
      createDocument: jest.fn(),
    }

    const contractStorageRepository = {
      upload: jest.fn(),
      remove: jest.fn(),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract({
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'poc-1',
        uploadedByEmail: 'poc@nxtwave.co.in',
        uploadedByRole: 'POC',
        title: 'MSA',
        contractTypeId: 'type-1',
        signatoryName: 'Signer',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'signer@example.com',
        backgroundOfRequest: 'Need legal review',
        departmentId: 'dept-unassigned',
        budgetApproved: false,
        counterpartyName: 'NA',
        fileName: 'contract.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileBytes: new Uint8Array([1, 2, 3]),
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_UPLOAD_DEPARTMENT_FORBIDDEN',
    })

    expect(contractRepository.isPocAssignedToDepartment).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      pocEmail: 'poc@nxtwave.co.in',
      departmentId: 'dept-unassigned',
    })
    expect(contractStorageRepository.upload).not.toHaveBeenCalled()
  })
})
