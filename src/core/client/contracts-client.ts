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
  uploadMode?: ContractUploadMode
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
  executedAt?: string | null
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
type DashboardContractsScope = 'default' | 'personal'

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
  | 'SIGNING'
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
  | 'effective_date'
  | 'termination_date'
  | 'notice_period'
  | 'auto_renewal'
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
    | 'signing'
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
    width?: number | null
    height?: number | null
    anchorString: string | null
    assignedSignerEmail: string
  }>
  status: 'PENDING' | 'SIGNED'
  signedAt: string | null
  zohoSignEnvelopeId: string
  zohoSignRecipientId: string
  createdAt: string
}

type FinalSigningArtifactType = 'signed_document' | 'completion_certificate'

type ContractSigningPreparationDraft = {
  contractId: string
  recipients: Array<{
    name: string
    email: string
    recipientType: 'INTERNAL' | 'EXTERNAL'
    routingOrder: number
    designation?: string
    counterpartyName?: string
    backgroundOfRequest?: string
    budgetApproved?: boolean
  }>
  fields: Array<{
    fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
    pageNumber: number | null
    xPosition: number | null
    yPosition: number | null
    width?: number | null
    height?: number | null
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

type DashboardCountsResponse = {
  counts: Partial<Record<DashboardContractsFilter, number>>
}

type RepositoryListResponse = ContractListResponse & {
  /** Present only when includeReport=true was requested. */
  report?: RepositoryReportResponse['report']
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

type CounterpartyOption = {
  name: string
  backgroundOfRequest?: string
  budgetApproved?: boolean
  signatories?: Array<{
    name: string
    designation: string
    email: string
  }>
}

type LegalTeamMemberOption = {
  id: string
  email: string
  fullName?: string | null
}

/** User-friendly message returned when `fetch()` itself throws (network down, DNS failure, CORS). */
const NETWORK_ERROR_MESSAGE = 'Network error. Please check your connection and try again.'

function networkErrorResponse<T>(): ApiResponse<T> {
  return {
    ok: false,
    error: {
      code: 'network_error',
      message: NETWORK_ERROR_MESSAGE,
    },
  }
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

/**
 * Wraps `fetch()` + `parseApiResponse()` in a single call that gracefully
 * catches network-level errors (e.g. `TypeError: Failed to fetch` when
 * offline) and returns a well-formed `ApiResponse<T>` instead of throwing.
 *
 * Every non-GET mutation method in `contractsClient` should use this instead
 * of bare `fetch()` to ensure the UI never sees a raw TypeError.
 */
async function safeFetch<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, init)
    return parseApiResponse<T>(response)
  } catch {
    return networkErrorResponse<T>()
  }
}

/**
 * Upload files via XMLHttpRequest with real-time byte progress tracking.
 *
 * `fetch()` cannot report upload progress because it does not expose
 * `xhr.upload.onprogress`.  This wrapper sends `FormData` through XHR and
 * returns a Promise that resolves to the same `ApiResponse<T>` shape the
 * rest of the client uses.
 *
 * @param url             Target endpoint
 * @param formData        The multipart payload to send
 * @param options.headers Optional headers (e.g. Idempotency-Key)
 * @param options.onProgress  Callback invoked with 0–100 as bytes are sent
 * @param options.signal      AbortSignal to cancel the upload mid-flight
 */
function xhrUpload<T>(
  url: string,
  formData: FormData,
  options?: {
    headers?: Record<string, string>
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  }
): Promise<ApiResponse<T>> {
  return new Promise<ApiResponse<T>>((resolve) => {
    const xhr = new XMLHttpRequest()

    // ── Progress tracking ──
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && options?.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100)
        options.onProgress(percent)
      }
    })

    // ── Completion ──
    xhr.addEventListener('load', () => {
      try {
        const parsed = JSON.parse(xhr.responseText) as ApiResponse<T>
        resolve(parsed)
      } catch {
        resolve({
          ok: false,
          error: { code: 'invalid_json_response', message: 'Unexpected response from server' },
        })
      }
    })

    // ── Network error ──
    xhr.addEventListener('error', () => {
      resolve(networkErrorResponse<T>())
    })

    // ── Abort ──
    xhr.addEventListener('abort', () => {
      resolve({
        ok: false,
        error: { code: 'upload_cancelled', message: 'Upload was cancelled.' },
      })
    })

    // ── Wire AbortSignal ──
    if (options?.signal) {
      if (options.signal.aborted) {
        resolve({
          ok: false,
          error: { code: 'upload_cancelled', message: 'Upload was cancelled.' },
        })
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.open('POST', url)
    xhr.withCredentials = true

    if (options?.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value)
      }
    }

    xhr.send(formData)
  })
}

