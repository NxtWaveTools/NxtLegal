import { ContractApprovalNotificationService } from '@/core/domain/contracts/contract-approval-notification-service'
import type { ContractQueryService } from '@/core/domain/contracts/contract-query-service'
import type { ContractDetailView } from '@/core/domain/contracts/contract-query-repository'

const createContractView = (): ContractDetailView => ({
  contract: {
    id: 'contract-1',
    title: 'MSA Contract',
    status: 'HOD_PENDING',
    contractTypeId: 'type-1',
    uploadedByEmployeeId: 'poc-1',
    uploadedByEmail: 'poc@nxtwave.co.in',
    currentAssigneeEmployeeId: 'hod-1',
    currentAssigneeEmail: 'hod@nxtwave.co.in',
    departmentId: 'dept-1',
    departmentHodEmail: 'hod@nxtwave.co.in',
    signatoryName: 'Signer',
    signatoryDesignation: 'Manager',
    signatoryEmail: 'signer@nxtwave.co.in',
    backgroundOfRequest: 'Need approval',
    budgetApproved: true,
    requestCreatedAt: new Date().toISOString(),
    fileName: 'contract.docx',
    fileSizeBytes: 123,
    fileMimeType: 'application/pdf',
    filePath: 'path/contract.docx',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rowVersion: 1,
  },
  counterparties: [],
  documents: [],
  availableActions: [],
  additionalApprovers: [],
  legalCollaborators: [],
  signatories: [],
})

describe('ContractApprovalNotificationService', () => {
  const templates = {
    hodApprovalRequestedTemplateId: 101,
    approvalReminderTemplateId: 102,
    additionalApproverAddedTemplateId: 103,
    legalInternalAssignmentTemplateId: 201,
    legalApprovalReceivedHodTemplateId: 202,
    legalApprovalReceivedAdditionalTemplateId: 203,
    legalReturnedToHodTemplateId: 204,
    legalContractRejectedTemplateId: 205,
  }

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  afterEach(() => {
    jest.clearAllMocks()
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('builds contact.LINK from NEXT_PUBLIC_APP_URL for HOD notifications', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nxtlegal.example.com'

    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue(createContractView()),
      getLatestNotificationDelivery: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
    } as unknown as ContractQueryService

    const mailSender = {
      sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    }

    const service = new ContractApprovalNotificationService(contractQueryService, mailSender, templates, logger)

    await service.notifyHodOnContractUpload({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'actor-1',
      actorRole: 'LEGAL_TEAM',
    })

    expect(mailSender.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateParams: expect.objectContaining({
          'contact.LINK': 'https://nxtlegal.example.com/contracts/contract-1',
          'contact.CONTRACT_TITLE': 'MSA Contract',
        }),
      })
    )
  })

  it('falls back to localhost for contact.LINK when NEXT_PUBLIC_APP_URL is absent', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue(createContractView()),
      getLatestNotificationDelivery: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
    } as unknown as ContractQueryService

    const mailSender = {
      sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-2' }),
    }

    const service = new ContractApprovalNotificationService(contractQueryService, mailSender, templates, logger)

    await service.notifyAdditionalApproverAdded({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'actor-1',
      actorRole: 'LEGAL_TEAM',
      approverEmail: 'approver@nxtwave.co.in',
    })

    expect(mailSender.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateParams: expect.objectContaining({
          'contact.LINK': 'http://localhost:3000/contracts/contract-1',
        }),
      })
    )
  })

  it('skips internal assignment email when recipient is legalteam alias', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue(createContractView()),
      getLatestNotificationDelivery: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
    } as unknown as ContractQueryService

    const mailSender = {
      sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-3' }),
    }

    const service = new ContractApprovalNotificationService(contractQueryService, mailSender, templates, logger)

    await service.notifyInternalAssignment({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'actor-1',
      actorRole: 'LEGAL_TEAM',
      assignedEmail: 'legalteam@nxtwave.co.in',
    })

    expect(mailSender.sendTemplateEmail).not.toHaveBeenCalled()
  })
})
