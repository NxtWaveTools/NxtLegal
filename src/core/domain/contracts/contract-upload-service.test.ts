import { ContractUploadService } from '@/core/domain/contracts/contract-upload-service'
import { AuthorizationError, BusinessRuleError } from '@/core/http/errors'
import { contractStatuses, contractUploadModes } from '@/core/constants/contracts'

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
        uploadMode: contractUploadModes.default,
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
        fileBody: new Blob([new Uint8Array([1, 2, 3])]),
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

  it('blocks upload when HOD is not assigned to selected department', async () => {
    const contractRepository = {
      isHodAssignedToDepartment: jest.fn().mockResolvedValue(false),
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
        uploadedByEmployeeId: 'hod-1',
        uploadedByEmail: 'hod@nxtwave.co.in',
        uploadedByRole: 'HOD',
        title: 'MSA',
        contractTypeId: 'type-1',
        signatoryName: 'Signer',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'signer@example.com',
        backgroundOfRequest: 'Need legal review',
        departmentId: 'dept-unassigned',
        budgetApproved: false,
        uploadMode: contractUploadModes.default,
        counterpartyName: 'NA',
        fileName: 'contract.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileBody: new Blob([new Uint8Array([1, 2, 3])]),
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_UPLOAD_DEPARTMENT_FORBIDDEN',
    })

    expect(contractRepository.isHodAssignedToDepartment).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      hodEmail: 'hod@nxtwave.co.in',
      departmentId: 'dept-unassigned',
    })
    expect(contractStorageRepository.upload).not.toHaveBeenCalled()
  })

  it('allows upload when HOD is assigned to selected department', async () => {
    const contractRepository = {
      isHodAssignedToDepartment: jest.fn().mockResolvedValue(true),
      createWithAudit: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        title: 'MSA',
        contractTypeId: 'type-1',
        signatoryName: 'Signer',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'signer@example.com',
        backgroundOfRequest: 'Need legal review',
        departmentId: 'dept-1',
        budgetApproved: false,
        requestCreatedAt: new Date().toISOString(),
        uploadedByEmployeeId: 'hod-1',
        uploadedByEmail: 'hod@nxtwave.co.in',
        currentAssigneeEmployeeId: 'hod-1',
        currentAssigneeEmail: 'hod@nxtwave.co.in',
        status: 'HOD_PENDING',
        filePath: 'tenant-1/contract-1/contract.docx',
        fileName: 'contract.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      createCounterparties: jest.fn().mockResolvedValue([
        {
          id: 'counterparty-1',
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          counterpartyName: 'NA',
          sequenceOrder: 1,
        },
      ]),
      setCounterpartyName: jest.fn().mockResolvedValue(undefined),
      createDocument: jest.fn().mockResolvedValue(undefined),
      upsertMasterCounterpartyNames: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract({
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'hod-1',
        uploadedByEmail: 'hod@nxtwave.co.in',
        uploadedByRole: 'HOD',
        title: 'MSA',
        contractTypeId: 'type-1',
        signatoryName: 'Signer',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'signer@example.com',
        backgroundOfRequest: 'Need legal review',
        departmentId: 'dept-1',
        budgetApproved: false,
        uploadMode: contractUploadModes.default,
        counterpartyName: 'NA',
        fileName: 'contract.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileBody: new Blob([new Uint8Array([1, 2, 3])]),
      })
    ).resolves.toBeDefined()

    expect(contractRepository.isHodAssignedToDepartment).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      hodEmail: 'hod@nxtwave.co.in',
      departmentId: 'dept-1',
    })
    expect(contractStorageRepository.upload).toHaveBeenCalled()
    expect(contractRepository.createWithAudit).toHaveBeenCalled()
  })

  it('allows NA signatory email in default upload mode', async () => {
    const contractRepository = {
      isHodAssignedToDepartment: jest.fn().mockResolvedValue(true),
      createWithAudit: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        title: 'MSA',
        contractTypeId: 'type-1',
        signatoryName: 'Signer',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'na',
        backgroundOfRequest: 'Need legal review',
        departmentId: 'dept-1',
        budgetApproved: false,
        requestCreatedAt: new Date().toISOString(),
        uploadedByEmployeeId: 'hod-1',
        uploadedByEmail: 'hod@nxtwave.co.in',
        currentAssigneeEmployeeId: 'hod-1',
        currentAssigneeEmail: 'hod@nxtwave.co.in',
        status: 'HOD_PENDING',
        filePath: 'tenant-1/contract-1/contract.docx',
        fileName: 'contract.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      createCounterparties: jest.fn().mockResolvedValue([
        {
          id: 'counterparty-1',
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          counterpartyName: 'NA',
          sequenceOrder: 1,
        },
      ]),
      setCounterpartyName: jest.fn().mockResolvedValue(undefined),
      createDocument: jest.fn().mockResolvedValue(undefined),
      upsertMasterCounterpartyNames: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract({
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'hod-1',
        uploadedByEmail: 'hod@nxtwave.co.in',
        uploadedByRole: 'HOD',
        title: 'MSA',
        contractTypeId: 'type-1',
        signatoryName: 'Signer',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'NA',
        backgroundOfRequest: 'Need legal review',
        departmentId: 'dept-1',
        budgetApproved: false,
        uploadMode: contractUploadModes.default,
        counterpartyName: 'NA',
        fileName: 'contract.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileBody: new Blob([new Uint8Array([1, 2, 3])]),
      })
    ).resolves.toBeDefined()

    expect(contractRepository.createWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        signatoryEmail: 'na',
      })
    )
  })
})

