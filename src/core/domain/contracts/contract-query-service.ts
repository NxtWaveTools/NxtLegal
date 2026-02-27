import { AuthorizationError, BusinessRuleError, NotFoundError } from '@/core/http/errors'
import type {
  ContractRepositoryStatus,
  ContractNotificationChannel,
  ContractNotificationStatus,
  ContractNotificationType,
  ContractSignatoryRecipientType,
  ContractStatus,
} from '@/core/constants/contracts'
import { contractStatuses, contractWorkflowRoles } from '@/core/constants/contracts'
import type {
  AdditionalApproverDecisionHistoryItem,
  ContractActivityReadState,
  ContractNotificationDeliverySummary,
  ContractNotificationFailure,
  ContractSigningPreparationDraft,
  ContractSigningPreparationDraftField,
  ContractSigningPreparationDraftRecipient,
  ContractSignatoryField,
  ContractDocument,
  DashboardContractFilter,
  DashboardContractScope,
  ContractDetail,
  ContractDetailView,
  ContractLegalMetadata,
  ContractListItem,
  ContractQueryRepository,
  RepositoryDateBasis,
  RepositoryDatePreset,
  RepositoryExportColumn,
  RepositoryReport,
  RepositoryExportRow,
  RepositorySortBy,
  RepositorySortDirection,
  ContractTimelineEvent,
} from '@/core/domain/contracts/contract-query-repository'
import type { ContractActionName, ContractLegalAssignmentOperation } from '@/core/domain/contracts/schemas'

export class ContractQueryService {
  constructor(private readonly contractRepository: ContractQueryRepository) {}

