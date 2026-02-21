import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { contractStatuses, type ContractStatus } from '@/core/constants/contracts'
import { DatabaseError } from '@/core/http/errors'
import type { ContractRepository } from '@/core/domain/contracts/contract-repository'
import type { ContractAccessRecord, ContractRecord, CreateContractUploadInput } from '@/core/domain/contracts/types'

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
  file_path: string | null
  file_name: string | null
  file_size_bytes: number | null
  file_mime_type: string | null
  created_at: string
}

class SupabaseContractRepository implements ContractRepository {
  private readonly validStatuses = new Set<ContractStatus>(Object.values(contractStatuses))

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

    return this.loadCreatedContract(input.contractId, input.tenantId)
  }

  private async loadCreatedContract(contractId: string, tenantId: string): Promise<ContractRecord> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('contracts')
      .select(
        'id, tenant_id, title, contract_type_id, signatory_name, signatory_designation, signatory_email, background_of_request, department_id, budget_approved, request_created_at, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, status, file_path, file_name, file_size_bytes, file_mime_type, created_at'
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
      .select('id, tenant_id, uploaded_by_employee_id, current_assignee_employee_id, status, file_path, file_name')
      .eq('id', contractId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single<{
        id: string
        tenant_id: string
        uploaded_by_employee_id: string
        current_assignee_employee_id: string
        status: string
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
      filePath: data.file_path,
      fileName: data.file_name,
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
      filePath: row.file_path ?? '',
      fileName: row.file_name ?? '',
      fileSizeBytes: row.file_size_bytes ?? 0,
      fileMimeType: row.file_mime_type ?? '',
      createdAt: row.created_at,
    }
  }
}

export const supabaseContractRepository = new SupabaseContractRepository()
