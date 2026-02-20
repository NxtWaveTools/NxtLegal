import { AuthorizationError, BusinessRuleError, NotFoundError } from '@/core/http/errors'
import type {
  ContractDetail,
  ContractDetailView,
  ContractListItem,
  ContractQueryRepository,
  ContractTimelineEvent,
} from '@/core/domain/contracts/contract-query-repository'
import type { ContractActionName } from '@/core/domain/contracts/schemas'

export class ContractQueryService {
  constructor(private readonly contractRepository: ContractQueryRepository) {}

  async listContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
  }): Promise<{ items: ContractListItem[]; nextCursor?: string }> {
    return this.contractRepository.listByTenant(params)
  }

  async getContractDetail(params: {
    tenantId: string
    contractId: string
    employeeId: string
    role?: string
  }): Promise<ContractDetailView> {
    const contract = await this.contractRepository.getById(params.tenantId, params.contractId)

    if (!contract) {
      throw new NotFoundError('Contract', params.contractId)
    }

    if (
      !(await this.contractRepository.canAccessContract({
        tenantId: params.tenantId,
        actorEmployeeId: params.employeeId,
        actorRole: params.role,
        contract,
      }))
    ) {
      throw new AuthorizationError('CONTRACT_READ_FORBIDDEN', 'You do not have access to this contract')
    }

    const [availableActions, additionalApprovers] = await Promise.all([
      this.contractRepository.getAvailableActions({
        tenantId: params.tenantId,
        contract,
        actorEmployeeId: params.employeeId,
        actorRole: params.role,
      }),
      this.contractRepository.getAdditionalApprovers(params.tenantId, params.contractId),
    ])

    return {
      contract,
      availableActions,
      additionalApprovers,
    }
  }

  async getContractTimeline(params: {
    tenantId: string
    contractId: string
    employeeId: string
    role?: string
    limit: number
  }): Promise<ContractTimelineEvent[]> {
    const contract = await this.contractRepository.getById(params.tenantId, params.contractId)

    if (!contract) {
      throw new NotFoundError('Contract', params.contractId)
    }

    if (
      !(await this.contractRepository.canAccessContract({
        tenantId: params.tenantId,
        actorEmployeeId: params.employeeId,
        actorRole: params.role,
        contract,
      }))
    ) {
      throw new AuthorizationError('CONTRACT_TIMELINE_FORBIDDEN', 'You do not have access to this contract timeline')
    }

    return this.contractRepository.getTimeline(params.tenantId, params.contractId, params.limit)
  }

  async applyContractAction(params: {
    tenantId: string
    contractId: string
    action: ContractActionName
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    noteText?: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'User role is required for contract action')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    if (params.action === 'legal.query.reroute' || params.action === 'hod.bypass') {
      if (!params.noteText?.trim()) {
        throw new BusinessRuleError('REMARK_REQUIRED', 'Remarks are mandatory for this action')
      }
    }

    const updatedContract = await this.contractRepository.applyAction({
      tenantId: params.tenantId,
      contractId: params.contractId,
      action: params.action,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      noteText: params.noteText,
    })

    return this.getContractDetailAfterMutation({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
      updatedContract,
    })
  }

  async addContractNote(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    noteText: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_NOTE_FORBIDDEN', 'User role is required for adding note')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    await this.contractRepository.addContractNote({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      noteText: params.noteText,
    })

    const contract = await this.contractRepository.getById(params.tenantId, params.contractId)

    if (!contract) {
      throw new NotFoundError('Contract', params.contractId)
    }

    return this.getContractDetailAfterMutation({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
      updatedContract: contract,
    })
  }

  async addAdditionalApprover(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    approverEmail: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_APPROVER_FORBIDDEN', 'User role is required for adding approver')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    await this.contractRepository.addAdditionalApprover({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      approverEmail: params.approverEmail,
    })

    const contract = await this.contractRepository.getById(params.tenantId, params.contractId)

    if (!contract) {
      throw new NotFoundError('Contract', params.contractId)
    }

    return this.getContractDetailAfterMutation({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
      updatedContract: contract,
    })
  }

  private async getContractDetailAfterMutation(params: {
    tenantId: string
    contractId: string
    employeeId: string
    role?: string
    updatedContract: ContractDetail
  }): Promise<ContractDetailView> {
    try {
      return await this.getContractDetail({
        tenantId: params.tenantId,
        contractId: params.contractId,
        employeeId: params.employeeId,
        role: params.role,
      })
    } catch (error) {
      if (error instanceof AuthorizationError && error.code === 'CONTRACT_READ_FORBIDDEN') {
        return {
          contract: params.updatedContract,
          availableActions: [],
          additionalApprovers: [],
        }
      }

      throw error
    }
  }
}
