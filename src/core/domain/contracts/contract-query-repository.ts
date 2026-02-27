import type {
  ContractUploadMode,
  ContractRepositoryStatus,
  ContractNotificationChannel,
  ContractNotificationStatus,
  ContractNotificationType,
  ContractSignatoryFieldType,
  ContractSignatoryRecipientType,
  ContractSignatoryStatus,
  ContractStatus,
} from '@/core/constants/contracts'
import type { ContractActionName } from '@/core/domain/contracts/schemas'

export type ContractListItem = {
  id: string
  title: string
  status: ContractStatus
  voidReason?: string | null
  displayStatusLabel?: string
  repositoryStatus?: ContractRepositoryStatus
  repositoryStatusLabel?: string
  creatorName?: string | null
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
  latestAdditionalApproverRejectionReason?: string | null
  latestAdditionalApproverRejectionAt?: string | null
  isAdditionalApproverActionable?: boolean
  hodApprovedAt?: string | null
  tatDeadlineAt?: string | null
  tatBreachedAt?: string | null
  agingBusinessDays?: number | null
  nearBreach?: boolean
  isTatBreached?: boolean
  isAssignedToMe?: boolean
  hasUnreadActivity?: boolean
  canHodApprove?: boolean
  canHodReject?: boolean
  requestCreatedAt?: string | null
  departmentId?: string | null
  departmentName?: string | null
  uploadMode?: ContractUploadMode
  assignedToUsers?: string[]
  legalEffectiveDate?: string | null
  legalTerminationDate?: string | null
  legalNoticePeriod?: string | null
  legalAutoRenewal?: boolean | null
  createdAt: string
  updatedAt: string
}

export type DashboardContractFilter =
  | 'ALL'
  | 'HOD_PENDING'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'ASSIGNED_TO_ME'

export type RepositorySortBy = 'title' | 'created_at' | 'hod_approved_at' | 'status' | 'tat_deadline_at'
export type RepositorySortDirection = 'asc' | 'desc'
export type RepositoryDateBasis = 'request_created_at' | 'hod_approved_at'
export type RepositoryDatePreset = 'week' | 'month' | 'multiple_months' | 'quarter' | 'year' | 'custom'
export type RepositoryStatusMetricKey =
  | 'executed'
  | 'completed'
  | 'under_review'
  | 'pending_internal'
  | 'pending_external'
  | 'hod_approval_pending'
  | 'tat_breached'
export type RepositoryExportFormat = 'csv' | 'excel' | 'pdf'
export type RepositoryExportColumn =
  | 'request_date'
  | 'creator'
  | 'department'
  | 'hod_approval'
  | 'approval_date'
  | 'tat'
  | 'contract_aging'
  | 'status'
  | 'assigned_to'
  | 'effective_date'
  | 'termination_date'
  | 'notice_period'
  | 'auto_renewal'
  | 'tat_breached'
  | 'overdue_days'
  | 'contract_title'

export type RepositoryDepartmentMetric = {
  departmentId: string | null
  departmentName: string | null
  totalRequestsReceived: number
  approved: number
  rejected: number
  completed: number
  pending: number
}

export type RepositoryStatusMetric = {
  key: RepositoryStatusMetricKey
  label: string
  count: number
}

export type RepositoryReport = {
  departmentMetrics: RepositoryDepartmentMetric[]
  statusMetrics: RepositoryStatusMetric[]
}

export type RepositoryExportRow = Record<RepositoryExportColumn, string | number>

export type ContractDetail = ContractListItem & {
  contractTypeId: string
  contractTypeName?: string
  counterpartyName?: string | null
  departmentId: string
  departmentName?: string
  departmentHodName?: string | null
  departmentHodEmail?: string | null
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  budgetApproved: boolean
  legalEffectiveDate?: string | null
  legalTerminationDate?: string | null
  legalNoticePeriod?: string | null
  legalAutoRenewal?: boolean | null
  requestCreatedAt: string
  currentDocumentId?: string | null
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  filePath: string
  rowVersion: number
}

export type ContractLegalMetadata = {
  effectiveDate: string | null
  terminationDate: string | null
  noticePeriod: string | null
  autoRenewal: boolean | null
}

export type ContractCounterparty = {
  id: string
  counterpartyName: string
  sequenceOrder: number
}

export type ContractDocument = {
  id: string
  documentKind: 'PRIMARY' | 'COUNTERPARTY_SUPPORTING' | 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
  versionNumber?: number
  counterpartyId?: string | null
  counterpartyName?: string | null
  displayName: string
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  createdAt: string
}