describe('ContractUploadService legal send-for-signing validations', () => {
  const buildUploadInput = (overrides?: Record<string, unknown>) => ({
    tenantId: 'tenant-1',
    uploadedByEmployeeId: 'employee-1',
    uploadedByEmail: 'legal@nxtwave.co.in',
    uploadedByRole: 'LEGAL_TEAM',
    uploadMode: contractUploadModes.legalSendForSigning,
    bypassHodApproval: false,
    bypassReason: undefined,
    title: 'NDA',
    contractTypeId: 'contract-type-1',
    signatoryName: 'Vendor Signatory',
    signatoryDesignation: 'Director',
    signatoryEmail: 'vendor@example.com',
    backgroundOfRequest: 'Need contract execution',
    departmentId: 'department-1',
    budgetApproved: true,
    counterpartyName: 'NA',
    fileName: 'agreement.pdf',
    fileSizeBytes: 1024,
    fileMimeType: 'application/pdf',
    fileBody: new Blob([new Uint8Array([1, 2, 3])]),
    supportingFiles: [],
    ...overrides,
  })

  it('rejects legal send-for-signing uploads when file is not PDF', async () => {
    const contractRepository = {
      createWithAudit: jest.fn(),
    }

    const contractStorageRepository = {
      upload: jest.fn(),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract(
        buildUploadInput({
          fileName: 'agreement.docx',
          fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }) as never
      )
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'CONTRACT_FILE_FORMAT_INVALID',
    })

    expect(contractStorageRepository.upload).not.toHaveBeenCalled()
    expect(contractRepository.createWithAudit).not.toHaveBeenCalled()
  })

  it('requires bypass reason when bypass HOD approval is enabled', async () => {
    const contractRepository = {
      createWithAudit: jest.fn(),
    }

    const contractStorageRepository = {
      upload: jest.fn(),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract(
        buildUploadInput({
          bypassHodApproval: true,
          bypassReason: '   ',
        }) as never
      )
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'BYPASS_REASON_REQUIRED',
    })

    expect(contractStorageRepository.upload).not.toHaveBeenCalled()
    expect(contractRepository.createWithAudit).not.toHaveBeenCalled()
  })

  it('passes bypass metadata into repository in legal send-for-signing mode', async () => {
    const contractRepository = {
      createWithAudit: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        title: 'NDA',
        contractTypeId: 'contract-type-1',
        signatoryName: 'Vendor Signatory',
        signatoryDesignation: 'Director',
        signatoryEmail: 'vendor@example.com',
        backgroundOfRequest: 'Need contract execution',
        departmentId: 'department-1',
        budgetApproved: true,
        requestCreatedAt: new Date().toISOString(),
        uploadedByEmployeeId: 'employee-1',
        uploadedByEmail: 'legal@nxtwave.co.in',
        currentAssigneeEmployeeId: 'employee-1',
        currentAssigneeEmail: 'legal@nxtwave.co.in',
        status: 'COMPLETED',
        filePath: 'tenant-1/contract-1/agreement.pdf',
        fileName: 'agreement.pdf',
        fileSizeBytes: 1024,
        fileMimeType: 'application/pdf',
      }),
      createCounterparties: jest.fn().mockResolvedValue([
        {
          id: 'counterparty-1',
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          counterpartyName: 'NA',
          sequenceOrder: 1,
        },
      ]),
      setCounterpartyName: jest.fn().mockResolvedValue(undefined),
      createDocument: jest.fn().mockResolvedValue(undefined),
      upsertMasterCounterpartyNames: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await service.uploadContract(
      buildUploadInput({
        bypassHodApproval: true,
        bypassReason: 'Urgent legal override for immediate execution',
      }) as never
    )

    expect(contractRepository.createWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadMode: contractUploadModes.legalSendForSigning,
        bypassHodApproval: true,
        bypassReason: 'Urgent legal override for immediate execution',
      })
    )
  })

  it('allows blank designation, email, and background in legal send-for-signing mode', async () => {
    const contractRepository = {
      createWithAudit: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        title: 'NDA',
        contractTypeId: 'contract-type-1',
        signatoryName: 'Vendor Signatory',
        signatoryDesignation: '',
        signatoryEmail: '',
        backgroundOfRequest: '',
        departmentId: 'department-1',
        budgetApproved: false,
        requestCreatedAt: new Date().toISOString(),
        uploadedByEmployeeId: 'employee-1',
        uploadedByEmail: 'legal@nxtwave.co.in',
        currentAssigneeEmployeeId: 'employee-1',
        currentAssigneeEmail: 'legal@nxtwave.co.in',
        status: 'COMPLETED',
        filePath: 'tenant-1/contract-1/agreement.pdf',
        fileName: 'agreement.pdf',
        fileSizeBytes: 1024,
        fileMimeType: 'application/pdf',
      }),
      createCounterparties: jest.fn().mockResolvedValue([
        {
          id: 'counterparty-1',
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          counterpartyName: 'NA',
          sequenceOrder: 1,
        },
      ]),
      setCounterpartyName: jest.fn().mockResolvedValue(undefined),
      createDocument: jest.fn().mockResolvedValue(undefined),
      upsertMasterCounterpartyNames: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract(
        buildUploadInput({
          signatoryDesignation: '   ',
          signatoryEmail: '   ',
          backgroundOfRequest: '   ',
          budgetApproved: false,
        }) as never
      )
    ).resolves.toBeTruthy()

    expect(contractRepository.createWithAudit).toHaveBeenCalled()
  })

  it('allows send-for-signing without supporting documents for non-NA counterparty', async () => {
    const contractRepository = {
      createWithAudit: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        title: 'NDA',
        contractTypeId: 'contract-type-1',
        signatoryName: 'Vendor Signatory',
        signatoryDesignation: 'Director',
        signatoryEmail: 'vendor@example.com',
        backgroundOfRequest: 'Need contract execution',
        departmentId: 'department-1',
        budgetApproved: true,
        requestCreatedAt: new Date().toISOString(),
        uploadedByEmployeeId: 'employee-1',
        uploadedByEmail: 'legal@nxtwave.co.in',
        currentAssigneeEmployeeId: 'employee-1',
        currentAssigneeEmail: 'legal@nxtwave.co.in',
        status: 'COMPLETED',
        filePath: 'tenant-1/contract-1/agreement.pdf',
        fileName: 'agreement.pdf',
        fileSizeBytes: 1024,
        fileMimeType: 'application/pdf',
      }),
      createCounterparties: jest.fn().mockResolvedValue([
        {
          id: 'counterparty-1',
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          counterpartyName: 'Acme Corp',
          sequenceOrder: 1,
        },
      ]),
      setCounterpartyName: jest.fn().mockResolvedValue(undefined),
      createDocument: jest.fn().mockResolvedValue(undefined),
      upsertMasterCounterpartyNames: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await expect(
      service.uploadContract(
        buildUploadInput({
          counterpartyName: 'Acme Corp',
          supportingFiles: [],
        }) as never
      )
    ).resolves.toBeTruthy()

    expect(contractRepository.createWithAudit).toHaveBeenCalled()
  })
})

