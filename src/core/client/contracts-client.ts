import { routeRegistry } from '@/core/config/route-registry'
import type { ApiResponse } from '@/core/http/response'
import type { ContractUploadMode } from '@/core/constants/contracts'

type ContractActionName =
  | 'hod.approve'
  | 'hod.reject'
  | 'hod.bypass'
  | 'legal.set.under_review'
  | 'legal.set.pending_internal'
  | 'legal.set.pending_external'
  | 'legal.set.offline_execution'
  | 'legal.set.on_hold'
  | 'legal.set.completed'
  | 'legal.void'
  | 'legal.approve'
  | 'legal.reject'
  | 'legal.query'
  | 'legal.query.reroute'
  | 'approver.approve'
  | 'approver.reject'

type ContractBypassApprovalActionName = 'BYPASS_APPROVAL'

type ContractRecord = {
  id: string
  title: string
  voidReason?: string | null
  creatorName?: string | null
  contractTypeId?: string
  contractTypeName?: string
  counterpartyName?: string | null
  counterparties?: Array<{
    id: string
    counterpartyName: string
    sequenceOrder: number
  }>
  status: string
  displayStatusLabel?: string
  repositoryStatus?: string
  repositoryStatusLabel?: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
  latestAdditionalApproverRejectionReason?: string | null
  latestAdditionalApproverRejectionAt?: string | null
  isAdditionalApproverActionable?: boolean
  hodApprovedAt?: string | null
  departmentId?: string
  departmentName?: string
  departmentHodName?: string | null
  departmentHodEmail?: string | null
  assignedToUsers?: string[]
  signatoryName?: string
  signatoryDesignation?: string
  signatoryEmail?: string
  backgroundOfRequest?: string
  budgetApproved?: boolean
  legalEffectiveDate?: string | null
  legalTerminationDate?: string | null
  legalNoticePeriod?: string | null
  legalAutoRenewal?: boolean | null
  requestCreatedAt?: string
  currentDocumentId?: string | null
  tatDeadlineAt?: string | null
  tatBreachedAt?: string | null
  agingBusinessDays?: number | null
  nearBreach?: boolean
  isTatBreached?: boolean
  isAssignedToMe?: boolean
  hasUnreadActivity?: boolean
  canHodApprove?: boolean
  canHodReject?: boolean
  fileName?: string
  fileSizeBytes?: number
  fileMimeType?: string
  createdAt: string
  updatedAt: string
}

