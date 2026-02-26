import type { ContractStatus } from '@/core/constants/contracts'
import type { ContractUploadMode } from '@/core/constants/contracts'

export type ContractRecord = {
  id: string
  tenantId: string
  title: string
  contractTypeId: string
  contractTypeName?: string
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  departmentId: string
  budgetApproved: boolean
  requestCreatedAt: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
  status: ContractStatus
  currentDocumentId?: string | null
  filePath: string
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
  createdAt?: string
}

export type CreateContractUploadInput = {
  contractId: string
  tenantId: string
  title: string
  contractTypeId: string
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  departmentId: string
  budgetApproved: boolean
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole: string
  uploadMode: ContractUploadMode
  bypassHodApproval: boolean
  bypassReason?: string
  filePath: string
  fileName: string
  fileSizeBytes: number
  fileMimeType: string
}

export type ContractAccessRecord = {
  id: string
  tenantId: string
  uploadedByEmployeeId: string
  currentAssigneeEmployeeId: string
  status: ContractStatus
  currentDocumentId?: string | null
  filePath: string
  fileName: string
}

export type ContractDocumentKind = 'PRIMARY' | 'COUNTERPARTY_SUPPORTING' | 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'

export type ContractDocumentRecord = {
  id: string
  tenantId: string
  contractId: string
  documentKind: ContractDocumentKind
  versionNumber: number
  displayName: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  fileMimeType: string
  uploadedRole?: string
  replacedDocumentId?: string | null
  createdAt: string
}

export type ContractCounterpartyRecord = {
  id: string
  tenantId: string
  contractId: string
  counterpartyName: string
  sequenceOrder: number
}

export type ContractDocumentAccessRecord = {
  id: string
  tenantId: string
  contractId: string
  versionNumber?: number
  filePath: string
  fileName: string
}

export type CreateContractDocumentInput = {
  tenantId: string
  contractId: string
  documentKind: ContractDocumentKind
  counterpartyId?: string
  versionNumber?: number
  displayName: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  fileMimeType: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole?: string
  replacedDocumentId?: string | null
}

export type ReplacePrimaryContractDocumentInput = {
  tenantId: string
  contractId: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  fileMimeType: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole: string
}

export type CreateContractCounterpartyInput = {
  tenantId: string
  contractId: string
  counterpartyName: string
  sequenceOrder: number
}
