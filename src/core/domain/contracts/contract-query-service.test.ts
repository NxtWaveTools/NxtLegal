import { ContractQueryService } from '@/core/domain/contracts/contract-query-service'
import type { ContractDetail, ContractQueryRepository } from '@/core/domain/contracts/contract-query-repository'
import { AuthorizationError, BusinessRuleError } from '@/core/http/errors'

const baseContract: ContractDetail = {
  id: 'contract-1',
  title: 'Master Service Agreement',
  contractTypeId: 'contract-type-1',
  contractTypeName: 'MSA',
  status: 'HOD_PENDING',
  uploadedByEmployeeId: 'uploader-1',
  uploadedByEmail: 'poc@nxtwave.co.in',
  currentAssigneeEmployeeId: 'hod-1',
  currentAssigneeEmail: 'hod@nxtwave.co.in',
  departmentId: 'department-1',
  departmentName: 'Facilities',
  departmentHodName: 'Bala Bhaskar',
  departmentHodEmail: 'balabhaskar@nxtwave.co.in',
  signatoryName: 'John Doe',
  signatoryDesignation: 'Manager',
  signatoryEmail: 'john.doe@nxtwave.co.in',
  backgroundOfRequest: 'Office fitout contract',
  budgetApproved: true,
  requestCreatedAt: new Date().toISOString(),
  fileName: 'msa.docx',
  fileSizeBytes: 1024,
  fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  filePath: 'tenant/contract-1/msa.docx',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  rowVersion: 1,
}

const createRepositoryMock = (): jest.Mocked<ContractQueryRepository> => ({
  listByTenant: jest.fn(),
  getPendingApprovalsForRole: jest.fn(),
  getDashboardContracts: jest.fn(),
  getActionableAdditionalApprovals: jest.fn(),
  getAdditionalApproverDecisionHistory: jest.fn(),
  listRepositoryContracts: jest.fn(),
  getRepositoryReport: jest.fn(),
  listRepositoryExportRows: jest.fn(),
  getById: jest.fn(),
  getCounterparties: jest.fn(),
  getDocuments: jest.fn(),
  getTimeline: jest.fn(),
  getAdditionalApprovers: jest.fn(),
  getLegalCollaborators: jest.fn(),
  isLegalCollaborator: jest.fn(),
  getSignatories: jest.fn(),
  canAccessContract: jest.fn(),
  getAvailableActions: jest.fn(),
  applyAction: jest.fn(),
  addAdditionalApprover: jest.fn(),
  bypassAdditionalApprover: jest.fn(),
  setLegalOwnerByEmail: jest.fn(),
  addLegalCollaboratorByEmail: jest.fn(),
  removeLegalCollaboratorByEmail: jest.fn(),
  addSignatory: jest.fn(),
  saveSigningPreparationDraft: jest.fn(),
  getSigningPreparationDraft: jest.fn(),
  countPendingSignatoriesByContract: jest.fn(),
  moveContractToInSignature: jest.fn(),
  deleteSigningPreparationDraft: jest.fn(),
  resolveEnvelopeContext: jest.fn(),
  recordDocusignWebhookEvent: jest.fn(),
  addSignatoryWebhookAuditEvent: jest.fn(),
  markSignatoryAsSigned: jest.fn(),
  listFailedNotificationDeliveries: jest.fn(),
  getEnvelopeNotificationProfile: jest.fn(),
  getLatestNotificationDelivery: jest.fn(),
  recordContractNotificationDelivery: jest.fn(),
  addContractNote: jest.fn(),
  addContractActivityMessage: jest.fn(),
  markContractActivitySeen: jest.fn(),
})