  async listContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }> {
    return this.contractRepository.listByTenant(params)
  }

  async getPendingApprovalsForRole(params: {
    tenantId: string
    employeeId: string
    role?: string
    limit: number
  }): Promise<ContractListItem[]> {
    return this.contractRepository.getPendingApprovalsForRole(params)
  }

  async getDashboardContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    filter: DashboardContractFilter
    scope?: DashboardContractScope
    cursor?: string
    limit: number
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }> {
    return this.contractRepository.getDashboardContracts(params)
  }

  async getActionableAdditionalApprovals(params: {
    tenantId: string
    employeeId: string
    limit: number
  }): Promise<ContractListItem[]> {
    return this.contractRepository.getActionableAdditionalApprovals(params)
  }

  async getActiveTenantLegalMembers(params: { tenantId: string }): Promise<
    Array<{
      id: string
      email: string
      fullName?: string | null
    }>
  > {
    return this.contractRepository.listActiveTenantLegalMembers(params.tenantId)
  }

  async getAdditionalApproverDecisionHistory(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
    departmentId?: string
  }): Promise<{ items: AdditionalApproverDecisionHistoryItem[]; nextCursor?: string; total: number }> {
    return this.contractRepository.getAdditionalApproverDecisionHistory(params)
  }

  async listRepositoryContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    sortBy?: RepositorySortBy
    sortDirection?: RepositorySortDirection
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }> {
    return this.contractRepository.listRepositoryContracts(params)
  }

  async getRepositoryReport(params: {
    tenantId: string
    employeeId: string
    role?: string
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<RepositoryReport> {
    return this.contractRepository.getRepositoryReport(params)
  }

  async listRepositoryExportRows(params: {
    tenantId: string
    employeeId: string
    role?: string
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
    columns: RepositoryExportColumn[]
  }): Promise<RepositoryExportRow[]> {
    return this.contractRepository.listRepositoryExportRows(params)
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

    const [counterparties, documents, availableActions, additionalApprovers, legalCollaborators, signatories] =
      await Promise.all([
        this.contractRepository.getCounterparties(params.tenantId, params.contractId),
        this.contractRepository.getDocuments(params.tenantId, params.contractId),
        this.contractRepository.getAvailableActions({
          tenantId: params.tenantId,
          contract,
          actorEmployeeId: params.employeeId,
          actorRole: params.role,
        }),
        this.contractRepository.getAdditionalApprovers(params.tenantId, params.contractId),
        this.contractRepository.getLegalCollaborators(params.tenantId, params.contractId),
        this.contractRepository.getSignatories(params.tenantId, params.contractId),
      ])

    return {
      contract,
      counterparties,
      documents,
      availableActions,
      additionalApprovers,
      legalCollaborators,
      signatories,
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

    const isRemarkMandatoryAction =
      params.action === 'legal.query.reroute' ||
      params.action === 'hod.bypass' ||
      params.action === 'hod.reject' ||
      params.action === 'legal.reject' ||
      params.action === 'approver.reject'

    if (isRemarkMandatoryAction && !params.noteText?.trim()) {
      throw new BusinessRuleError('REMARK_REQUIRED', 'Remarks are mandatory for this action')
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

  async addContractActivityMessage(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    messageText: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_ACTIVITY_FORBIDDEN', 'User role is required for adding activity message')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    await this.contractRepository.addContractActivityMessage({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      messageText: params.messageText,
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

  async markContractActivitySeen(params: {
    tenantId: string
    contractId: string
    employeeId: string
    role?: string
  }): Promise<ContractActivityReadState> {
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
      throw new AuthorizationError('CONTRACT_ACTIVITY_FORBIDDEN', 'You do not have access to this contract activity')
    }

    return this.contractRepository.markContractActivitySeen({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.employeeId,
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

  async bypassAdditionalApprover(params: {
    tenantId: string
    contractId: string
    approverId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    reason: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'User role is required for approval bypass')
    }

    if (params.actorRole !== contractWorkflowRoles.legalTeam && params.actorRole !== contractWorkflowRoles.admin) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'Only LEGAL_TEAM or ADMIN can bypass approvals')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    if (!params.reason.trim()) {
      throw new BusinessRuleError('REMARK_REQUIRED', 'Remarks are mandatory for this action')
    }

    await this.contractRepository.bypassAdditionalApprover({
      tenantId: params.tenantId,
      contractId: params.contractId,
      approverId: params.approverId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      reason: params.reason,
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

  async manageLegalAssignment(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    operation: ContractLegalAssignmentOperation
    collaboratorEmail?: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_ASSIGNMENT_FORBIDDEN', 'User role is required for legal assignment')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    if (params.operation === 'add_collaborator') {
      if (!params.collaboratorEmail) {
        throw new BusinessRuleError('COLLABORATOR_EMAIL_REQUIRED', 'Collaborator email is required')
      }

      await this.contractRepository.addLegalCollaboratorByEmail({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
        collaboratorEmail: params.collaboratorEmail,
      })
    }

    if (params.operation === 'remove_collaborator') {
      if (!params.collaboratorEmail) {
        throw new BusinessRuleError('COLLABORATOR_EMAIL_REQUIRED', 'Collaborator email is required')
      }

      await this.contractRepository.removeLegalCollaboratorByEmail({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
        collaboratorEmail: params.collaboratorEmail,
      })
    }

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

  async updateLegalMetadata(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    metadata: ContractLegalMetadata
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_LEGAL_METADATA_FORBIDDEN', 'User role is required for legal metadata')
    }

    if (params.actorRole !== contractWorkflowRoles.legalTeam) {
      throw new AuthorizationError('CONTRACT_LEGAL_METADATA_FORBIDDEN', 'Only LEGAL_TEAM can update legal metadata')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    await this.contractRepository.updateLegalMetadata({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      metadata: params.metadata,
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

  async addSignatory(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    signatoryEmail: string
    recipientType: ContractSignatoryRecipientType
    routingOrder: number
    fieldConfig: ContractSignatoryField[]
    docusignEnvelopeId: string
    docusignRecipientId: string
    envelopeSourceDocumentId: string
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for adding signatory')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    await this.contractRepository.addSignatory({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      signatoryEmail: params.signatoryEmail,
      recipientType: params.recipientType,
      routingOrder: params.routingOrder,
      fieldConfig: params.fieldConfig,
      docusignEnvelopeId: params.docusignEnvelopeId,
      docusignRecipientId: params.docusignRecipientId,
      envelopeSourceDocumentId: params.envelopeSourceDocumentId,
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

  async saveSigningPreparationDraft(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    recipients: ContractSigningPreparationDraftRecipient[]
    fields: ContractSigningPreparationDraftField[]
  }): Promise<ContractSigningPreparationDraft> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signing preparation')
    }

    const contractView = await this.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    if (contractView.contract.status !== contractStatuses.completed) {
      throw new BusinessRuleError(
        'SIGNING_PREPARATION_INVALID_STATUS',
        'Signing preparation drafts can only be saved in COMPLETED'
      )
    }

    return this.contractRepository.saveSigningPreparationDraft({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      recipients: params.recipients,
      fields: params.fields,
    })
  }

  async getSigningPreparationDraft(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
  }): Promise<ContractSigningPreparationDraft | null> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signing preparation')
    }

    const contractView = await this.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    if (contractView.contract.status !== contractStatuses.completed) {
      throw new BusinessRuleError(
        'SIGNING_PREPARATION_INVALID_STATUS',
        'Signing preparation drafts can only be loaded in COMPLETED'
      )
    }

    return this.contractRepository.getSigningPreparationDraft({
      tenantId: params.tenantId,
      contractId: params.contractId,
    })
  }

  async countPendingSignatoriesByContract(params: { tenantId: string; contractId: string }): Promise<number> {
    return this.contractRepository.countPendingSignatoriesByContract(params)
  }

  async moveContractToInSignature(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    envelopeId: string
  }): Promise<void> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signing preparation')
    }

    if (!params.actorEmail) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    await this.contractRepository.moveContractToInSignature({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      envelopeId: params.envelopeId,
    })
  }

  async deleteSigningPreparationDraft(params: { tenantId: string; contractId: string }): Promise<void> {
    await this.contractRepository.deleteSigningPreparationDraft(params)
  }

  async resolveEnvelopeContext(params: { envelopeId: string; recipientEmail?: string }): Promise<{
    tenantId: string
    contractId: string
    signatoryEmail: string
    recipientType: ContractSignatoryRecipientType
    routingOrder: number
  } | null> {
    return this.contractRepository.resolveEnvelopeContext(params)
  }

  async recordDocusignWebhookEvent(params: {
    tenantId: string
    contractId: string
    envelopeId: string
    recipientEmail?: string
    eventType: string
    eventKey: string
    payload: Record<string, unknown>
    signerIp?: string
  }): Promise<{ inserted: boolean }> {
    return this.contractRepository.recordDocusignWebhookEvent(params)
  }

  async addSignatoryWebhookAuditEvent(params: {
    tenantId: string
    contractId: string
    eventType: string
    action: string
    recipientEmail?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.contractRepository.addSignatoryWebhookAuditEvent(params)
  }

  async markSignatoryAsSigned(params: {
    tenantId: string
    envelopeId: string
    recipientEmail?: string
    signedAt?: string
  }): Promise<void> {
    await this.contractRepository.markSignatoryAsSigned({
      tenantId: params.tenantId,
      envelopeId: params.envelopeId,
      recipientEmail: params.recipientEmail,
      signedAt: params.signedAt,
    })
  }

  async getContractDocumentsBySystem(params: { tenantId: string; contractId: string }): Promise<ContractDocument[]> {
    return this.contractRepository.getDocuments(params.tenantId, params.contractId)
  }

  async listFailedNotificationDeliveries(params: {
    tenantId: string
    cursor?: string
    limit: number
    contractId?: string
  }): Promise<{ items: ContractNotificationFailure[]; nextCursor?: string; total: number }> {
    return this.contractRepository.listFailedNotificationDeliveries(params)
  }

  async getEnvelopeNotificationProfile(params: { tenantId: string; contractId: string; envelopeId: string }): Promise<{
    contractTitle: string
    recipientEmails: string[]
  } | null> {
    return this.contractRepository.getEnvelopeNotificationProfile(params)
  }

  async getLatestNotificationDelivery(params: {
    tenantId: string
    contractId: string
    recipientEmail: string
    notificationType: ContractNotificationType
  }): Promise<ContractNotificationDeliverySummary | null> {
    return this.contractRepository.getLatestNotificationDelivery(params)
  }

  async recordContractNotificationDelivery(params: {
    tenantId: string
    contractId: string
    envelopeId?: string
    recipientEmail: string
    channel: ContractNotificationChannel
    notificationType: ContractNotificationType
    templateId: number
    providerName: string
    providerMessageId?: string
    status: ContractNotificationStatus
    retryCount: number
    maxRetries: number
    nextRetryAt?: string
    lastError?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.contractRepository.recordContractNotificationDelivery(params)
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
          counterparties: [],
          documents: [],
          availableActions: [],
          additionalApprovers: [],
          legalCollaborators: [],
          signatories: [],
        }
      }

      throw error
    }
  }
}
