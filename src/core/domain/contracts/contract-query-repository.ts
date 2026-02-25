import type {
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
  displayStatusLabel?: string
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
  createdAt: string
  updatedAt: string
}

export type DashboardContractFilter = 'ALL' | 'HOD_PENDING' | 'LEGAL_PENDING' | 'FINAL_APPROVED' | 'LEGAL_QUERY'

export type RepositorySortBy = 'title' | 'created_at' | 'hod_approved_at' | 'status' | 'tat_deadline_at'
export type RepositorySortDirection = 'asc' | 'desc'

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
  requestCreatedAt: string
  currentDocumentId?: string | null
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  filePath: string
  rowVersion: number
}

export type ContractDocument = {
  id: string
  documentKind: 'PRIMARY' | 'COUNTERPARTY_SUPPORTING' | 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
  versionNumber?: number
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
  createdAt: string
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approvedAt: string | null
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
  documents: ContractDocument[]
  availableActions: ContractAllowedAction[]
  additionalApprovers: ContractAdditionalApprover[]
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
    sortBy?: RepositorySortBy
    sortDirection?: RepositorySortDirection
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }>
  getById(tenantId: string, contractId: string): Promise<ContractDetail | null>
  getDocuments(tenantId: string, contractId: string): Promise<ContractDocument[]>
  getTimeline(tenantId: string, contractId: string, limit: number): Promise<ContractTimelineEvent[]>
  getAdditionalApprovers(tenantId: string, contractId: string): Promise<ContractAdditionalApprover[]>
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
}
