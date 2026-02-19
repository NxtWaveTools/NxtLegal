import type { ContractStatus } from '@/core/constants/contracts'

export type ContractRecord = {
  id: string
  tenantId: string
  title: string
  uploadedByEmployeeId: string
  uploadedByEmail: string
  currentAssigneeEmployeeId: string
  currentAssigneeEmail: string
  status: ContractStatus
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
  uploadedByEmployeeId: string
  uploadedByEmail: string
  uploadedByRole: string
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
  filePath: string
  fileName: string
}
