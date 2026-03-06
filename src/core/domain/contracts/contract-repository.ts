import type {
  ContractAccessRecord,
  ContractCounterpartyRecord,
  ContractDocumentAccessRecord,
  ContractDocumentRecord,
  ContractRecord,
  CreateContractCounterpartyInput,
  CreateContractDocumentInput,
  CreateContractUploadInput,
  ReplacePrimaryContractDocumentInput,
  UpdateContractStatusInput,
} from '@/core/domain/contracts/types'

export interface ContractRepository {
  createWithAudit(input: CreateContractUploadInput): Promise<ContractRecord>
  createCounterparties(input: CreateContractCounterpartyInput[]): Promise<ContractCounterpartyRecord[]>
  listCounterparties(params: { tenantId: string; contractId: string }): Promise<ContractCounterpartyRecord[]>
  listMasterCounterpartyNames(tenantId: string): Promise<string[]>
  upsertMasterCounterpartyNames(params: { tenantId: string; names: string[] }): Promise<void>
  setCounterpartyName(params: { tenantId: string; contractId: string; counterpartyName: string }): Promise<void>
  seedSigningPreparationDraft(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
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
  }): Promise<void>
  createDocument(input: CreateContractDocumentInput): Promise<void>
  getForAccess(contractId: string, tenantId: string): Promise<ContractAccessRecord | null>
  getDocumentForAccess(params: {
    tenantId: string
    contractId: string
    documentId: string
  }): Promise<ContractDocumentAccessRecord | null>
  getCurrentPrimaryDocumentForAccess(params: {
    tenantId: string
    contractId: string
  }): Promise<ContractDocumentAccessRecord | null>
  replacePrimaryDocument(input: ReplacePrimaryContractDocumentInput): Promise<ContractDocumentRecord>
  updateContractStatus(input: UpdateContractStatusInput): Promise<void>
  isPocAssignedToDepartment(params: { tenantId: string; pocEmail: string; departmentId: string }): Promise<boolean>
  isHodAssignedToDepartment(params: { tenantId: string; hodEmail: string; departmentId: string }): Promise<boolean>
  isUploaderInActorTeam(params: {
    tenantId: string
    actorEmployeeId: string
    uploaderEmployeeId: string
  }): Promise<boolean>
}
