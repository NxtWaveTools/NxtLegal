import { ContractQueryService } from '@/core/domain/contracts/contract-query-service'
import type { ContractDetail, ContractQueryRepository } from '@/core/domain/contracts/contract-query-repository'
import { AuthorizationError } from '@/core/http/errors'

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
  listRepositoryContracts: jest.fn(),
  getById: jest.fn(),
  getTimeline: jest.fn(),
  getAdditionalApprovers: jest.fn(),
  canAccessContract: jest.fn(),
  getAvailableActions: jest.fn(),
  applyAction: jest.fn(),
  addAdditionalApprover: jest.fn(),
  addContractNote: jest.fn(),
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
      status: 'LEGAL_PENDING',
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
      availableActions: [],
      additionalApprovers: [],
    })
  })

  it('delegates contract access decisions to repository for role-aware visibility', async () => {
    const repository = createRepositoryMock()
    const service = new ContractQueryService(repository)

    repository.getById.mockResolvedValue(baseContract)
    repository.canAccessContract.mockResolvedValue(true)
    repository.getAvailableActions.mockResolvedValue([])
    repository.getAdditionalApprovers.mockResolvedValue([])

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
})