type ContractDocument = {
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

type DashboardContractsFilter = 'ALL' | 'HOD_PENDING' | 'UNDER_REVIEW' | 'COMPLETED' | 'ON_HOLD' | 'ASSIGNED_TO_ME'

type RepositorySortBy = 'title' | 'created_at' | 'hod_approved_at' | 'status' | 'tat_deadline_at'
type RepositorySortDirection = 'asc' | 'desc'
type RepositoryDateBasis = 'request_created_at' | 'hod_approved_at'
type RepositoryDatePreset = 'week' | 'month' | 'multiple_months' | 'quarter' | 'year' | 'custom'
type RepositoryStatusFilter =
  | 'HOD_APPROVAL_PENDING'
  | 'UNDER_REVIEW'
  | 'OFFLINE_EXECUTION'
  | 'PENDING_WITH_EXTERNAL_STAKEHOLDERS'
  | 'PENDING_WITH_INTERNAL_STAKEHOLDERS'
  | 'ON_HOLD'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXECUTED'
type RepositoryExportFormat = 'csv' | 'excel' | 'pdf'
type RepositoryExportColumn =
  | 'request_date'
  | 'creator'
  | 'department'
  | 'hod_approval'
  | 'approval_date'
  | 'tat'
  | 'contract_aging'
  | 'status'
  | 'assigned_to'
  | 'tat_breached'
  | 'overdue_days'
  | 'contract_title'

type RepositoryDepartmentMetric = {
  departmentId: string | null
  departmentName: string | null
  totalRequestsReceived: number
  approved: number
  rejected: number
  completed: number
  pending: number
}

type RepositoryStatusMetric = {
  key:
    | 'executed'
    | 'completed'
    | 'under_review'
    | 'pending_internal'
    | 'pending_external'
    | 'hod_approval_pending'
    | 'tat_breached'
  label: string
  count: number
}

type RepositoryReportResponse = {
  report: {
    departmentMetrics: RepositoryDepartmentMetric[]
    statusMetrics: RepositoryStatusMetric[]
  }
}

type ContractTimelineEvent = {
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

type ContractActivityReadState = {
  contractId: string
  employeeId: string
  lastSeenEventSequence: number | null
  lastSeenAt: string | null
  hasUnread: boolean
}

type ContractAllowedAction = {
  action: ContractActionName
  label: string
  requiresRemark: boolean
}

type ContractAdditionalApprover = {
  id: string
  approverEmployeeId: string
  approverEmail: string
  sequenceOrder: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED'
  approvedAt: string | null
}

type ContractApproverReminderResponse = {
  remindedApproverEmail: string
  remindedApproverRole: 'HOD' | 'ADDITIONAL'
}

type ContractLegalCollaborator = {
  id: string
  collaboratorEmployeeId: string
  collaboratorEmail: string
  createdAt: string
}

type ContractSignatory = {
  id: string
  signatoryEmail: string
  recipientType: 'INTERNAL' | 'EXTERNAL'
  routingOrder: number
  fieldConfig: Array<{
    fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
    pageNumber: number | null
    xPosition: number | null
    yPosition: number | null
    anchorString: string | null
    assignedSignerEmail: string
  }>
  status: 'PENDING' | 'SIGNED'
  signedAt: string | null
  docusignEnvelopeId: string
  docusignRecipientId: string
  createdAt: string
}

type ContractSigningPreparationDraft = {
  contractId: string
  recipients: Array<{
    name: string
    email: string
    recipientType: 'INTERNAL' | 'EXTERNAL'
    routingOrder: number
  }>
  fields: Array<{
    fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
    pageNumber: number | null
    xPosition: number | null
    yPosition: number | null
    anchorString: string | null
    assignedSignerEmail: string
  }>
  createdByEmployeeId: string
  updatedByEmployeeId: string
  createdAt: string
  updatedAt: string
}

type ContractDetailResponse = {
  contract: ContractRecord
  counterparties: Array<{
    id: string
    counterpartyName: string
    sequenceOrder: number
  }>
  documents: ContractDocument[]
  availableActions: ContractAllowedAction[]
  additionalApprovers: ContractAdditionalApprover[]
  legalCollaborators: ContractLegalCollaborator[]
  signatories: ContractSignatory[]
}

type LegalAssignmentPayload =
  | { operation: 'add_collaborator'; collaboratorEmail: string }
  | { operation: 'remove_collaborator'; collaboratorEmail: string }

type LegalMetadataPayload = {
  effectiveDate: string | null
  terminationDate: string | null
  noticePeriod: string | null
  autoRenewal: boolean | null
}

type ContractListResponse = {
  contracts: ContractRecord[]
  pagination: {
    cursor: string | null
    limit: number
    total: number
  }
}

type DashboardContractsResponse = ContractListResponse & {
  filter: DashboardContractsFilter
  additionalApproverSections?: {
    actionableContracts: ContractRecord[]
  }
}

type AdditionalApproverDecisionHistoryRecord = {
  contractId: string
  contractTitle: string
  contractStatus: string
  contractDisplayStatusLabel: string
  departmentId: string | null
  departmentName: string | null
  actorEmail: string | null
  decision: 'APPROVED' | 'REJECTED'
  decidedAt: string
  reason: string | null
}

type AdditionalApproverHistoryResponse = {
  history: AdditionalApproverDecisionHistoryRecord[]
  pagination: {
    cursor: string | null
    limit: number
    total: number
  }
}

type DepartmentOption = {
  id: string
  name: string
  hodName?: string | null
  hodEmail?: string | null
}

type ContractTypeOption = {
  id: string
  name: string
}

type LegalTeamMemberOption = {
  id: string
  email: string
  fullName?: string | null
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid_json_response',
        message: 'Unexpected response from server',
      },
    }
  }
}