export type ContractTimelineEvent = {
  id: string
  eventType: string | null
  action: string
  userId: string
  actorEmail?: string | null
  actorRole?: string | null
  targetEmail?: string | null
  noteText?: string | null
  metadata?: Record<string, unknown> | null
  eventSequence?: number | null
  createdAt: string
}

export type ContractActivityReadState = {
  contractId: string
  employeeId: string
  lastSeenEventSequence: number | null
  lastSeenAt: string | null
  hasUnread: boolean
}

export type ContractAllowedAction = {
  action: ContractActionName
  label: string
  requiresRemark: boolean
}

export type ContractAdditionalApprover = {
  id: string
  approverEmployeeId: string
  approverEmail: string
  sequenceOrder: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED'
  approvedAt: string | null
}

export type ContractLegalCollaborator = {
  id: string
  collaboratorEmployeeId: string
  collaboratorEmail: string
  createdAt: string
}

export type ContractLegalTeamMember = {
  id: string
  email: string
  fullName?: string | null
}

export type ContractSignatory = {
  id: string
  signatoryEmail: string
  recipientType: ContractSignatoryRecipientType
  routingOrder: number
  fieldConfig: ContractSignatoryField[]
  status: ContractSignatoryStatus
  signedAt: string | null
  docusignEnvelopeId: string
  docusignRecipientId: string
  createdAt: string
}

export type ContractSignatoryField = {
  fieldType: ContractSignatoryFieldType
  pageNumber: number | null
  xPosition: number | null
  yPosition: number | null
  anchorString: string | null
  assignedSignerEmail: string
}

export type ContractSigningPreparationDraftRecipient = {
  name: string
  email: string
  recipientType: ContractSignatoryRecipientType
  routingOrder: number
}

export type ContractSigningPreparationDraftField = {
  fieldType: ContractSignatoryFieldType
  pageNumber: number | null
  xPosition: number | null
  yPosition: number | null
  anchorString: string | null
  assignedSignerEmail: string
}

export type ContractSigningPreparationDraft = {
  contractId: string
  recipients: ContractSigningPreparationDraftRecipient[]
  fields: ContractSigningPreparationDraftField[]
  createdByEmployeeId: string
  updatedByEmployeeId: string
  createdAt: string
  updatedAt: string
}

export type ContractDetailView = {
  contract: ContractDetail
  counterparties: ContractCounterparty[]
  documents: ContractDocument[]
  availableActions: ContractAllowedAction[]
  additionalApprovers: ContractAdditionalApprover[]
  legalCollaborators: ContractLegalCollaborator[]
  signatories: ContractSignatory[]
}