/**
 * In-flight GET request deduplication map.
 *
 * Caches the *parsed JSON result* (not the raw Response) so that concurrent
 * callers — e.g. from React Strict Mode's intentional double-mount — all
 * receive the same deserialized object.  Storing the raw Response would cause
 * a "body already consumed" error because a Response body stream can only be
 * read once.  The entry is removed once the request settles so that a later,
 * independent call always gets a fresh response.
 */
const inflightGetCache = new Map<string, Promise<ApiResponse<unknown>>>()

function fetchGetJson<T>(url: string): Promise<ApiResponse<T>> {
  const cached = inflightGetCache.get(url)
  if (cached) return cached as Promise<ApiResponse<T>>

  const promise: Promise<ApiResponse<unknown>> = fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })
    .then((res) => res.json() as Promise<ApiResponse<unknown>>)
    .catch(() => networkErrorResponse<unknown>())
    .finally(() => {
      inflightGetCache.delete(url)
    })

  inflightGetCache.set(url, promise)
  return promise as Promise<ApiResponse<T>>
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
    return fetchGetJson<{ contractTypes: ContractTypeOption[] }>(routeRegistry.api.contracts.contractTypes)
  },

  async counterparties(): Promise<ApiResponse<{ counterparties: CounterpartyOption[] }>> {
    return fetchGetJson<{ counterparties: CounterpartyOption[] }>(routeRegistry.api.contracts.counterparties)
  },

  async departments(): Promise<ApiResponse<{ departments: DepartmentOption[] }>> {
    return fetchGetJson<{ departments: DepartmentOption[] }>(routeRegistry.api.contracts.departments)
  },

  async legalTeamMembers(): Promise<ApiResponse<{ members: LegalTeamMemberOption[] }>> {
    return fetchGetJson<{ members: LegalTeamMemberOption[] }>(routeRegistry.api.contracts.legalTeamMembers)
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
    return fetchGetJson<ContractListResponse>(url)
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

    return fetchGetJson<ContractListResponse>(url)
  },

  async dashboardContracts(params: {
    filter: DashboardContractsFilter
    scope?: DashboardContractsScope
    cursor?: string
    limit?: number
    includeExtras?: boolean
  }): Promise<ApiResponse<DashboardContractsResponse>> {
    const query = new URLSearchParams()
    query.set('filter', params.filter)

    if (params.scope) {
      query.set('scope', params.scope)
    }

    if (params.cursor) {
      query.set('cursor', params.cursor)
    }

    if (params.limit) {
      query.set('limit', String(params.limit))
    }

    if (typeof params.includeExtras === 'boolean') {
      query.set('includeExtras', String(params.includeExtras))
    }

    return fetchGetJson<DashboardContractsResponse>(`${routeRegistry.api.contracts.dashboard}?${query.toString()}`)
  },

  async dashboardCounts(params: {
    filters: DashboardContractsFilter[]
  }): Promise<ApiResponse<DashboardCountsResponse>> {
    const query = new URLSearchParams()
    query.set('filters', params.filters.join(','))

    return fetchGetJson<DashboardCountsResponse>(`${routeRegistry.api.contracts.dashboardCounts}?${query.toString()}`)
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

    return fetchGetJson<AdditionalApproverHistoryResponse>(url)
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
    /** When true, the response will include reporting aggregates; avoids a separate repositoryReport call. */
    includeReport?: boolean
  }): Promise<ApiResponse<RepositoryListResponse>> {
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

    if (params?.includeReport) {
      query.set('includeReport', 'true')
    }

    const url =
      query.size > 0
        ? `${routeRegistry.api.contracts.repository}?${query.toString()}`
        : routeRegistry.api.contracts.repository

    return fetchGetJson<RepositoryListResponse>(url)
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

    return fetchGetJson<RepositoryReportResponse>(url)
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
    return fetchGetJson<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.detail, contractId))
  },

  async timeline(contractId: string): Promise<ApiResponse<{ events: ContractTimelineEvent[] }>> {
    return fetchGetJson<{ events: ContractTimelineEvent[] }>(
      `${resolveContractPath(routeRegistry.api.contracts.timeline, contractId)}?limit=20`
    )
  },

  async addActivityMessage(contractId: string, payload: { messageText: string }) {
    return safeFetch<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.activity, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  },

  async markActivitySeen(contractId: string) {
    return safeFetch<ContractActivityReadState>(
      resolveContractPath(routeRegistry.api.contracts.activityReadState, contractId),
      {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markSeen: true }),
      }
    )
  },

  async upload(params: {
    title: string
    contractTypeId: string
    counterpartyName?: string
    counterparties?: Array<{
      counterpartyName: string
      supportingFiles: File[]
      backgroundOfRequest?: string
      budgetApproved?: boolean
      signatories?: Array<{
        name: string
        designation: string
        email: string
      }>
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
    /** Callback invoked with 0–100 as bytes are uploaded */
    onProgress?: (percent: number) => void
    /** AbortSignal to cancel the upload mid-flight */
    signal?: AbortSignal
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
          backgroundOfRequest: counterparty.backgroundOfRequest,
          budgetApproved: counterparty.budgetApproved,
          signatories: counterparty.signatories ?? [],
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

    return xhrUpload<{ contract: ContractRecord }>(routeRegistry.api.contracts.upload, formData, {
      headers: { 'Idempotency-Key': params.idempotencyKey },
      onProgress: params.onProgress,
      signal: params.signal,
    })
  },

  async replaceMainDocument(params: {
    contractId: string
    file: File
    idempotencyKey: string
  }): Promise<ApiResponse<{ document: ContractDocument }>> {
    const formData = new FormData()
    formData.set('file', params.file)

    return safeFetch<{ document: ContractDocument }>(
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
  },

  async action(
    contractId: string,
    payload:
      | { action: ContractActionName; noteText?: string }
      | { action: ContractBypassApprovalActionName; approverId: string; reason: string }
  ) {
    return safeFetch<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.action, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  },

  async addNote(contractId: string, payload: { noteText: string }) {
    return safeFetch<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.note, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  },

  async addApprover(contractId: string, payload: { approverEmail: string }) {
    return safeFetch<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.approvers, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  },

  async remindApprover(contractId: string, payload?: { approverEmail?: string }) {
    return safeFetch<ContractApproverReminderResponse>(
      resolveContractPath(routeRegistry.api.contracts.approverReminder, contractId),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approverEmail: payload?.approverEmail }),
      }
    )
  },

  async manageAssignment(contractId: string, payload: LegalAssignmentPayload) {
    return safeFetch<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.assignments, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  },

  async updateLegalMetadata(contractId: string, payload: LegalMetadataPayload) {
    return safeFetch<ContractDetailResponse>(
      resolveContractPath(routeRegistry.api.contracts.legalMetadata, contractId),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
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
              width?: number
              height?: number
              anchor_string?: string
              assigned_signer_email: string
            }>
          }>
        }
  ) {
    return safeFetch<ContractDetailResponse>(resolveContractPath(routeRegistry.api.contracts.signatories, contractId), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  },

  async saveSigningPreparationDraft(
    contractId: string,
    payload: {
      recipients: Array<{
        name: string
        email: string
        recipient_type: 'INTERNAL' | 'EXTERNAL'
        routing_order: number
        designation?: string
        counterparty_name?: string
        background_of_request?: string
        budget_approved?: boolean
      }>
      fields: Array<{
        field_type: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
        page_number?: number
        x_position?: number
        y_position?: number
        width?: number
        height?: number
        anchor_string?: string
        assigned_signer_email: string
      }>
    }
  ) {
    return safeFetch<ContractSigningPreparationDraft>(
      resolveContractPath(routeRegistry.api.contracts.signingPreparationDraft, contractId),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
  },

  async getSigningPreparationDraft(contractId: string) {
    return safeFetch<ContractSigningPreparationDraft | null>(
      resolveContractPath(routeRegistry.api.contracts.signingPreparationDraft, contractId),
      {
        method: 'GET',
        credentials: 'include',
      }
    )
  },

  async sendSigningPreparationDraft(contractId: string) {
    return safeFetch<{ envelopeId: string; contractView: ContractDetailResponse }>(
      resolveContractPath(routeRegistry.api.contracts.signingPreparationSend, contractId),
      {
        method: 'POST',
        credentials: 'include',
      }
    )
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

    return safeFetch<{ signedUrl: string; fileName: string }>(url, {
      method: 'GET',
      credentials: 'include',
    })
  },

  async downloadFinalSigningArtifact(
    contractId: string,
    artifact: FinalSigningArtifactType
  ): Promise<ApiResponse<{ blob?: Blob; signedUrl?: string; fileName: string; contentType: string }>> {
    try {
      const path = resolveContractPath(routeRegistry.api.contracts.finalSignedArtifactDownload, contractId)
      const query = new URLSearchParams({ artifact })
      const response = await fetch(`${path}?${query.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })

      if (!response.ok) {
        try {
          const parsedError = (await response.json()) as ApiResponse<unknown>
          return {
            ok: false,
            error: {
              code: parsedError.error?.code ?? 'download_failed',
              message: parsedError.error?.message ?? 'Failed to download final signing artifact',
            },
          }
        } catch {
          return {
            ok: false,
            error: {
              code: 'download_failed',
              message: 'Failed to download final signing artifact',
            },
          }
        }
      }

      const responseContentType = response.headers.get('content-type') ?? ''
      if (responseContentType.toLowerCase().includes('application/json')) {
        const parsed = (await response.json()) as ApiResponse<{
          signedUrl?: string
          fileName?: string
          contentType?: string
        }>

        if (!parsed.ok || !parsed.data?.signedUrl) {
          return {
            ok: false,
            error: {
              code: parsed.error?.code ?? 'download_failed',
              message: parsed.error?.message ?? 'Failed to download final signing artifact',
            },
          }
        }

        return {
          ok: true,
          data: {
            signedUrl: parsed.data.signedUrl,
            fileName:
              parsed.data.fileName ??
              (artifact === 'completion_certificate' ? 'completion-certificate.pdf' : 'signed-document.pdf'),
            contentType: parsed.data.contentType ?? 'application/pdf',
          },
        }
      }

      const blob = await response.blob()
      const contentType = responseContentType || 'application/pdf'
      const contentDisposition = response.headers.get('content-disposition') ?? ''
      const fileNameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i)
      const rawFileName = fileNameMatch?.[1]?.replace(/"/g, '')
      const resolvedFileName = rawFileName
        ? (() => {
            try {
              return decodeURIComponent(rawFileName)
            } catch {
              return rawFileName
            }
          })()
        : artifact === 'completion_certificate'
          ? 'completion-certificate.pdf'
          : 'signed-document.pdf'

      return {
        ok: true,
        data: {
          blob,
          fileName: resolvedFileName,
          contentType,
        },
      }
    } catch {
      return networkErrorResponse<{ blob: Blob; fileName: string; contentType: string }>()
    }
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
  FinalSigningArtifactType,
  ContractSigningPreparationDraft,
  AdditionalApproverDecisionHistoryRecord,
  AdditionalApproverHistoryResponse,
  ContractDetailResponse,
  DashboardContractsFilter,
  DashboardContractsScope,
  DashboardCountsResponse,
  RepositoryListResponse,
  RepositorySortBy,
  RepositorySortDirection,
  RepositoryDateBasis,
  RepositoryDatePreset,
  RepositoryExportFormat,
  RepositoryExportColumn,
  RepositoryStatusFilter,
}
