import type { ContractStatus } from '@/core/constants/contracts'
import type { ContractActionName } from '@/core/domain/contracts/schemas'

export type ContractListItem = {
  id: string
  title: string
  status: ContractStatus
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
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
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  filePath: string
  rowVersion: number
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
  status: 'PENDING' | 'APPROVED'
  approvedAt: string | null
}

export type ContractDetailView = {
  contract: ContractDetail
  availableActions: ContractAllowedAction[]
  additionalApprovers: ContractAdditionalApprover[]
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
  getTimeline(tenantId: string, contractId: string, limit: number): Promise<ContractTimelineEvent[]>
  getAdditionalApprovers(tenantId: string, contractId: string): Promise<ContractAdditionalApprover[]>
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
  addContractNote(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    noteText: string
  }): Promise<void>
}
