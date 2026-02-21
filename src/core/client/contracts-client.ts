import { routeRegistry } from '@/core/config/route-registry'
import type { ApiResponse } from '@/core/http/response'

type ContractActionName =
  | 'hod.approve'
  | 'hod.reject'
  | 'hod.bypass'
  | 'legal.approve'
  | 'legal.reject'
  | 'legal.query'
  | 'legal.query.reroute'
  | 'approver.approve'

type ContractRecord = {
  id: string
  title: string
  contractTypeId?: string
  contractTypeName?: string
  status: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
  hodApprovedAt?: string | null
  departmentId?: string
  departmentName?: string
  departmentHodName?: string | null
  departmentHodEmail?: string | null
  signatoryName?: string
  signatoryDesignation?: string
  signatoryEmail?: string
  backgroundOfRequest?: string
  budgetApproved?: boolean
  requestCreatedAt?: string
  tatDeadlineAt?: string | null
  tatBreachedAt?: string | null
  agingBusinessDays?: number | null
  nearBreach?: boolean
  isTatBreached?: boolean
  fileName?: string
  fileSizeBytes?: number
  fileMimeType?: string
  createdAt: string
  updatedAt: string
}

type DashboardContractsFilter = 'ALL' | 'HOD_PENDING' | 'LEGAL_PENDING' | 'FINAL_APPROVED' | 'LEGAL_QUERY'

type RepositorySortBy = 'title' | 'created_at' | 'hod_approved_at' | 'status' | 'tat_deadline_at'
type RepositorySortDirection = 'asc' | 'desc'

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
  createdAt: string
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
  status: 'PENDING' | 'APPROVED'
  approvedAt: string | null
}

type ContractDetailResponse = {
  contract: ContractRecord
  availableActions: ContractAllowedAction[]
  additionalApprovers: ContractAdditionalApprover[]
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
  }): Promise<ApiResponse<DashboardContractsResponse>> {
    const query = new URLSearchParams()
    query.set('filter', params.filter)

    if (params.cursor) {
      query.set('cursor', params.cursor)
    }

    if (params.limit) {
      query.set('limit', String(params.limit))
    }

    const response = await fetch(`${routeRegistry.api.contracts.dashboard}?${query.toString()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<DashboardContractsResponse>(response)
  },

  async repositoryList(params?: {
    cursor?: string
    limit?: number
    search?: string
    status?: string
    sortBy?: RepositorySortBy
    sortDirection?: RepositorySortDirection
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

    if (params?.sortBy) {
      query.set('sortBy', params.sortBy)
    }

    if (params?.sortDirection) {
      query.set('sortDirection', params.sortDirection)
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

  async upload(params: {
    title: string
    contractTypeId: string
    signatoryName?: string
    signatoryDesignation?: string
    signatoryEmail?: string
    backgroundOfRequest?: string
    departmentId?: string
    budgetApproved?: boolean
    file: File
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
    formData.set('file', params.file)

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

  async action(contractId: string, payload: { action: ContractActionName; noteText?: string }) {
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

  async download(contractId: string): Promise<ApiResponse<{ signedUrl: string; fileName: string }>> {
    const response = await fetch(resolveContractPath(routeRegistry.api.contracts.download, contractId), {
      method: 'GET',
      credentials: 'include',
    })

    return parseApiResponse<{ signedUrl: string; fileName: string }>(response)
  },

  resolveProtectedContractPath,
}

export type {
  ContractRecord,
  DepartmentOption,
  ContractTypeOption,
  ContractTimelineEvent,
  ContractActionName,
  ContractAllowedAction,
  ContractAdditionalApprover,
  ContractDetailResponse,
  DashboardContractsFilter,
  RepositorySortBy,
  RepositorySortDirection,
}
