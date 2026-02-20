import { ContractQueryService } from '@/core/domain/contracts/contract-query-service'
import type { ContractDetail, ContractQueryRepository } from '@/core/domain/contracts/contract-query-repository'
import { AuthorizationError } from '@/core/http/errors'

const baseContract: ContractDetail = {
  id: 'contract-1',
  title: 'Master Service Agreement',
  status: 'HOD_PENDING',
  uploadedByEmployeeId: 'uploader-1',
  uploadedByEmail: 'poc@nxtwave.co.in',
  currentAssigneeEmployeeId: 'hod-1',
  currentAssigneeEmail: 'hod@nxtwave.co.in',
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
})
