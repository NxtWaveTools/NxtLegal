import type {
  ContractAccessRecord,
  ContractDocumentAccessRecord,
  ContractDocumentRecord,
  ContractRecord,
  CreateContractDocumentInput,
  CreateContractUploadInput,
  ReplacePrimaryContractDocumentInput,
} from '@/core/domain/contracts/types'

export interface ContractRepository {
  createWithAudit(input: CreateContractUploadInput): Promise<ContractRecord>
  setCounterpartyName(params: { tenantId: string; contractId: string; counterpartyName: string }): Promise<void>
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
  isUploaderInActorTeam(params: {
    tenantId: string
    actorEmployeeId: string
    uploaderEmployeeId: string
  }): Promise<boolean>
}
