import { routeRegistry } from '@/core/config/route-registry'
import type { ApiResponse } from '@/core/http/response'

type ContractActionName =
  | 'hod.approve'
  | 'hod.bypass'
  | 'legal.approve'
  | 'legal.query'
  | 'legal.query.reroute'
  | 'approver.approve'

type ContractRecord = {
  id: string
  title: string
  status: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  createdAt: string
  updatedAt: string
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

export const contractsClient = {
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
    file: File
    idempotencyKey: string
  }): Promise<ApiResponse<{ contract: ContractRecord }>> {
    const formData = new FormData()
    formData.set('title', params.title)
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
}

export type {
  ContractRecord,
  ContractTimelineEvent,
  ContractActionName,
  ContractAllowedAction,
  ContractAdditionalApprover,
  ContractDetailResponse,
}
