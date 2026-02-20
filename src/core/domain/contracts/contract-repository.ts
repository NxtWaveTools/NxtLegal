import type { ContractAccessRecord, ContractRecord, CreateContractUploadInput } from '@/core/domain/contracts/types'

export interface ContractRepository {
  createWithAudit(input: CreateContractUploadInput): Promise<ContractRecord>
  getForAccess(contractId: string, tenantId: string): Promise<ContractAccessRecord | null>
  isUploaderInActorTeam(params: {
    tenantId: string
    actorEmployeeId: string
    uploaderEmployeeId: string
  }): Promise<boolean>
}