export type ContractNotificationFailure = {
  id: string
  contractId: string
  envelopeId: string | null
  recipientEmail: string
  notificationType: ContractNotificationType
  templateId: number
  providerName: string
  providerMessageId: string | null
  retryCount: number
  maxRetries: number
  nextRetryAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type ContractNotificationDeliverySummary = {
  id: string
  createdAt: string
  status: ContractNotificationStatus
}

export type AdditionalApproverDecisionHistoryItem = {
  contractId: string
  contractTitle: string
  contractStatus: ContractStatus
  contractDisplayStatusLabel: string
  departmentId: string | null
  departmentName: string | null
  actorEmail: string | null
  decision: 'APPROVED' | 'REJECTED'
  decidedAt: string
  reason: string | null
}

export interface ContractQueryRepository {
  listByTenant(params: {
    tenantId: string
    cursor?: string
    limit: number
    role?: string
    employeeId: string
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }>
  getPendingApprovalsForRole(params: {
    tenantId: string
    employeeId: string
    role?: string
    limit: number
  }): Promise<ContractListItem[]>
  getDashboardContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    filter: DashboardContractFilter
    cursor?: string
    limit: number
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }>
  getActionableAdditionalApprovals(params: {
    tenantId: string
    employeeId: string
    limit: number
  }): Promise<ContractListItem[]>
  getAdditionalApproverDecisionHistory(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
    departmentId?: string
  }): Promise<{ items: AdditionalApproverDecisionHistoryItem[]; nextCursor?: string; total: number }>
  listRepositoryContracts(params: {
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
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }>
  getRepositoryReport(params: {
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
  }): Promise<RepositoryReport>
  listRepositoryExportRows(params: {
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
  }): Promise<RepositoryExportRow[]>
  getById(tenantId: string, contractId: string): Promise<ContractDetail | null>
  getCounterparties(tenantId: string, contractId: string): Promise<ContractCounterparty[]>
  getDocuments(tenantId: string, contractId: string): Promise<ContractDocument[]>
  getTimeline(tenantId: string, contractId: string, limit: number): Promise<ContractTimelineEvent[]>
  getAdditionalApprovers(tenantId: string, contractId: string): Promise<ContractAdditionalApprover[]>
  getLegalCollaborators(tenantId: string, contractId: string): Promise<ContractLegalCollaborator[]>
  listActiveTenantLegalMembers(tenantId: string): Promise<ContractLegalTeamMember[]>
  isLegalCollaborator(tenantId: string, contractId: string, employeeId: string): Promise<boolean>
  getSignatories(tenantId: string, contractId: string): Promise<ContractSignatory[]>
  canAccessContract(params: {
    tenantId: string
    actorEmployeeId: string
    actorRole?: string
    contract: ContractDetail
  }): Promise<boolean>
  getAvailableActions(params: {
    tenantId: string
    contract: ContractDetail
    actorEmployeeId: string
    actorRole?: string
  }): Promise<ContractAllowedAction[]>
  applyAction(params: {
    tenantId: string
    contractId: string
    action: ContractActionName
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    noteText?: string
  }): Promise<ContractDetail>
  addAdditionalApprover(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    approverEmail: string
  }): Promise<void>
  updateLegalMetadata(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    metadata: ContractLegalMetadata
  }): Promise<void>
  bypassAdditionalApprover(params: {
    tenantId: string
    contractId: string
    approverId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    reason: string
  }): Promise<void>
  setLegalOwnerByEmail(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    ownerEmail: string
  }): Promise<void>
  addLegalCollaboratorByEmail(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    collaboratorEmail: string
  }): Promise<void>
  removeLegalCollaboratorByEmail(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    collaboratorEmail: string
  }): Promise<void>
  addSignatory(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    signatoryEmail: string
    recipientType: ContractSignatoryRecipientType
    routingOrder: number
    fieldConfig: ContractSignatoryField[]
    docusignEnvelopeId: string
    docusignRecipientId: string
    envelopeSourceDocumentId: string
  }): Promise<void>
  saveSigningPreparationDraft(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    recipients: ContractSigningPreparationDraftRecipient[]
    fields: ContractSigningPreparationDraftField[]
  }): Promise<ContractSigningPreparationDraft>
  getSigningPreparationDraft(params: {
    tenantId: string
    contractId: string
  }): Promise<ContractSigningPreparationDraft | null>
  countPendingSignatoriesByContract(params: { tenantId: string; contractId: string }): Promise<number>
  moveContractToInSignature(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    envelopeId: string
  }): Promise<void>
  deleteSigningPreparationDraft(params: { tenantId: string; contractId: string }): Promise<void>
  resolveEnvelopeContext(params: { envelopeId: string; recipientEmail?: string }): Promise<{
    tenantId: string
    contractId: string
    signatoryEmail: string
    signatoryStatus: ContractSignatoryStatus
    contractStatus: ContractStatus
    recipientType: ContractSignatoryRecipientType
    routingOrder: number
  } | null>
  recordDocusignWebhookEvent(params: {
    tenantId: string
    contractId: string
    envelopeId: string
    recipientEmail?: string
    eventType: string
    eventKey: string
    payload: Record<string, unknown>
    signerIp?: string
  }): Promise<{ inserted: boolean }>
  addSignatoryWebhookAuditEvent(params: {
    tenantId: string
    contractId: string
    eventType: string
    action: string
    recipientEmail?: string
    metadata?: Record<string, unknown>
  }): Promise<void>
  markSignatoryAsSigned(params: {
    tenantId: string
    envelopeId: string
    recipientEmail?: string
    signedAt?: string
  }): Promise<void>
  listFailedNotificationDeliveries(params: {
    tenantId: string
    cursor?: string
    limit: number
    contractId?: string
  }): Promise<{ items: ContractNotificationFailure[]; nextCursor?: string; total: number }>
  getEnvelopeNotificationProfile(params: { tenantId: string; contractId: string; envelopeId: string }): Promise<{
    contractTitle: string
    recipientEmails: string[]
  } | null>
  getLatestNotificationDelivery(params: {
    tenantId: string
    contractId: string
    recipientEmail: string
    notificationType: ContractNotificationType
  }): Promise<ContractNotificationDeliverySummary | null>
  recordContractNotificationDelivery(params: {
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
  }): Promise<void>
  addContractNote(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    noteText: string
  }): Promise<void>
  addContractActivityMessage(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    messageText: string
  }): Promise<void>
  markContractActivitySeen(params: {
    tenantId: string
    contractId: string
    employeeId: string
  }): Promise<ContractActivityReadState>
}