describe('ContractUploadService replace primary document', () => {
  const buildReplaceInput = (overrides?: Record<string, unknown>) => ({
    tenantId: 'tenant-1',
    contractId: 'contract-1',
    uploadedByEmployeeId: 'legal-1',
    uploadedByEmail: 'legal@nxtwave.co.in',
    uploadedByRole: 'LEGAL_TEAM',
    fileName: 'contract-v2.pdf',
    fileSizeBytes: 2048,
    fileMimeType: 'application/pdf',
    fileBody: new Blob([new Uint8Array([1, 2, 3])]),
    isFinalExecuted: false,
    ...overrides,
  })

  it('runs document version replace and status update concurrently when final executed is checked', async () => {
    let statusUpdateStarted = false
    const contractRepository = {
      getForAccess: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'legal-1',
        currentAssigneeEmployeeId: 'legal-1',
        status: contractStatuses.completed,
        currentDocumentId: 'doc-1',
        filePath: 'tenant-1/contract-1/versions/v1.pdf',
        fileName: 'v1.pdf',
      }),
      replacePrimaryDocument: jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(statusUpdateStarted).toBe(true)
        return {
          id: 'doc-2',
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          documentKind: 'PRIMARY',
          versionNumber: 2,
          displayName: 'Primary Contract',
          fileName: 'contract-v2.pdf',
          filePath: 'tenant-1/contract-1/versions/v2.pdf',
          fileSizeBytes: 2048,
          fileMimeType: 'application/pdf',
          createdAt: new Date().toISOString(),
        }
      }),
      updateContractStatus: jest.fn().mockImplementation(async () => {
        statusUpdateStarted = true
      }),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await service.replacePrimaryDocument(buildReplaceInput({ isFinalExecuted: true }) as never)

    expect(contractRepository.replacePrimaryDocument).toHaveBeenCalledTimes(1)
    expect(contractRepository.updateContractStatus).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      status: contractStatuses.executed,
    })
  })

  it('does not update contract status when final executed is not checked', async () => {
    const contractRepository = {
      getForAccess: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: 'tenant-1',
        uploadedByEmployeeId: 'legal-1',
        currentAssigneeEmployeeId: 'legal-1',
        status: contractStatuses.completed,
        currentDocumentId: 'doc-1',
        filePath: 'tenant-1/contract-1/versions/v1.pdf',
        fileName: 'v1.pdf',
      }),
      replacePrimaryDocument: jest.fn().mockResolvedValue({
        id: 'doc-2',
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        documentKind: 'PRIMARY',
        versionNumber: 2,
        displayName: 'Primary Contract',
        fileName: 'contract-v2.pdf',
        filePath: 'tenant-1/contract-1/versions/v2.pdf',
        fileSizeBytes: 2048,
        fileMimeType: 'application/pdf',
        createdAt: new Date().toISOString(),
      }),
      updateContractStatus: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractUploadService(contractRepository as never, contractStorageRepository as never, logger)

    await service.replacePrimaryDocument(buildReplaceInput({ isFinalExecuted: false }) as never)

    expect(contractRepository.replacePrimaryDocument).toHaveBeenCalledTimes(1)
    expect(contractRepository.updateContractStatus).not.toHaveBeenCalled()
  })
})