describe('ContractQueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns success payload when action succeeds but actor loses read access post-mutation', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    const updatedContract: ContractDetail = {
      ...baseContract,
      status: 'UNDER_REVIEW',
      currentAssigneeEmployeeId: 'legal-1',
      currentAssigneeEmail: 'legalteam@nxtwave.co.in',
      rowVersion: 2,
    }

    repository.applyAction.mockResolvedValue(updatedContract)
    repository.getById.mockResolvedValue(updatedContract)
    repository.canAccessContract.mockResolvedValue(false)

    const result = await service.applyContractAction({
      tenantId: 'tenant-1',
      contractId: updatedContract.id,
      action: 'hod.approve',
      actorEmployeeId: 'hod-1',
      actorRole: 'HOD',
      actorEmail: 'hod@nxtwave.co.in',
    })

    expect(result).toEqual({
      contract: updatedContract,
      counterparties: [],
      documents: [],
      availableActions: [],
      additionalApprovers: [],
      legalCollaborators: [],
      signatories: [],
    })
  })

  it('delegates contract access decisions to repository for role-aware visibility', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getById.mockResolvedValue(baseContract)
    repository.canAccessContract.mockResolvedValue(true)
    repository.getDocuments.mockResolvedValue([])
    repository.getAvailableActions.mockResolvedValue([])
    repository.getAdditionalApprovers.mockResolvedValue([])
    repository.getLegalCollaborators.mockResolvedValue([])
    repository.getSignatories.mockResolvedValue([])
    repository.getCounterparties.mockResolvedValue([])

    await service.getContractDetail({
      tenantId: 'tenant-1',
      contractId: baseContract.id,
      employeeId: 'hod-1',
      role: 'HOD',
    })

    expect(repository.canAccessContract).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorEmployeeId: 'hod-1',
      actorRole: 'HOD',
      contract: baseContract,
    })
  })

  it('still throws non-access errors after mutation', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.applyAction.mockResolvedValue(baseContract)
    repository.getById.mockResolvedValue(baseContract)
    repository.canAccessContract.mockRejectedValue(
      new AuthorizationError('CONTRACT_TIMELINE_FORBIDDEN', 'timeline unavailable')
    )

    await expect(
      service.applyContractAction({
        tenantId: 'tenant-1',
        contractId: baseContract.id,
        action: 'hod.approve',
        actorEmployeeId: 'hod-1',
        actorRole: 'HOD',
        actorEmail: 'hod@nxtwave.co.in',
      })
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('delegates pending approvals to repository with actor role context', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getPendingApprovalsForRole.mockResolvedValue([baseContract])

    const result = await service.getPendingApprovalsForRole({
      tenantId: 'tenant-1',
      employeeId: 'hod-1',
      role: 'HOD',
      limit: 20,
    })

    expect(result).toHaveLength(1)
    expect(repository.getPendingApprovalsForRole).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'hod-1',
      role: 'HOD',
      limit: 20,
    })
  })

  it('delegates dashboard contracts with requested filter', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getDashboardContracts.mockResolvedValue({
      items: [baseContract],
      nextCursor: undefined,
      total: 1,
    })

    const result = await service.getDashboardContracts({
      tenantId: 'tenant-1',
      employeeId: 'poc-1',
      role: 'POC',
      filter: 'HOD_PENDING',
      limit: 20,
    })

    expect(result.items).toHaveLength(1)
    expect(repository.getDashboardContracts).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'poc-1',
      role: 'POC',
      filter: 'HOD_PENDING',
      limit: 20,
    })
  })

  it('preserves repository total count for list contracts', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.listByTenant.mockResolvedValue({
      items: [baseContract],
      nextCursor: undefined,
      total: 37,
    })

    const result = await service.listContracts({
      tenantId: 'tenant-1',
      employeeId: 'poc-1',
      role: 'POC',
      limit: 20,
    })

    expect(result.total).toBe(37)
  })

  it('preserves repository total count for dashboard contracts', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getDashboardContracts.mockResolvedValue({
      items: [baseContract],
      nextCursor: undefined,
      total: 11,
    })

    const result = await service.getDashboardContracts({
      tenantId: 'tenant-1',
      employeeId: 'poc-1',
      role: 'POC',
      filter: 'HOD_PENDING',
      limit: 20,
    })

    expect(result.total).toBe(11)
  })

  it('delegates actionable additional approvals to repository', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getActionableAdditionalApprovals.mockResolvedValue([baseContract])

    const result = await service.getActionableAdditionalApprovals({
      tenantId: 'tenant-1',
      employeeId: 'approver-1',
      limit: 10,
    })

    expect(result).toHaveLength(1)
    expect(repository.getActionableAdditionalApprovals).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'approver-1',
      limit: 10,
    })
  })

  it('delegates additional approver decision history to repository', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getAdditionalApproverDecisionHistory.mockResolvedValue({
      items: [
        {
          contractId: baseContract.id,
          contractTitle: baseContract.title,
          contractStatus: baseContract.status,
          contractDisplayStatusLabel: 'HOD Pending',
          departmentId: 'department-1',
          departmentName: 'Facilities',
          actorEmail: 'approver@nxtwave.co.in',
          decision: 'APPROVED',
          decidedAt: new Date().toISOString(),
          reason: null,
        },
      ],
      nextCursor: undefined,
      total: 1,
    })

    const result = await service.getAdditionalApproverDecisionHistory({
      tenantId: 'tenant-1',
      employeeId: 'approver-1',
      role: 'USER',
      limit: 10,
    })

    expect(result.items).toHaveLength(1)
    expect(repository.getAdditionalApproverDecisionHistory).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: 'approver-1',
      role: 'USER',
      limit: 10,
    })
  })

  it('preserves repository total count for repository listing', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.listRepositoryContracts.mockResolvedValue({
      items: [baseContract],
      nextCursor: undefined,
      total: 24,
    })

    const result = await service.listRepositoryContracts({
      tenantId: 'tenant-1',
      employeeId: 'legal-1',
      role: 'LEGAL_TEAM',
      limit: 20,
      sortBy: 'created_at',
      sortDirection: 'desc',
    })

    expect(result.total).toBe(24)
  })

  it('requires remark for additional approver rejection action', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    await expect(
      service.applyContractAction({
        tenantId: 'tenant-1',
        contractId: baseContract.id,
        action: 'approver.reject',
        actorEmployeeId: 'approver-1',
        actorRole: 'USER',
        actorEmail: 'approver@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'REMARK_REQUIRED',
    })

    expect(repository.applyAction).not.toHaveBeenCalled()
  })

  it('restricts individual approval bypass to LEGAL_TEAM or ADMIN', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    await expect(
      service.bypassAdditionalApprover({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        approverId: 'approver-row-1',
        actorEmployeeId: 'user-1',
        actorRole: 'HOD',
        actorEmail: 'hod@nxtwave.co.in',
        reason: 'Need to continue legal processing',
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_ACTION_FORBIDDEN',
    })

    expect(repository.bypassAdditionalApprover).not.toHaveBeenCalled()
  })

  it('delegates individual approval bypass and returns refreshed detail view', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    const updatedContract: ContractDetail = {
      ...baseContract,
      status: 'UNDER_REVIEW',
      currentAssigneeEmployeeId: 'legal-1',
      currentAssigneeEmail: 'legalteam@nxtwave.co.in',
      rowVersion: 2,
    }

    repository.bypassAdditionalApprover.mockResolvedValue(undefined)
    repository.getById.mockResolvedValue(updatedContract)
    repository.canAccessContract.mockResolvedValue(true)
    repository.getCounterparties.mockResolvedValue([])
    repository.getDocuments.mockResolvedValue([])
    repository.getAvailableActions.mockResolvedValue([])
    repository.getAdditionalApprovers.mockResolvedValue([])
    repository.getLegalCollaborators.mockResolvedValue([])
    repository.getSignatories.mockResolvedValue([])

    const result = await service.bypassAdditionalApprover({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      approverId: 'approver-row-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legalteam@nxtwave.co.in',
      reason: 'Approver is unavailable and SLA is at risk',
    })

    expect(repository.bypassAdditionalApprover).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      approverId: 'approver-row-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legalteam@nxtwave.co.in',
      reason: 'Approver is unavailable and SLA is at risk',
    })
    expect(result.contract.status).toBe('UNDER_REVIEW')
  })

  it('saves signing preparation draft when contract is completed', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    const completedContract: ContractDetail = {
      ...baseContract,
      status: 'COMPLETED',
    }

    repository.getById.mockResolvedValue(completedContract)
    repository.canAccessContract.mockResolvedValue(true)
    repository.getDocuments.mockResolvedValue([])
    repository.getAvailableActions.mockResolvedValue([])
    repository.getAdditionalApprovers.mockResolvedValue([])
    repository.getSignatories.mockResolvedValue([])
    repository.saveSigningPreparationDraft.mockResolvedValue({
      contractId: 'contract-1',
      recipients: [
        {
          name: 'Shriya Mattoo',
          email: 'shriya@example.com',
          recipientType: 'INTERNAL',
          routingOrder: 1,
        },
      ],
      fields: [
        {
          fieldType: 'SIGNATURE',
          pageNumber: 1,
          xPosition: 100,
          yPosition: 120,
          anchorString: null,
          assignedSignerEmail: 'shriya@example.com',
        },
      ],
      createdByEmployeeId: 'legal-1',
      updatedByEmployeeId: 'legal-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const result = await service.saveSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      recipients: [
        {
          name: 'Shriya Mattoo',
          email: 'shriya@example.com',
          recipientType: 'INTERNAL',
          routingOrder: 1,
        },
      ],
      fields: [
        {
          fieldType: 'SIGNATURE',
          pageNumber: 1,
          xPosition: 100,
          yPosition: 120,
          anchorString: null,
          assignedSignerEmail: 'shriya@example.com',
        },
      ],
    })

    expect(result.contractId).toBe('contract-1')
    expect(repository.saveSigningPreparationDraft).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      recipients: [
        {
          name: 'Shriya Mattoo',
          email: 'shriya@example.com',
          recipientType: 'INTERNAL',
          routingOrder: 1,
        },
      ],
      fields: [
        {
          fieldType: 'SIGNATURE',
          pageNumber: 1,
          xPosition: 100,
          yPosition: 120,
          anchorString: null,
          assignedSignerEmail: 'shriya@example.com',
        },
      ],
    })
  })

  it('rejects signing preparation draft save when contract is not completed', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getById.mockResolvedValue(baseContract)
    repository.canAccessContract.mockResolvedValue(true)
    repository.getDocuments.mockResolvedValue([])
    repository.getAvailableActions.mockResolvedValue([])
    repository.getAdditionalApprovers.mockResolvedValue([])
    repository.getSignatories.mockResolvedValue([])

    await expect(
      service.saveSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        recipients: [
          {
            name: 'Shriya Mattoo',
            email: 'shriya@example.com',
            recipientType: 'INTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [],
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'SIGNING_PREPARATION_INVALID_STATUS',
    })

    expect(repository.saveSigningPreparationDraft).not.toHaveBeenCalled()
  })
})
