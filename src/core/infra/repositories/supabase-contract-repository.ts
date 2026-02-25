import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { contractStatuses, type ContractStatus } from '@/core/constants/contracts'
import { DatabaseError } from '@/core/http/errors'
import type { ContractRepository } from '@/core/domain/contracts/contract-repository'
import type {
  ContractAccessRecord,
  ContractDocumentAccessRecord,
  ContractDocumentRecord,
  ContractRecord,
  CreateContractDocumentInput,
  CreateContractUploadInput,
  ReplacePrimaryContractDocumentInput,
} from '@/core/domain/contracts/types'

type ContractRow = {
  id: string
  tenant_id: string
  title: string
  contract_type_id: string
  signatory_name: string
  signatory_designation: string
  signatory_email: string
  background_of_request: string
  department_id: string
  budget_approved: boolean
  request_created_at: string
  uploaded_by_employee_id: string
  uploaded_by_email: string
  current_assignee_employee_id: string
  current_assignee_email: string
  status: string
  current_document_id: string | null
  file_path: string | null
  file_name: string | null
  file_size_bytes: number | null
  file_mime_type: string | null
  counterparty_name: string | null
  created_at: string
}

class SupabaseContractRepository implements ContractRepository {
  private readonly validStatuses = new Set<ContractStatus>(Object.values(contractStatuses))

