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
  createdAt: string
  updatedAt: string
}

export type ContractDetail = ContractListItem & {
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
  }): Promise<{ items: ContractListItem[]; nextCursor?: string }>
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