function resolveContractPath(template: string, contractId: string): string {
  return template.replace(':contractId', contractId)
}

function resolveProtectedContractPath(
  contractId: string,
  options?: {
    from?: 'dashboard' | 'repository'
    filter?: DashboardContractsFilter
  }
): string {
  const basePath = routeRegistry.protected.contractDetail.replace(':contractId', contractId)
  const query = new URLSearchParams()

  if (options?.from) {
    query.set('from', options.from)
  }

  if (options?.filter) {
    query.set('filter', options.filter)
  }

  if (query.size === 0) {
    return basePath
  }

  return `${basePath}?${query.toString()}`
}

export const contractsClient = {
  async contractTypes(): Promise<ApiResponse<{ contractTypes: ContractTypeOption[] }>> {
    const response = await fetch(routeRegistry.api.contracts.contractTypes, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ contractTypes: ContractTypeOption[] }>(response)
  },

  async departments(): Promise<ApiResponse<{ departments: DepartmentOption[] }>> {
    const response = await fetch(routeRegistry.api.contracts.departments, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ departments: DepartmentOption[] }>(response)
  },

  async legalTeamMembers(): Promise<ApiResponse<{ members: LegalTeamMemberOption[] }>> {
    const response = await fetch(routeRegistry.api.contracts.legalTeamMembers, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ members: LegalTeamMemberOption[] }>(response)
  },

  async list(params?: { cursor?: string; limit?: number }): Promise<ApiResponse<ContractListResponse>> {
    const query = new URLSearchParams()

    if (params?.cursor) {
      query.set('cursor', params.cursor)
    }

    if (params?.limit) {
      query.set('limit', String(params.limit))
    }

    const url =
      query.size > 0 ? `${routeRegistry.api.contracts.list}?${query.toString()}` : routeRegistry.api.contracts.list
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<ContractListResponse>(response)
  },

  async pendingApprovals(params?: { limit?: number }): Promise<ApiResponse<ContractListResponse>> {
    const query = new URLSearchParams()

    if (params?.limit) {
      query.set('limit', String(params.limit))
    }

    const url =
      query.size > 0
        ? `${routeRegistry.api.contracts.pendingApprovals}?${query.toString()}`
        : routeRegistry.api.contracts.pendingApprovals

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<ContractListResponse>(response)
  },

  async dashboardContracts(params: {
    filter: DashboardContractsFilter
    cursor?: string
    limit?: number
    includeExtras?: boolean
  }): Promise<ApiResponse<DashboardContractsResponse>> {
    const query = new URLSearchParams()
    query.set('filter', params.filter)

    if (params.cursor) {
      query.set('cursor', params.cursor)
    }

    if (params.limit) {
      query.set('limit', String(params.limit))
    }

    if (typeof params.includeExtras === 'boolean') {
      query.set('includeExtras', String(params.includeExtras))
    }

    const response = await fetch(`${routeRegistry.api.contracts.dashboard}?${query.toString()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<DashboardContractsResponse>(response)
  },

  async additionalApproverHistory(params?: {
    cursor?: string
    limit?: number
    departmentId?: string
  }): Promise<ApiResponse<AdditionalApproverHistoryResponse>> {
    const query = new URLSearchParams()

    if (params?.cursor) {
      query.set('cursor', params.cursor)
    }

    if (params?.limit) {
      query.set('limit', String(params.limit))
    }

    if (params?.departmentId) {
      query.set('departmentId', params.departmentId)
    }

    const url =
      query.size > 0
        ? `${routeRegistry.api.contracts.additionalApproverHistory}?${query.toString()}`
        : routeRegistry.api.contracts.additionalApproverHistory

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<AdditionalApproverHistoryResponse>(response)
  },

  async repositoryList(params?: {
    cursor?: string
    limit?: number
    search?: string
    status?: string
    repositoryStatus?: RepositoryStatusFilter
    sortBy?: RepositorySortBy
    sortDirection?: RepositorySortDirection
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<ApiResponse<ContractListResponse>> {
    const query = new URLSearchParams()

    if (params?.cursor) {
      query.set('cursor', params.cursor)
    }

    if (params?.limit) {
      query.set('limit', String(params.limit))
    }

    if (params?.search?.trim()) {
      query.set('search', params.search.trim())
    }

    if (params?.status) {
      query.set('status', params.status)
    }

    if (params?.repositoryStatus) {
      query.set('repositoryStatus', params.repositoryStatus)
    }

    if (params?.sortBy) {
      query.set('sortBy', params.sortBy)
    }

    if (params?.sortDirection) {
      query.set('sortDirection', params.sortDirection)
    }

    if (params?.dateBasis) {
      query.set('dateBasis', params.dateBasis)
    }

    if (params?.datePreset) {
      query.set('datePreset', params.datePreset)
    }

    if (params?.fromDate) {
      query.set('fromDate', params.fromDate)
    }

    if (params?.toDate) {
      query.set('toDate', params.toDate)
    }

    const url =
      query.size > 0
        ? `${routeRegistry.api.contracts.repository}?${query.toString()}`
        : routeRegistry.api.contracts.repository

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<ContractListResponse>(response)
  },

  async repositoryReport(params?: {
    search?: string
    status?: string
    repositoryStatus?: RepositoryStatusFilter
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<ApiResponse<RepositoryReportResponse>> {
    const query = new URLSearchParams()

    if (params?.search?.trim()) {
      query.set('search', params.search.trim())
    }

    if (params?.status) {
      query.set('status', params.status)
    }

    if (params?.repositoryStatus) {
      query.set('repositoryStatus', params.repositoryStatus)
    }

    if (params?.dateBasis) {
      query.set('dateBasis', params.dateBasis)
    }

    if (params?.datePreset) {
      query.set('datePreset', params.datePreset)
    }

    if (params?.fromDate) {
      query.set('fromDate', params.fromDate)
    }

    if (params?.toDate) {
      query.set('toDate', params.toDate)
    }

    const url =
      query.size > 0
        ? `${routeRegistry.api.contracts.repositoryReport}?${query.toString()}`
        : routeRegistry.api.contracts.repositoryReport

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<RepositoryReportResponse>(response)
  },

  repositoryExportUrl(params?: {
    search?: string
    status?: string
    repositoryStatus?: RepositoryStatusFilter
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
    format?: RepositoryExportFormat
    columns?: RepositoryExportColumn[]
  }): string {
    const query = new URLSearchParams()

    if (params?.search?.trim()) {
      query.set('search', params.search.trim())
    }

    if (params?.status) {
      query.set('status', params.status)
    }

    if (params?.repositoryStatus) {
      query.set('repositoryStatus', params.repositoryStatus)
    }

    if (params?.dateBasis) {
      query.set('dateBasis', params.dateBasis)
    }

    if (params?.datePreset) {
      query.set('datePreset', params.datePreset)
    }

    if (params?.fromDate) {
      query.set('fromDate', params.fromDate)
    }

    if (params?.toDate) {
      query.set('toDate', params.toDate)
    }

    if (params?.format) {
      query.set('format', params.format)
    }

    if (params?.columns?.length) {
      query.set('columns', params.columns.join(','))
    }

    return query.size > 0
      ? `${routeRegistry.api.contracts.repositoryExport}?${query.toString()}`
      : routeRegistry.api.contracts.repositoryExport
  },

  async detail(contractId: string): Promise<ApiResponse<ContractDetailResponse>> {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.detail, contractId), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async timeline(contractId: string): Promise<ApiResponse<{ events: ContractTimelineEvent[] }>> {
    const response = await fetch(`${resolveContractPath(routeRegistry.api.contracts.timeline, contractId)}?limit=20`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ events: ContractTimelineEvent[] }>(response)
  },

  async addActivityMessage(contractId: string, payload: { messageText: string }) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.activity, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async markActivitySeen(contractId: string) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.activityReadState, contractId), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ markSeen: true }),
    })

    return parseApiResponse<ContractActivityReadState>(response)
  },

  async upload(params: {
    title: string
    contractTypeId: string
    counterpartyName?: string
    counterparties?: Array<{
      counterpartyName: string
      supportingFiles: File[]
    }>
    signatoryName?: string
    signatoryDesignation?: string
    signatoryEmail?: string
    backgroundOfRequest?: string
    departmentId?: string
    budgetApproved?: boolean
    uploadMode?: ContractUploadMode
    bypassHodApproval?: boolean
    bypassReason?: string
    file: File
    supportingFiles?: File[]
    idempotencyKey: string
  }): Promise<ApiResponse<{ contract: ContractRecord }>> {
    const formData = new FormData()
    formData.set('title', params.title)
    formData.set('contractTypeId', params.contractTypeId)
    if (params.signatoryName) {
      formData.set('signatoryName', params.signatoryName)
    }
    if (params.signatoryDesignation) {
      formData.set('signatoryDesignation', params.signatoryDesignation)
    }
    if (params.signatoryEmail) {
      formData.set('signatoryEmail', params.signatoryEmail)
    }
    if (params.backgroundOfRequest) {
      formData.set('backgroundOfRequest', params.backgroundOfRequest)
    }
    if (params.departmentId) {
      formData.set('departmentId', params.departmentId)
    }
    if (typeof params.budgetApproved === 'boolean') {
      formData.set('budgetApproved', String(params.budgetApproved))
    }
    if (params.uploadMode) {
      formData.set('uploadMode', params.uploadMode)
    }
    if (typeof params.bypassHodApproval === 'boolean') {
      formData.set('bypassHodApproval', String(params.bypassHodApproval))
    }
    if (params.bypassReason?.trim()) {
      formData.set('bypassReason', params.bypassReason.trim())
    }
    if (params.counterpartyName?.trim()) {
      formData.set('counterpartyName', params.counterpartyName.trim())
    }
    formData.set('file', params.file)

    if (params.counterparties && params.counterparties.length > 0) {
      const flattenedSupportingFiles: File[] = []
      const counterpartiesPayload = params.counterparties.map((counterparty) => {
        const supportingFileIndices: number[] = []
        for (const file of counterparty.supportingFiles) {
          supportingFileIndices.push(flattenedSupportingFiles.length)
          flattenedSupportingFiles.push(file)
        }

        return {
          counterpartyName: counterparty.counterpartyName,
          supportingFileIndices,
        }
      })

      formData.set('counterparties', JSON.stringify(counterpartiesPayload))
      for (const supportingFile of flattenedSupportingFiles) {
        formData.append('supportingFiles', supportingFile)
      }
    } else {
      for (const supportingFile of params.supportingFiles ?? []) {
        formData.append('supportingFiles', supportingFile)
      }
    }

    const response = await fetch(routeRegistry.api.contracts.upload, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Idempotency-Key': params.idempotencyKey,
      },
      body: formData,
    })

    return parseApiResponse<{ contract: ContractRecord }>(response)
  },

  async replaceMainDocument(params: {
    contractId: string
    file: File
    idempotencyKey: string
  }): Promise<ApiResponse<{ document: ContractDocument }>> {
    const formData = new FormData()
    formData.set('file', params.file)

    const response = await fetch(
      resolveContractPath(routeRegistry.api.contracts.replaceMainDocument, params.contractId),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Idempotency-Key': params.idempotencyKey,
        },
        body: formData,
      }
    )

    return parseApiResponse<{ document: ContractDocument }>(response)
  },

  async action(
    contractId: string,
    payload:
      | { action: ContractActionName; noteText?: string }
      | { action: ContractBypassApprovalActionName; approverId: string; reason: string }
  ) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.action, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async addNote(contractId: string, payload: { noteText: string }) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.note, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async addApprover(contractId: string, payload: { approverEmail: string }) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.approvers, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async remindApprover(contractId: string, payload?: { approverEmail?: string }) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.approverReminder, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approverEmail: payload?.approverEmail }),
    })

    return parseApiResponse<ContractApproverReminderResponse>(response)
  },

  async manageAssignment(contractId: string, payload: LegalAssignmentPayload) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.assignments, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async updateLegalMetadata(contractId: string, payload: LegalMetadataPayload) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.legalMetadata, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async addSignatory(
    contractId: string,
    payload:
      | { signatoryEmail: string }
      | {
          recipients: Array<{
            signatoryEmail: string
            recipientType: 'INTERNAL' | 'EXTERNAL'
            routingOrder: number
            fields: Array<{
              field_type: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
              page_number?: number
              x_position?: number
              y_position?: number
              anchor_string?: string
              assigned_signer_email: string
            }>
          }>
        }
  ) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.signatories, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractDetailResponse>(response)
  },

  async saveSigningPreparationDraft(
    contractId: string,
    payload: {
      recipients: Array<{
        name: string
        email: string
        recipient_type: 'INTERNAL' | 'EXTERNAL'
        routing_order: number
      }>
      fields: Array<{
        field_type: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
        page_number?: number
        x_position?: number
        y_position?: number
        anchor_string?: string
        assigned_signer_email: string
      }>
    }
  ) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.signingPreparationDraft, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<ContractSigningPreparationDraft>(response)
  },

  async getSigningPreparationDraft(contractId: string) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.signingPreparationDraft, contractId), {
      method: 'GET',
      credentials: 'include',
    })

    return parseApiResponse<ContractSigningPreparationDraft | null>(response)
  },

  async sendSigningPreparationDraft(contractId: string) {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.signingPreparationSend, contractId), {
      method: 'POST',
      credentials: 'include',
    })

    return parseApiResponse<{ envelopeId: string; contractView: ContractDetailResponse }>(response)
  },

  async download(
    contractId: string,
    options?: { documentId?: string }
  ): Promise<ApiResponse<{ signedUrl: string; fileName: string }>> {
    const path = resolveContractPath(routeRegistry.api.contracts.download, contractId)
    const query = new URLSearchParams()
    if (options?.documentId) {
      query.set('documentId', options.documentId)
    }

    const url = query.size > 0 ? `${path}?${query.toString()}` : path

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    })

    return parseApiResponse<{ signedUrl: string; fileName: string }>(response)
  },

  previewUrl(contractId: string, options?: { documentId?: string; renderAs?: 'binary' | 'html' }): string {
    const path = resolveContractPath(routeRegistry.api.contracts.preview, contractId)
    const query = new URLSearchParams()
    if (options?.documentId) {
      query.set('documentId', options.documentId)
    }
    if (options?.renderAs === 'html') {
      query.set('render', 'html')
    }

    return query.size > 0 ? `${path}?${query.toString()}` : path
  },

  resolveProtectedContractPath,
}

export type {
  ContractRecord,
  ContractDocument,
  DepartmentOption,
  LegalTeamMemberOption,
  ContractTypeOption,
  ContractTimelineEvent,
  ContractActivityReadState,
  ContractActionName,
  ContractAllowedAction,
  ContractAdditionalApprover,
  ContractApproverReminderResponse,
  ContractLegalCollaborator,
  ContractSignatory,
  ContractSigningPreparationDraft,
  AdditionalApproverDecisionHistoryRecord,
  AdditionalApproverHistoryResponse,
  ContractDetailResponse,
  DashboardContractsFilter,
  RepositorySortBy,
  RepositorySortDirection,
  RepositoryDateBasis,
  RepositoryDatePreset,
  RepositoryExportFormat,
  RepositoryExportColumn,
  RepositoryStatusFilter,
}