  private async ensureCurrentHodAssignee(contract: ContractRecord): Promise<ContractRecord> {
    if (contract.status !== contractStatuses.hodPending) {
      return contract
    }

    const supabase = createServiceSupabase()
    const { data: activeHodMapping, error: activeHodMappingError } = await supabase
      .from('team_role_mappings')
      .select('email')
      .eq('tenant_id', contract.tenantId)
      .eq('team_id', contract.departmentId)
      .eq('role_type', 'HOD')
      .eq('active_flag', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle<{ email: string }>()

    if (activeHodMappingError) {
      throw new DatabaseError(
        'Failed to resolve active HOD mapping after contract initialization',
        new Error(activeHodMappingError.message),
        {
          code: activeHodMappingError.code,
        }
      )
    }

    const activeHodEmail = activeHodMapping?.email?.trim().toLowerCase()
    if (!activeHodEmail || activeHodEmail === contract.currentAssigneeEmail.trim().toLowerCase()) {
      return contract
    }

    const { data: activeHodUser, error: activeHodUserError } = await supabase
      .from('users')
      .select('id, email')
      .eq('tenant_id', contract.tenantId)
      .eq('email', activeHodEmail)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; email: string }>()

    if (activeHodUserError) {
      throw new DatabaseError(
        'Failed to resolve active HOD user after contract initialization',
        new Error(activeHodUserError.message),
        {
          code: activeHodUserError.code,
        }
      )
    }

    if (!activeHodUser) {
      return contract
    }

    const { error: assigneeUpdateError } = await supabase
      .from('contracts')
      .update({
        current_assignee_employee_id: activeHodUser.id,
        current_assignee_email: activeHodUser.email,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', contract.tenantId)
      .eq('id', contract.id)
      .is('deleted_at', null)

    if (assigneeUpdateError) {
      throw new DatabaseError(
        'Failed to correct contract assignee after initialization',
        new Error(assigneeUpdateError.message),
        {
          code: assigneeUpdateError.code,
        }
      )
    }

    return {
      ...contract,
      currentAssigneeEmployeeId: activeHodUser.id,
      currentAssigneeEmail: activeHodUser.email,
    }
  }

  async createWithAudit(input: CreateContractUploadInput): Promise<ContractRecord> {
    const supabase = createServiceSupabase()

    const { error: rpcError } = await supabase.rpc('create_contract_with_audit', {
      p_contract_id: input.contractId,
      p_tenant_id: input.tenantId,
      p_title: input.title,
      p_contract_type_id: input.contractTypeId,
      p_signatory_name: input.signatoryName,
      p_signatory_designation: input.signatoryDesignation,
      p_signatory_email: input.signatoryEmail,
      p_background_of_request: input.backgroundOfRequest,
      p_department_id: input.departmentId,
      p_budget_approved: input.budgetApproved,
      p_uploaded_by_employee_id: input.uploadedByEmployeeId,
      p_uploaded_by_email: input.uploadedByEmail,
      p_uploaded_by_role: input.uploadedByRole,
      p_file_path: input.filePath,
      p_file_name: input.fileName,
      p_file_size_bytes: input.fileSizeBytes,
      p_file_mime_type: input.fileMimeType,
    })

    if (rpcError) {
      throw new DatabaseError('Contract initialization RPC failed', new Error(rpcError.message), {
        code: rpcError.code,
        details: rpcError.details,
      })
    }

    const createdContract = await this.loadCreatedContract(input.contractId, input.tenantId)
    return this.ensureCurrentHodAssignee(createdContract)
  }

  private async loadCreatedContract(contractId: string, tenantId: string): Promise<ContractRecord> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('contracts')
      .select(
        'id, tenant_id, title, contract_type_id, signatory_name, signatory_designation, signatory_email, background_of_request, department_id, budget_approved, request_created_at, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, status, current_document_id, file_path, file_name, file_size_bytes, file_mime_type, counterparty_name, created_at'
      )
      .eq('id', contractId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single<ContractRow>()

    if (error || !data) {
      throw new DatabaseError(
        'Failed to load contract after initialization',
        error ? new Error(error.message) : undefined
      )
    }

    if (!data.file_path || !data.file_name || !data.file_size_bytes || !data.file_mime_type) {
      throw new DatabaseError('Contract file metadata is incomplete after initialization')
    }

    return this.mapContract(data)
  }

  async getForAccess(contractId: string, tenantId: string): Promise<ContractAccessRecord | null> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('contracts')
      .select(
        'id, tenant_id, uploaded_by_employee_id, current_assignee_employee_id, status, current_document_id, file_path, file_name'
      )
      .eq('id', contractId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single<{
        id: string
        tenant_id: string
        uploaded_by_employee_id: string
        current_assignee_employee_id: string
        status: string
        current_document_id: string | null
        file_path: string | null
        file_name: string | null
      }>()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }

      throw new DatabaseError('Failed to fetch contract access record', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data.file_path || !data.file_name) {
      throw new DatabaseError('Contract file metadata missing for download access')
    }

    if (!this.validStatuses.has(data.status as ContractStatus)) {
      throw new DatabaseError('Contract status is invalid in persistence layer', undefined, {
        status: data.status,
      })
    }

    return {
      id: data.id,
      tenantId: data.tenant_id,
      uploadedByEmployeeId: data.uploaded_by_employee_id,
      currentAssigneeEmployeeId: data.current_assignee_employee_id,
      status: data.status as ContractStatus,
      currentDocumentId: data.current_document_id,
      filePath: data.file_path,
      fileName: data.file_name,
    }
  }

  async setCounterpartyName(params: { tenantId: string; contractId: string; counterpartyName: string }): Promise<void> {
    const supabase = createServiceSupabase()

    const { error } = await supabase
      .from('contracts')
      .update({ counterparty_name: params.counterpartyName.trim() })
      .eq('tenant_id', params.tenantId)
      .eq('id', params.contractId)
      .is('deleted_at', null)

    if (error) {
      throw new DatabaseError('Failed to persist counterparty name for contract', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async createDocument(input: CreateContractDocumentInput): Promise<void> {
    const supabase = createServiceSupabase()

    const { error } = await supabase.from('contract_documents').insert({
      tenant_id: input.tenantId,
      contract_id: input.contractId,
      document_kind: input.documentKind,
      version_number: input.versionNumber,
      display_name: input.displayName,
      file_name: input.fileName,
      file_path: input.filePath,
      file_size_bytes: input.fileSizeBytes,
      file_mime_type: input.fileMimeType,
      uploaded_by_employee_id: input.uploadedByEmployeeId,
      uploaded_by_email: input.uploadedByEmail,
      uploaded_role: input.uploadedByRole,
      replaced_document_id: input.replacedDocumentId,
    })

    if (error) {
      throw new DatabaseError('Failed to persist contract document metadata', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async getDocumentForAccess(params: {
    tenantId: string
    contractId: string
    documentId: string
  }): Promise<ContractDocumentAccessRecord | null> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('contract_documents')
      .select('id, tenant_id, contract_id, file_path, file_name, version_number')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('id', params.documentId)
      .is('deleted_at', null)
      .maybeSingle<{
        id: string
        tenant_id: string
        contract_id: string
        file_path: string
        file_name: string
        version_number: number | null
      }>()

    if (error) {
      throw new DatabaseError('Failed to fetch contract document access record', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data) {
      return null
    }

    return {
      id: data.id,
      tenantId: data.tenant_id,
      contractId: data.contract_id,
      versionNumber: data.version_number ?? undefined,
      filePath: data.file_path,
      fileName: data.file_name,
    }
  }

  async getCurrentPrimaryDocumentForAccess(params: {
    tenantId: string
    contractId: string
  }): Promise<ContractDocumentAccessRecord | null> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('contract_documents')
      .select('id, tenant_id, contract_id, file_path, file_name, version_number')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('document_kind', 'PRIMARY')
      .is('deleted_at', null)
      .order('version_number', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string
        tenant_id: string
        contract_id: string
        file_path: string
        file_name: string
        version_number: number | null
      }>()

    if (error) {
      throw new DatabaseError('Failed to fetch current primary contract document', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data) {
      return null
    }

    return {
      id: data.id,
      tenantId: data.tenant_id,
      contractId: data.contract_id,
      versionNumber: data.version_number ?? undefined,
      filePath: data.file_path,
      fileName: data.file_name,
    }
  }

  async replacePrimaryDocument(input: ReplacePrimaryContractDocumentInput): Promise<ContractDocumentRecord> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase.rpc('create_contract_primary_document_version', {
      p_tenant_id: input.tenantId,
      p_contract_id: input.contractId,
      p_display_name: 'Primary Contract',
      p_file_name: input.fileName,
      p_file_path: input.filePath,
      p_file_size_bytes: input.fileSizeBytes,
      p_file_mime_type: input.fileMimeType,
      p_uploaded_by_employee_id: input.uploadedByEmployeeId,
      p_uploaded_by_email: input.uploadedByEmail,
      p_uploaded_by_role: input.uploadedByRole,
    })

    if (error) {
      throw new DatabaseError('Failed to replace primary contract document', new Error(error.message), {
        code: error.code,
        details: error.details,
      })
    }

    const payload = (Array.isArray(data) ? data[0] : data) as
      | { document_id: string; version_number: number; replaced_document_id: string | null }
      | undefined

    if (!payload?.document_id) {
      throw new DatabaseError('Primary document replacement did not return a document id')
    }

    return {
      id: payload.document_id,
      tenantId: input.tenantId,
      contractId: input.contractId,
      documentKind: 'PRIMARY',
      versionNumber: Number(payload.version_number),
      displayName: 'Primary Contract',
      fileName: input.fileName,
      filePath: input.filePath,
      fileSizeBytes: input.fileSizeBytes,
      fileMimeType: input.fileMimeType,
      uploadedRole: input.uploadedByRole,
      replacedDocumentId: payload.replaced_document_id,
      createdAt: new Date().toISOString(),
    }
  }

  async isUploaderInActorTeam(params: {
    tenantId: string
    actorEmployeeId: string
    uploaderEmployeeId: string
  }): Promise<boolean> {
    const supabase = createServiceSupabase()

    const { data: actor, error: actorError } = await supabase
      .from('users')
      .select('team_id')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.actorEmployeeId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle<{ team_id: string | null }>()

    if (actorError) {
      throw new DatabaseError('Failed to resolve actor team for contract access', new Error(actorError.message), {
        code: actorError.code,
      })
    }

    if (!actor?.team_id) {
      return false
    }

    const { data: uploader, error: uploaderError } = await supabase
      .from('users')
      .select('team_id')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.uploaderEmployeeId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle<{ team_id: string | null }>()

    if (uploaderError) {
      throw new DatabaseError('Failed to resolve uploader team for contract access', new Error(uploaderError.message), {
        code: uploaderError.code,
      })
    }

    return Boolean(uploader?.team_id) && uploader?.team_id === actor.team_id
  }

  private mapContract(row: ContractRow): ContractRecord {
    if (!this.validStatuses.has(row.status as ContractStatus)) {
      throw new DatabaseError('Contract status is invalid in persistence layer', undefined, {
        status: row.status,
      })
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      contractTypeId: row.contract_type_id,
      signatoryName: row.signatory_name,
      signatoryDesignation: row.signatory_designation,
      signatoryEmail: row.signatory_email,
      backgroundOfRequest: row.background_of_request,
      departmentId: row.department_id,
      budgetApproved: row.budget_approved,
      requestCreatedAt: row.request_created_at,
      uploadedByEmployeeId: row.uploaded_by_employee_id,
      uploadedByEmail: row.uploaded_by_email,
      currentAssigneeEmployeeId: row.current_assignee_employee_id,
      currentAssigneeEmail: row.current_assignee_email,
      status: row.status as ContractStatus,
      currentDocumentId: row.current_document_id,
      filePath: row.file_path ?? '',
      fileName: row.file_name ?? '',
      fileSizeBytes: row.file_size_bytes ?? 0,
      fileMimeType: row.file_mime_type ?? '',
      createdAt: row.created_at,
    }
  }
}

export const supabaseContractRepository = new SupabaseContractRepository()
