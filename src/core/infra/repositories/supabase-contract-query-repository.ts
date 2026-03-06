import 'server-only'

import {
  contractUploadModes,
  contractRepositoryStatusLabels,
  contractRepositoryExportColumnLabels,
  contractRepositoryStatusMetricKeys,
  contractRepositoryStatusMetricLabels,
  contractRepositoryTatPolicy,
  contractNotificationChannels,
  contractNotificationStatuses,
  contractNotificationTypes,
  contractAuditActions,
  contractAuditEvents,
  contractLegalAssignmentAllowedRoles,
  contractLegalAssignmentEditableStatuses,
  contractSignatoryStatuses,
  contractStatuses,
  contractWorkflowRoles,
  repositoryStatusToWorkflowStatuses,
  resolveRepositoryStatus,
  resolveContractStatusDisplayLabel,
  type ContractRepositoryStatus,
  type ContractStatus,
} from '@/core/constants/contracts'
import { AuthorizationError, BusinessRuleError, ConflictError, DatabaseError } from '@/core/http/errors'
import { logger } from '@/core/infra/logging/logger'
import { createServiceSupabase } from '@/lib/supabase/service'
import type {
  AdditionalApproverDecisionHistoryItem,
  ContractActivityReadState,
  ContractCounterparty,
  ContractDocument,
  ContractNotificationDeliverySummary,
  ContractNotificationFailure,
  DashboardContractFilter,
  DashboardContractScope,
  ContractAdditionalApprover,
  ContractSignatory,
  ContractAllowedAction,
  ContractDetail,
  ContractLegalMetadata,
  ContractLegalCollaborator,
  ContractListItem,
  ContractQueryRepository,
  RepositoryDateBasis,
  RepositoryDatePreset,
  RepositoryExportColumn,
  RepositoryExportRow,
  RepositoryExportRowsChunk,
  RepositoryReport,
  RepositoryStatusMetric,
  RepositorySortBy,
  RepositorySortDirection,
  ContractTimelineEvent,
} from '@/core/domain/contracts/contract-query-repository'
import type { ContractActionName } from '@/core/domain/contracts/schemas'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000'

const actionLabelMap: Record<ContractActionName, string> = {
  'hod.approve': 'Approve (HOD)',
  'hod.reject': 'Reject (HOD)',
  'hod.bypass': 'Bypass to Legal',
  'legal.set.under_review': 'Set Under Review',
  'legal.set.pending_internal': 'Set Pending Internal',
  'legal.set.pending_external': 'Set Pending External',
  'legal.set.offline_execution': 'Set Offline Execution',
  'legal.set.on_hold': 'Set On Hold',
  'legal.set.completed': 'Set Completed',
  'legal.void': 'Void Documents',
  'legal.approve': 'Final Approve',
  'legal.reject': 'Reject (Legal)',
  'legal.query': 'Mark Query',
  'legal.query.reroute': 'Reroute to HOD',
  'approver.approve': 'Approve as Additional Approver',
  'approver.reject': 'Reject as Additional Approver',
}

const remarkRequiredActions = new Set<ContractActionName>([
  'legal.query.reroute',
  'hod.bypass',
  'hod.reject',
  'legal.void',
  'legal.reject',
  'approver.reject',
])
const bypassAllowedRoles = new Set(['LEGAL_TEAM', 'ADMIN'])
const activityMessageAllowedRoles = new Set(['LEGAL_TEAM', 'ADMIN', 'HOD'])

const contractsListSelectWithSlaMetrics =
  'id, tenant_id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, request_created_at, department_id, legal_effective_date, legal_termination_date, legal_notice_period, legal_auto_renewal, aging_business_days, near_breach, is_tat_breached, void_reason, created_at, updated_at'

const contractsListSelectLegacy =
  'id, tenant_id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, request_created_at, department_id, void_reason, created_at, updated_at'

const contractsListSelectFromContractsTable =
  'id, tenant_id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, request_created_at, department_id, legal_effective_date, legal_termination_date, legal_notice_period, legal_auto_renewal, void_reason, created_at, updated_at'

type ContractEntity = {
  id: string
  tenant_id: string
  title: string
  contract_type_id: string
  counterparty_name: string | null
  status: string
  uploaded_by_employee_id: string
  uploaded_by_email: string
  current_assignee_employee_id: string
  current_assignee_email: string
  signatory_name: string
  signatory_designation: string
  signatory_email: string
  background_of_request: string
  department_id: string
  budget_approved: boolean
  legal_effective_date?: string | null
  legal_termination_date?: string | null
  legal_notice_period?: string | null
  legal_auto_renewal?: boolean | null
  request_created_at: string
  current_document_id: string | null
  void_reason: string | null
  hod_approved_at: string | null
  tat_deadline_at: string | null
  tat_breached_at: string | null
  file_name: string | null
  file_size_bytes: number | null
  file_mime_type: string | null
  file_path: string | null
  created_at: string
  updated_at: string
  row_version: number
  upload_mode?: string | null
}

type ContractDocumentEntity = {
  id: string
  document_kind: 'PRIMARY' | 'COUNTERPARTY_SUPPORTING' | 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
  counterparty_id: string | null
  version_number: number | null
  display_name: string
  file_name: string
  file_size_bytes: number
  file_mime_type: string
  created_at: string
}

type ContractCounterpartyEntity = {
  id: string
  counterparty_name: string
  sequence_order: number
}

type TransitionGraphEntity = {
  trigger_action: string
  to_status: string
  allowed_roles: string[]
}

type AdditionalApproverEntity = {
  id: string
  approver_employee_id: string
  approver_email: string
  sequence_order: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED'
  approved_at: string | null
}

type LegalCollaboratorEntity = {
  id: string
  collaborator_employee_id: string
  collaborator_email: string
  created_at: string
}

type SignatoryEntity = {
  id: string
  contract_id?: string
  tenant_id?: string
  signatory_email: string
  recipient_type: 'INTERNAL' | 'EXTERNAL'
  routing_order: number
  field_config: Array<{
    fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
    pageNumber: number | null
    xPosition: number | null
    yPosition: number | null
    width?: number | null
    height?: number | null
    anchorString: string | null
    assignedSignerEmail: string
  }> | null
  status: 'PENDING' | 'SIGNED'
  signed_at: string | null
  zoho_sign_envelope_id: string
  zoho_sign_recipient_id: string
  created_at: string
}

type SigningPreparationDraftEntity = {
  contract_id: string
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
  fields: Array<{
    fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
    pageNumber: number | null
    xPosition: number | null
    yPosition: number | null
    width?: number | null
    height?: number | null
    anchorString: string | null
    assignedSignerEmail: string
  }>
  created_by_employee_id: string
  updated_by_employee_id: string
  created_at: string
  updated_at: string
}

type AdditionalApproverContractContext = {
  hasPendingAdditionalApprovers: boolean
  latestAdditionalApproverRejectionReason: string | null
  latestAdditionalApproverRejectionAt: string | null
  isAdditionalApproverActionable: boolean
}

type RepositoryJoinedContractRow = {
  id: string
  tenant_id: string
  title: string
  status: string
  uploaded_by_employee_id: string
  uploaded_by_email: string
  current_assignee_employee_id: string
  current_assignee_email: string
  hod_approved_at: string | null
  tat_deadline_at: string | null
  tat_breached_at: string | null
  request_created_at: string | null
  department_id: string | null
  legal_effective_date: string | null
  legal_termination_date: string | null
  legal_notice_period: string | null
  legal_auto_renewal: boolean | null
  void_reason: string | null
  created_at: string
  updated_at: string
  department?: { name: string | null } | Array<{ name: string | null }> | null
  assignments?: Array<{
    user_email: string
    assignment_role: 'OWNER' | 'COLLABORATOR' | 'APPROVER'
    deleted_at: string | null
  }>
  legal_collaborators?: Array<{ collaborator_email: string; deleted_at: string | null }>
  additional_approvers?: Array<{
    approver_employee_id: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED'
    sequence_order: number
    approved_at: string | null
    deleted_at: string | null
  }>
}

type VisibilityFilterContext = {
  filter: string | null
  actionableContractIds: string[]
}

class SupabaseContractQueryRepository implements ContractQueryRepository {
  private readonly validStatuses = new Set<ContractStatus>(Object.values(contractStatuses))

  private assertActorMetadata(params: { actorEmployeeId: string; actorEmail: string; actorRole: string }): void {
    if (!params.actorEmployeeId.trim()) {
      throw new BusinessRuleError('ACTOR_ID_REQUIRED', 'Actor employee ID is required')
    }

    if (!params.actorEmail.trim()) {
      throw new BusinessRuleError('ACTOR_EMAIL_REQUIRED', 'Actor email is required')
    }

    if (!params.actorRole.trim()) {
      throw new BusinessRuleError('ACTOR_ROLE_REQUIRED', 'Actor role is required')
    }
  }

  async listByTenant(params: {
    tenantId: string
    cursor?: string
    limit: number
    role?: string
    employeeId: string
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }> {
    const supabase = createServiceSupabase()
    const decodedCursor = this.decodeTimestampIdCursor(params.cursor)

    const visibilityFilter = await this.getVisibilityFilter(params.tenantId, params.role, params.employeeId)
    const buildListQuery = (source: 'contracts_repository_view' | 'contracts', selectColumns: string) => {
      let query = supabase
        .from(source)
        .select(selectColumns)
        .eq('tenant_id', params.tenantId)
        .order('created_at', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(params.limit + 1)

      if (decodedCursor) {
        query = query.lt('created_at', decodedCursor.createdAt)
      }

      if (visibilityFilter.filter) {
        query = query.or(visibilityFilter.filter)
      }

      return query
    }

    const buildTotalQuery = (source: 'contracts_repository_view' | 'contracts') => {
      let totalQuery = supabase
        .from(source)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', params.tenantId)

      if (visibilityFilter.filter) {
        totalQuery = totalQuery.or(visibilityFilter.filter)
      }

      return totalQuery
    }

    let totalCount = 0

    // On the first page (no cursor) kick off the count and the list query in
    // parallel so both run in a single round-trip instead of two sequential ones.
    // Paginated pages (cursor present) skip the count entirely.
    const listQueryPromise = buildListQuery('contracts_repository_view', contractsListSelectWithSlaMetrics)
    const totalQueryPromise = params.cursor ? null : buildTotalQuery('contracts_repository_view')

    const [initialListResult, initialTotalResult] = await Promise.all([listQueryPromise, totalQueryPromise])

    let { data, error } = initialListResult

    if (!params.cursor && initialTotalResult !== null) {
      let resolvedTotal = initialTotalResult

      if (resolvedTotal.error && this.isViewQueryCompatibilityError(resolvedTotal.error, 'contracts_repository_view')) {
        resolvedTotal = await buildTotalQuery('contracts')
      }

      if (resolvedTotal.error) {
        throw new DatabaseError('Failed to count contracts', new Error(resolvedTotal.error.message), {
          code: resolvedTotal.error.code,
        })
      }

      totalCount = resolvedTotal.count ?? 0
    }

    if (error && this.isMissingColumnError(error, 'contracts_repository_view')) {
      const fallbackResult = await buildListQuery('contracts_repository_view', contractsListSelectLegacy)
      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error && this.isViewQueryCompatibilityError(error, 'contracts_repository_view')) {
      const contractsTableResult = await buildListQuery('contracts', contractsListSelectFromContractsTable)
      data = contractsTableResult.data
      error = contractsTableResult.error
    }

    if (error) {
      throw new DatabaseError('Failed to list contracts', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string
      tenant_id: string
      title: string
      status: string
      uploaded_by_employee_id: string
      uploaded_by_email: string
      current_assignee_employee_id: string
      current_assignee_email: string
      hod_approved_at: string | null
      tat_deadline_at: string | null
      tat_breached_at: string | null
      aging_business_days?: number | null
      near_breach?: boolean
      is_tat_breached?: boolean
      created_at: string
      updated_at: string
    }>

    const validRows = rows.filter((row) => this.validStatuses.has(row.status as ContractStatus))

    const additionalApproverContext = await this.getAdditionalApproverContractContextMap(
      params.tenantId,
      validRows.map((row) => row.id),
      params.employeeId
    )

    const hasNext = validRows.length > params.limit
    const rowsForPage = validRows.slice(0, params.limit)
    const dashboardEnrichment = await this.resolveListContractEnrichment(params.tenantId, rowsForPage)
    const mappedItems = rowsForPage.map((row) =>
      this.mapListItem(row, additionalApproverContext.get(row.id), {
        creatorName: dashboardEnrichment.creatorNameByContractId.get(row.id) ?? null,
        executedAt: dashboardEnrichment.executedAtByContractId.get(row.id) ?? null,
      })
    )
    const items = await this.attachActorContractSignals(params.tenantId, params.employeeId, mappedItems, params.role)

    const nextCursor = hasNext ? this.encodeCursor(items[items.length - 1]?.createdAt ?? '') : undefined

    return { items, nextCursor, total: totalCount }
  }

  async getPendingApprovalsForRole(params: {
    tenantId: string
    employeeId: string
    role?: string
    limit: number
  }): Promise<ContractListItem[]> {
    const statuses = this.getPendingApprovalStatuses(params.role)

    if (statuses.length === 0) {
      return []
    }

    const supabase = createServiceSupabase()
    let query = supabase
      .from('contracts_repository_view')
      .select(
        'id, tenant_id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, aging_business_days, near_breach, is_tat_breached, created_at, updated_at'
      )
      .eq('tenant_id', params.tenantId)
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit)

    if (params.role === 'LEGAL_TEAM') {
      query = query.eq('current_assignee_employee_id', params.employeeId)
    }

    if (params.role === 'HOD') {
      query = query.eq('current_assignee_employee_id', params.employeeId)
    }

    const { data, error } = await query

    if (error) {
      throw new DatabaseError('Failed to fetch pending approvals for actor role', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string
      title: string
      status: string
      void_reason: string | null
      uploaded_by_employee_id: string
      uploaded_by_email: string
      current_assignee_employee_id: string
      current_assignee_email: string
      hod_approved_at: string | null
      tat_deadline_at: string | null
      tat_breached_at: string | null
      aging_business_days: number | null
      near_breach: boolean
      is_tat_breached: boolean
      legal_effective_date?: string | null
      legal_termination_date?: string | null
      legal_notice_period?: string | null
      legal_auto_renewal?: boolean | null
      created_at: string
      updated_at: string
    }>

    if (rows.length > 0) {
      const legalMetadataByContractId = await this.getContractLegalMetadataMap(
        params.tenantId,
        rows.map((row) => row.id)
      )

      for (const row of rows) {
        const legalMetadata = legalMetadataByContractId.get(row.id)
        if (!legalMetadata) {
          continue
        }

        row.legal_effective_date = legalMetadata.legalEffectiveDate
        row.legal_termination_date = legalMetadata.legalTerminationDate
        row.legal_notice_period = legalMetadata.legalNoticePeriod
        row.legal_auto_renewal = legalMetadata.legalAutoRenewal
      }
    }

    const additionalApproverContext = await this.getAdditionalApproverContractContextMap(
      params.tenantId,
      rows.map((row) => row.id),
      params.employeeId
    )

    const items = rows.map((row) => this.mapListItem(row, additionalApproverContext.get(row.id)))
    return this.attachActorContractSignals(params.tenantId, params.employeeId, items, params.role)
  }

  async getDashboardContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    filter: DashboardContractFilter
    scope?: DashboardContractScope
    cursor?: string
    limit: number
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }> {
    const resolvedFilter = this.resolveDashboardFilter(params.role, params.filter)
    const shouldUsePersonalScope = params.scope === 'personal'
    let statusFilter = this.resolveDashboardStatusFromFilter(resolvedFilter)

    if (shouldUsePersonalScope && resolvedFilter === 'ASSIGNED_TO_ME' && params.role === 'ADMIN') {
      statusFilter = contractStatuses.hodPending
    }

    const decodedCursor = this.decodeTimestampIdCursor(params.cursor)
    const supabase = createServiceSupabase()
    const shouldFilterAssignedToMe = resolvedFilter === 'ASSIGNED_TO_ME' && !shouldUsePersonalScope
    const actorEmailPromise = shouldUsePersonalScope
      ? this.getEmployeeEmail(params.tenantId, params.employeeId)
      : Promise.resolve<string | null>(null)
    const actorEmail = await actorEmailPromise
    let assignedContractIds: string[] | null = null

    if (shouldFilterAssignedToMe) {
      const assignedIds = new Set<string>()

      const [assigneeResult, collaboratorResult] = await Promise.all([
        params.role !== 'LEGAL_TEAM'
          ? (async () => {
              let assigneeQuery = supabase
                .from('contracts_repository_view')
                .select('id')
                .eq('tenant_id', params.tenantId)
                .eq('current_assignee_employee_id', params.employeeId)

              if (statusFilter) {
                assigneeQuery = assigneeQuery.eq('status', statusFilter)
              }

              return assigneeQuery
            })()
          : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
        supabase
          .from('contract_legal_collaborators')
          .select('contract_id')
          .eq('tenant_id', params.tenantId)
          .eq('collaborator_employee_id', params.employeeId)
          .is('deleted_at', null),
      ])

      if (assigneeResult.error) {
        throw new DatabaseError(
          'Failed to resolve assigned contracts for dashboard filter',
          new Error(assigneeResult.error.message),
          {
            code: assigneeResult.error.code,
          }
        )
      }

      for (const row of (assigneeResult.data ?? []) as Array<{ id: string }>) {
        assignedIds.add(row.id)
      }

      const { data: collaboratorRows, error: collaboratorError } = collaboratorResult

      if (collaboratorError) {
        if (
          !this.isMissingRelationError(collaboratorError, 'contract_legal_collaborators') &&
          !this.isMissingColumnError(collaboratorError, 'contract_legal_collaborators')
        ) {
          throw new DatabaseError(
            'Failed to resolve legal collaborator contracts for dashboard filter',
            new Error(collaboratorError.message),
            {
              code: collaboratorError.code,
            }
          )
        }
      } else {
        const collaboratorContractIds = (collaboratorRows ?? []).map((row) => row.contract_id)
        if (collaboratorContractIds.length > 0) {
          let collaboratorContractQuery = supabase
            .from('contracts_repository_view')
            .select('id')
            .eq('tenant_id', params.tenantId)
            .in('id', collaboratorContractIds)

          if (statusFilter) {
            collaboratorContractQuery = collaboratorContractQuery.eq('status', statusFilter)
          }

          const { data: collaboratorContractRows, error: collaboratorContractError } = await collaboratorContractQuery

          if (collaboratorContractError) {
            throw new DatabaseError(
              'Failed to resolve collaborator dashboard contracts from repository view',
              new Error(collaboratorContractError.message),
              {
                code: collaboratorContractError.code,
              }
            )
          }

          for (const row of (collaboratorContractRows ?? []) as Array<{ id: string }>) {
            assignedIds.add(row.id)
          }
        }
      }

      assignedContractIds = Array.from(assignedIds)
      if (assignedContractIds.length === 0) {
        return { items: [], total: 0 }
      }
    }

    const visibilityFilterContextPromise = shouldUsePersonalScope
      ? Promise.resolve<VisibilityFilterContext | null>(null)
      : this.getVisibilityFilter(params.tenantId, params.role, params.employeeId)

    let query = supabase
      .from('contracts_repository_view')
      .select(
        'id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, aging_business_days, near_breach, is_tat_breached, created_at, updated_at'
      )
      .eq('tenant_id', params.tenantId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    if (decodedCursor) {
      query = query.lt('created_at', decodedCursor.createdAt)
    }

    if (assignedContractIds) {
      query = query.in('id', assignedContractIds)
    }

    const visibilityFilterContext = await visibilityFilterContextPromise

    if (shouldUsePersonalScope) {
      if (actorEmail) {
        query = query.or(`current_assignee_employee_id.eq.${params.employeeId},current_assignee_email.eq.${actorEmail}`)
      } else {
        query = query.eq('current_assignee_employee_id', params.employeeId)
      }
    } else if (visibilityFilterContext?.filter) {
      query = query.or(visibilityFilterContext.filter)
    }

    const totalQueryPromise = !params.cursor
      ? (() => {
          let totalQuery = supabase
            .from('contracts_repository_view')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', params.tenantId)

          if (statusFilter) {
            totalQuery = totalQuery.eq('status', statusFilter)
          }

          if (assignedContractIds) {
            totalQuery = totalQuery.in('id', assignedContractIds)
          }

          if (shouldUsePersonalScope) {
            if (actorEmail) {
              totalQuery = totalQuery.or(
                `current_assignee_employee_id.eq.${params.employeeId},current_assignee_email.eq.${actorEmail}`
              )
            } else {
              totalQuery = totalQuery.eq('current_assignee_employee_id', params.employeeId)
            }
          } else if (visibilityFilterContext?.filter) {
            totalQuery = totalQuery.or(visibilityFilterContext.filter)
          }

          return totalQuery
        })()
      : Promise.resolve<{ count: number | null; error: null }>({ count: 0, error: null })

    const [totalResult, listResult] = await Promise.all([totalQueryPromise, query])

    if (totalResult.error) {
      throw new DatabaseError('Failed to count dashboard contracts', new Error(totalResult.error.message), {
        code: totalResult.error.code,
      })
    }

    const totalCount = params.cursor ? 0 : (totalResult.count ?? 0)
    const { data, error } = listResult

    if (error) {
      throw new DatabaseError('Failed to fetch dashboard contracts', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string
      title: string
      status: string
      uploaded_by_employee_id: string
      uploaded_by_email: string
      current_assignee_employee_id: string
      current_assignee_email: string
      hod_approved_at: string | null
      tat_deadline_at: string | null
      tat_breached_at: string | null
      aging_business_days: number | null
      near_breach: boolean
      is_tat_breached: boolean
      created_at: string
      updated_at: string
    }>

    const validRows = rows.filter((row) => this.validStatuses.has(row.status as ContractStatus))

    const additionalApproverContext = await this.getAdditionalApproverContractContextMap(
      params.tenantId,
      validRows.map((row) => row.id),
      params.employeeId
    )

    const hasNext = validRows.length > params.limit
    const rowsForPage = validRows.slice(0, params.limit)
    const dashboardRowsEnrichment = await this.resolveListContractEnrichment(params.tenantId, rowsForPage)
    const mappedItems = rowsForPage.map((row) =>
      this.mapListItem(row, additionalApproverContext.get(row.id), {
        creatorName: dashboardRowsEnrichment.creatorNameByContractId.get(row.id) ?? null,
        executedAt: dashboardRowsEnrichment.executedAtByContractId.get(row.id) ?? null,
      })
    )
    const items = await this.attachActorContractSignals(params.tenantId, params.employeeId, mappedItems, params.role)
    const nextCursor = hasNext
      ? this.encodeTimestampIdCursor(items[items.length - 1]?.createdAt ?? '', items[items.length - 1]?.id ?? '')
      : undefined

    return { items, nextCursor, total: totalCount }
  }

  /**
   * Optimised count-only variant of getDashboardContracts.
   * Executes a single HEAD COUNT query — no row fetch, no additional approver
   * context map, no actor signal enrichment. Use this for the counts endpoint.
   */
  async getDashboardFilterCount(params: {
    tenantId: string
    employeeId: string
    role?: string
    filter: DashboardContractFilter
    scope?: DashboardContractScope
  }): Promise<number> {
    const resolvedFilter = this.resolveDashboardFilter(params.role, params.filter)
    const shouldUsePersonalScope = params.scope === 'personal'
    let statusFilter = this.resolveDashboardStatusFromFilter(resolvedFilter)

    if (shouldUsePersonalScope && resolvedFilter === 'ASSIGNED_TO_ME' && params.role === 'ADMIN') {
      statusFilter = contractStatuses.hodPending
    }

    const supabase = createServiceSupabase()
    const shouldFilterAssignedToMe = resolvedFilter === 'ASSIGNED_TO_ME' && !shouldUsePersonalScope

    // For personal-scope counts we need the actor email to match the assignee.
    const actorEmail = shouldUsePersonalScope ? await this.getEmployeeEmail(params.tenantId, params.employeeId) : null

    let assignedContractIds: string[] | null = null

    if (shouldFilterAssignedToMe) {
      const assignedIds = new Set<string>()

      // Resolve directly-assigned contracts and legal-collaborator contracts
      // in parallel to avoid sequential round-trips.
      const [assigneeResult, collaboratorResult] = await Promise.all([
        params.role !== 'LEGAL_TEAM'
          ? (async () => {
              let q = supabase
                .from('contracts_repository_view')
                .select('id')
                .eq('tenant_id', params.tenantId)
                .eq('current_assignee_employee_id', params.employeeId)
              if (statusFilter) q = q.eq('status', statusFilter)
              return q
            })()
          : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
        supabase
          .from('contract_legal_collaborators')
          .select('contract_id')
          .eq('tenant_id', params.tenantId)
          .eq('collaborator_employee_id', params.employeeId)
          .is('deleted_at', null),
      ])

      if (assigneeResult.error) {
        throw new DatabaseError(
          'Failed to resolve assigned contracts for dashboard count',
          new Error(assigneeResult.error.message),
          { code: assigneeResult.error.code }
        )
      }
      for (const row of (assigneeResult.data ?? []) as Array<{ id: string }>) {
        assignedIds.add(row.id)
      }

      if (collaboratorResult.error) {
        if (
          !this.isMissingRelationError(collaboratorResult.error, 'contract_legal_collaborators') &&
          !this.isMissingColumnError(collaboratorResult.error, 'contract_legal_collaborators')
        ) {
          throw new DatabaseError(
            'Failed to resolve legal collaborator contracts for dashboard count',
            new Error(collaboratorResult.error.message),
            { code: collaboratorResult.error.code }
          )
        }
      } else {
        const collaboratorContractIds = (collaboratorResult.data ?? []).map((row) => row.contract_id)
        if (collaboratorContractIds.length > 0) {
          let collaboratorContractQuery = supabase
            .from('contracts_repository_view')
            .select('id')
            .eq('tenant_id', params.tenantId)
            .in('id', collaboratorContractIds)
          if (statusFilter) collaboratorContractQuery = collaboratorContractQuery.eq('status', statusFilter)

          const { data: collaboratorContractRows, error: collaboratorContractError } = await collaboratorContractQuery

          if (collaboratorContractError) {
            throw new DatabaseError(
              'Failed to resolve collaborator dashboard contracts for count',
              new Error(collaboratorContractError.message),
              { code: collaboratorContractError.code }
            )
          }
          for (const row of (collaboratorContractRows ?? []) as Array<{ id: string }>) {
            assignedIds.add(row.id)
          }
        }
      }

      assignedContractIds = Array.from(assignedIds)
      if (assignedContractIds.length === 0) {
        return 0
      }
    }

    // For non-personal scope, fetch the visibility filter in parallel with any
    // remaining work (nothing else to await here, but structured for clarity).
    const visibilityFilterContext = shouldUsePersonalScope
      ? null
      : await this.getVisibilityFilter(params.tenantId, params.role, params.employeeId)

    let countQuery = supabase
      .from('contracts_repository_view')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', params.tenantId)

    if (statusFilter) {
      countQuery = countQuery.eq('status', statusFilter)
    }

    if (assignedContractIds) {
      countQuery = countQuery.in('id', assignedContractIds)
    }

    if (shouldUsePersonalScope) {
      if (actorEmail) {
        countQuery = countQuery.or(
          `current_assignee_employee_id.eq.${params.employeeId},current_assignee_email.eq.${actorEmail}`
        )
      } else {
        countQuery = countQuery.eq('current_assignee_employee_id', params.employeeId)
      }
    } else {
      if (visibilityFilterContext?.filter) {
        countQuery = countQuery.or(visibilityFilterContext.filter)
      }
    }

    const { count, error } = await countQuery
    if (error) {
      throw new DatabaseError('Failed to count dashboard contracts', new Error(error.message), {
        code: error.code,
      })
    }

    return count ?? 0
  }

  async listRepositoryContracts(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    sortBy?: RepositorySortBy
    sortDirection?: RepositorySortDirection
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<{ items: ContractListItem[]; nextCursor?: string; total: number }> {
    const supabase = createServiceSupabase()
    const decodedCursor = this.decodeTimestampIdCursor(params.cursor)
    const sortBy = params.sortBy ?? 'created_at'
    const sortDirection = params.sortDirection ?? 'desc'
    const dateFilter = this.resolveRepositoryDateFilter({
      dateBasis: params.dateBasis,
      datePreset: params.datePreset,
      fromDate: params.fromDate,
      toDate: params.toDate,
    })

    const visibilityFilter = await this.getVisibilityFilter(params.tenantId, params.role, params.employeeId)
    const workflowStatusesForRepositoryStatus = params.repositoryStatus
      ? repositoryStatusToWorkflowStatuses[params.repositoryStatus]
      : null

    const contractsJoinedSelect =
      'id, tenant_id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, request_created_at, department_id, legal_effective_date, legal_termination_date, legal_notice_period, legal_auto_renewal, void_reason, created_at, updated_at, department:teams!contracts_department_id_fkey(name), assignments:contract_repository_assignments(user_email, assignment_role, deleted_at), legal_collaborators:contract_legal_collaborators(collaborator_email, deleted_at), additional_approvers:contract_additional_approvers(approver_employee_id, status, sequence_order, approved_at, deleted_at)'

    const buildLegacyListQuery = (source: 'contracts_repository_view' | 'contracts', selectColumns: string) => {
      let query = supabase
        .from(source)
        .select(selectColumns)
        .eq('tenant_id', params.tenantId)
        .limit(params.limit + 1)

      if (source === 'contracts') {
        query = query.is('deleted_at', null)
      }

      if (params.status) {
        query = query.eq('status', params.status)
      }

      if (workflowStatusesForRepositoryStatus && workflowStatusesForRepositoryStatus.length > 0) {
        query = query.in('status', workflowStatusesForRepositoryStatus)
      }

      if (params.search) {
        query = query.ilike('title', `%${params.search}%`)
      }

      if (dateFilter.fromInclusive) {
        query = query.gte(dateFilter.column, dateFilter.fromInclusive)
      }

      if (dateFilter.toExclusive) {
        query = query.lt(dateFilter.column, dateFilter.toExclusive)
      }

      if (sortBy === 'title') {
        query = query.order('title', { ascending: sortDirection === 'asc' }).order('id', { ascending: false })
      } else if (sortBy === 'status') {
        query = query.order('status', { ascending: sortDirection === 'asc' }).order('id', { ascending: false })
      } else if (sortBy === 'hod_approved_at') {
        query = query
          .order('hod_approved_at', { ascending: sortDirection === 'asc', nullsFirst: sortDirection === 'asc' })
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
      } else if (sortBy === 'tat_deadline_at') {
        query = query
          .order('tat_deadline_at', { ascending: sortDirection === 'asc', nullsFirst: sortDirection === 'asc' })
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: sortDirection === 'asc' }).order('id', { ascending: false })
      }

      if (decodedCursor && sortBy === 'created_at' && sortDirection === 'desc') {
        query = query.lt('created_at', decodedCursor.createdAt)
      }

      if (visibilityFilter?.filter) {
        query = query.or(visibilityFilter.filter)
      }

      return query
    }

    const buildLegacyTotalQuery = (source: 'contracts_repository_view' | 'contracts') => {
      let totalQuery = supabase
        .from(source)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', params.tenantId)

      if (source === 'contracts') {
        totalQuery = totalQuery.is('deleted_at', null)
      }

      if (params.status) {
        totalQuery = totalQuery.eq('status', params.status)
      }

      if (workflowStatusesForRepositoryStatus && workflowStatusesForRepositoryStatus.length > 0) {
        totalQuery = totalQuery.in('status', workflowStatusesForRepositoryStatus)
      }

      if (params.search) {
        totalQuery = totalQuery.ilike('title', `%${params.search}%`)
      }

      if (dateFilter.fromInclusive) {
        totalQuery = totalQuery.gte(dateFilter.column, dateFilter.fromInclusive)
      }

      if (dateFilter.toExclusive) {
        totalQuery = totalQuery.lt(dateFilter.column, dateFilter.toExclusive)
      }

      if (visibilityFilter?.filter) {
        totalQuery = totalQuery.or(visibilityFilter.filter)
      }

      return totalQuery
    }

    const buildListQuery = () => {
      let query = supabase
        .from('contracts')
        .select(contractsJoinedSelect)
        .eq('tenant_id', params.tenantId)
        .is('deleted_at', null)
        .limit(params.limit + 1)

      if (params.status) {
        query = query.eq('status', params.status)
      }

      if (workflowStatusesForRepositoryStatus && workflowStatusesForRepositoryStatus.length > 0) {
        query = query.in('status', workflowStatusesForRepositoryStatus)
      }

      if (params.search) {
        query = query.ilike('title', `%${params.search}%`)
      }

      if (dateFilter.fromInclusive) {
        query = query.gte(dateFilter.column, dateFilter.fromInclusive)
      }

      if (dateFilter.toExclusive) {
        query = query.lt(dateFilter.column, dateFilter.toExclusive)
      }

      if (sortBy === 'title') {
        query = query.order('title', { ascending: sortDirection === 'asc' }).order('id', { ascending: false })
      } else if (sortBy === 'status') {
        query = query.order('status', { ascending: sortDirection === 'asc' }).order('id', { ascending: false })
      } else if (sortBy === 'hod_approved_at') {
        query = query
          .order('hod_approved_at', { ascending: sortDirection === 'asc', nullsFirst: sortDirection === 'asc' })
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
      } else if (sortBy === 'tat_deadline_at') {
        query = query
          .order('tat_deadline_at', { ascending: sortDirection === 'asc', nullsFirst: sortDirection === 'asc' })
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: sortDirection === 'asc' }).order('id', { ascending: false })
      }

      if (decodedCursor && sortBy === 'created_at' && sortDirection === 'desc') {
        query = query.lt('created_at', decodedCursor.createdAt)
      }

      if (visibilityFilter?.filter) {
        query = query.or(visibilityFilter.filter)
      }

      return query
    }

    const buildTotalQuery = () => {
      let totalQuery = supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', params.tenantId)
        .is('deleted_at', null)

      if (params.status) {
        totalQuery = totalQuery.eq('status', params.status)
      }

      if (workflowStatusesForRepositoryStatus && workflowStatusesForRepositoryStatus.length > 0) {
        totalQuery = totalQuery.in('status', workflowStatusesForRepositoryStatus)
      }

      if (params.search) {
        totalQuery = totalQuery.ilike('title', `%${params.search}%`)
      }

      if (dateFilter.fromInclusive) {
        totalQuery = totalQuery.gte(dateFilter.column, dateFilter.fromInclusive)
      }

      if (dateFilter.toExclusive) {
        totalQuery = totalQuery.lt(dateFilter.column, dateFilter.toExclusive)
      }

      if (visibilityFilter?.filter) {
        totalQuery = totalQuery.or(visibilityFilter.filter)
      }

      return totalQuery
    }

    let totalCount = 0
    if (!params.cursor) {
      const totalResult = await buildTotalQuery()

      if (totalResult.error) {
        throw new DatabaseError('Failed to count repository contracts', new Error(totalResult.error.message), {
          code: totalResult.error.code,
        })
      }

      totalCount = totalResult.count ?? 0
    }

    const { data, error } = await buildListQuery()

    const shouldFallbackToLegacyPath =
      error !== null &&
      (this.isMissingRelationError(error, 'contract_repository_assignments') ||
        this.isMissingRelationError(error, 'contract_legal_collaborators') ||
        this.isMissingRelationError(error, 'contract_additional_approvers') ||
        this.isMissingRelationError(error, 'teams') ||
        this.isMissingColumnError(error, 'contracts'))

    if (shouldFallbackToLegacyPath) {
      if (!params.cursor) {
        let totalResult = await buildLegacyTotalQuery('contracts_repository_view')

        if (totalResult.error && this.isViewQueryCompatibilityError(totalResult.error, 'contracts_repository_view')) {
          totalResult = await buildLegacyTotalQuery('contracts')
        }

        if (totalResult.error) {
          throw new DatabaseError('Failed to count repository contracts', new Error(totalResult.error.message), {
            code: totalResult.error.code,
          })
        }

        totalCount = totalResult.count ?? 0
      }

      let legacyResult = await buildLegacyListQuery('contracts_repository_view', contractsListSelectWithSlaMetrics)

      if (legacyResult.error && this.isMissingColumnError(legacyResult.error, 'contracts_repository_view')) {
        legacyResult = await buildLegacyListQuery('contracts_repository_view', contractsListSelectLegacy)
      }

      if (legacyResult.error && this.isViewQueryCompatibilityError(legacyResult.error, 'contracts_repository_view')) {
        legacyResult = await buildLegacyListQuery('contracts', contractsListSelectFromContractsTable)
      }

      if (legacyResult.error) {
        throw new DatabaseError('Failed to list repository contracts', new Error(legacyResult.error.message), {
          code: legacyResult.error.code,
        })
      }

      const legacyRows = (legacyResult.data ?? []) as unknown as Array<{
        id: string
        title: string
        status: string
        uploaded_by_employee_id: string
        uploaded_by_email: string
        current_assignee_employee_id: string
        current_assignee_email: string
        hod_approved_at: string | null
        tat_deadline_at: string | null
        tat_breached_at: string | null
        request_created_at: string | null
        department_id: string | null
        legal_effective_date?: string | null
        legal_termination_date?: string | null
        legal_notice_period?: string | null
        legal_auto_renewal?: boolean | null
        aging_business_days: number | null
        near_breach: boolean
        is_tat_breached: boolean
        created_at: string
        updated_at: string
      }>

      const departmentIds = Array.from(
        new Set(legacyRows.map((row) => row.department_id).filter((value): value is string => Boolean(value)))
      )
      const hasNext = legacyRows.length > params.limit
      const [additionalApproverContext, departmentRowsResult, assignmentMap, legalMetadataByContractId] =
        await Promise.all([
          this.getAdditionalApproverContractContextMap(
            params.tenantId,
            legacyRows.map((row) => row.id),
            params.employeeId
          ),
          departmentIds.length > 0
            ? supabase
                .from('teams')
                .select('id, name')
                .eq('tenant_id', params.tenantId)
                .in('id', departmentIds)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
          params.role === 'LEGAL_TEAM'
            ? this.getContractLegalCollaboratorEmailMap(params.tenantId, legacyRows)
            : this.getContractAssignmentEmailMap(
                params.tenantId,
                legacyRows.map((row) => row.id),
                legacyRows
              ),
          this.getContractLegalMetadataMap(
            params.tenantId,
            legacyRows.map((row) => row.id)
          ),
        ])

      if (departmentRowsResult.error) {
        throw new DatabaseError(
          'Failed to resolve contract departments',
          new Error(departmentRowsResult.error.message),
          {
            code: departmentRowsResult.error.code,
          }
        )
      }

      const departmentNameById = new Map<string, string>()
      for (const departmentRow of (departmentRowsResult.data ?? []) as Array<{ id: string; name: string }>) {
        departmentNameById.set(departmentRow.id, departmentRow.name)
      }

      const hydratedLegacyRows = legacyRows.map((row) => {
        const legalMetadata = legalMetadataByContractId.get(row.id)
        if (!legalMetadata) {
          return row
        }

        return {
          ...row,
          legal_effective_date: legalMetadata.legalEffectiveDate,
          legal_termination_date: legalMetadata.legalTerminationDate,
          legal_notice_period: legalMetadata.legalNoticePeriod,
          legal_auto_renewal: legalMetadata.legalAutoRenewal,
        }
      })

      const legacyRowsForPage = hydratedLegacyRows.slice(0, params.limit)
      const legacyEnrichment = await this.resolveListContractEnrichment(params.tenantId, legacyRowsForPage)

      const mappedItems = legacyRowsForPage.map((row) =>
        this.mapListItem(row, additionalApproverContext.get(row.id), {
          creatorName: legacyEnrichment.creatorNameByContractId.get(row.id) ?? null,
          executedAt: legacyEnrichment.executedAtByContractId.get(row.id) ?? null,
          departmentName: row.department_id ? (departmentNameById.get(row.department_id) ?? null) : null,
          assignedToUsers:
            params.role === 'LEGAL_TEAM'
              ? (assignmentMap.get(row.id) ?? [])
              : (assignmentMap.get(row.id) ?? [row.current_assignee_email]),
        })
      )

      const items = await this.attachActorContractSignals(params.tenantId, params.employeeId, mappedItems, params.role)
      const nextCursor =
        sortBy === 'created_at' && sortDirection === 'desc' && hasNext
          ? this.encodeTimestampIdCursor(items[items.length - 1]?.createdAt ?? '', items[items.length - 1]?.id ?? '')
          : undefined

      return { items, nextCursor, total: totalCount }
    }

    if (error) {
      throw new DatabaseError('Failed to list repository contracts', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as unknown as RepositoryJoinedContractRow[]

    const additionalApproverContext = this.buildAdditionalApproverContextFromJoinedRows(
      rows,
      params.employeeId,
      visibilityFilter?.actionableContractIds ?? []
    )

    const hasNext = rows.length > params.limit

    const assignmentMap = this.buildAssignmentMapFromJoinedRows(rows, params.role)
    const rowsForPage = rows.slice(0, params.limit)
    const joinedEnrichment = await this.resolveListContractEnrichment(params.tenantId, rowsForPage)

    const mappedItems = rowsForPage.map((row) =>
      this.mapListItem(row, additionalApproverContext.get(row.id), {
        creatorName: joinedEnrichment.creatorNameByContractId.get(row.id) ?? null,
        executedAt: joinedEnrichment.executedAtByContractId.get(row.id) ?? null,
        departmentName: this.resolveDepartmentName(row.department),
        assignedToUsers:
          params.role === 'LEGAL_TEAM'
            ? (assignmentMap.get(row.id) ?? [])
            : (assignmentMap.get(row.id) ?? [row.current_assignee_email]),
      })
    )
    const items = await this.attachActorContractSignals(params.tenantId, params.employeeId, mappedItems, params.role)
    const nextCursor =
      sortBy === 'created_at' && sortDirection === 'desc' && hasNext
        ? this.encodeTimestampIdCursor(items[items.length - 1]?.createdAt ?? '', items[items.length - 1]?.id ?? '')
        : undefined

    return { items, nextCursor, total: totalCount }
  }

  async getRepositoryReport(params: {
    tenantId: string
    employeeId: string
    role?: string
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<RepositoryReport> {
    const contracts = await this.collectRepositoryContractsForReporting(params)

    const pendingStatuses = new Set<ContractStatus>([
      contractStatuses.draft,
      contractStatuses.uploaded,
      contractStatuses.hodPending,
      contractStatuses.underReview,
      contractStatuses.pendingInternal,
      contractStatuses.pendingExternal,
      contractStatuses.signing,
      contractStatuses.offlineExecution,
      contractStatuses.onHold,
    ])
    const approvedStatuses = new Set<ContractStatus>([contractStatuses.completed, contractStatuses.executed])
    const statusValues = contracts.map((contract) => contract.repositoryStatus)

    const departmentMap = new Map<
      string,
      {
        departmentId: string | null
        departmentName: string | null
        totalRequestsReceived: number
        approved: number
        rejected: number
        completed: number
        pending: number
      }
    >()

    for (const contract of contracts) {
      const departmentKey = contract.departmentId ?? 'unassigned'
      const current = departmentMap.get(departmentKey) ?? {
        departmentId: contract.departmentId ?? null,
        departmentName: contract.departmentName ?? null,
        totalRequestsReceived: 0,
        approved: 0,
        rejected: 0,
        completed: 0,
        pending: 0,
      }

      current.totalRequestsReceived += 1
      if (approvedStatuses.has(contract.status)) {
        current.approved += 1
      }
      if (contract.status === contractStatuses.rejected) {
        current.rejected += 1
      }
      if (contract.status === contractStatuses.completed) {
        current.completed += 1
      }
      if (pendingStatuses.has(contract.status)) {
        current.pending += 1
      }

      departmentMap.set(departmentKey, current)
    }

    const statusMetrics: RepositoryStatusMetric[] = [
      {
        key: contractRepositoryStatusMetricKeys.executed,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.executed],
        count: statusValues.filter((status) => status === 'EXECUTED').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.completed,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.completed],
        count: statusValues.filter((status) => status === 'COMPLETED').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.signing,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.signing],
        count: statusValues.filter((status) => status === 'SIGNING').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.underReview,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.underReview],
        count: statusValues.filter((status) => status === 'UNDER_REVIEW').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.pendingInternal,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.pendingInternal],
        count: statusValues.filter((status) => status === 'PENDING_WITH_INTERNAL_STAKEHOLDERS').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.pendingExternal,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.pendingExternal],
        count: statusValues.filter((status) => status === 'PENDING_WITH_EXTERNAL_STAKEHOLDERS').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.hodApprovalPending,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.hodApprovalPending],
        count: statusValues.filter((status) => status === 'HOD_APPROVAL_PENDING').length,
      },
      {
        key: contractRepositoryStatusMetricKeys.tatBreached,
        label: contractRepositoryStatusMetricLabels[contractRepositoryStatusMetricKeys.tatBreached],
        count: contracts.filter((contract) => contract.isTatBreached).length,
      },
    ]

    return {
      departmentMetrics: Array.from(departmentMap.values()).sort(
        (a, b) => b.totalRequestsReceived - a.totalRequestsReceived
      ),
      statusMetrics,
    }
  }

  async listRepositoryExportRows(params: {
    tenantId: string
    employeeId: string
    role?: string
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
    columns: RepositoryExportColumn[]
  }): Promise<RepositoryExportRow[]> {
    const rows: RepositoryExportRow[] = []
    let cursor: string | undefined

    while (true) {
      const chunk = await this.listRepositoryExportRowsChunk({
        ...params,
        cursor,
        limit: 200,
      })

      rows.push(...chunk.items)

      if (!chunk.nextCursor) {
        break
      }

      cursor = chunk.nextCursor
    }

    return rows
  }

  async listRepositoryExportRowsChunk(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
    columns: RepositoryExportColumn[]
  }): Promise<RepositoryExportRowsChunk> {
    const result = await this.listRepositoryContracts({
      tenantId: params.tenantId,
      employeeId: params.employeeId,
      role: params.role,
      cursor: params.cursor,
      limit: params.limit,
      search: params.search,
      status: params.status,
      repositoryStatus: params.repositoryStatus,
      sortBy: 'created_at',
      sortDirection: 'desc',
      dateBasis: params.dateBasis,
      datePreset: params.datePreset,
      fromDate: params.fromDate,
      toDate: params.toDate,
    })

    const selectedColumns =
      params.columns.length > 0
        ? params.columns
        : (Object.keys(contractRepositoryExportColumnLabels) as RepositoryExportColumn[])

    return {
      items: result.items.map((contract) => this.mapRepositoryExportRow(contract, selectedColumns)),
      nextCursor: result.nextCursor,
    }
  }

  private mapRepositoryExportRow(
    contract: ContractListItem,
    selectedColumns: RepositoryExportColumn[]
  ): RepositoryExportRow {
    const row = {} as RepositoryExportRow

    for (const column of selectedColumns) {
      if (column === 'request_date') {
        row[column] = contract.requestCreatedAt ?? contract.createdAt
      } else if (column === 'creator') {
        row[column] = contract.creatorName ?? contract.uploadedByEmail
      } else if (column === 'department') {
        row[column] = contract.departmentName ?? 'Unassigned'
      } else if (column === 'hod_approval') {
        row[column] = contract.hodApprovedAt ? 'Yes' : 'No'
      } else if (column === 'approval_date') {
        row[column] = contract.hodApprovedAt ?? ''
      } else if (column === 'tat') {
        row[column] = contractRepositoryTatPolicy.label
      } else if (column === 'contract_aging') {
        row[column] = contract.agingBusinessDays ?? ''
      } else if (column === 'status') {
        row[column] = contract.repositoryStatusLabel ?? contract.displayStatusLabel ?? contract.status
      } else if (column === 'assigned_to') {
        row[column] = (contract.assignedToUsers ?? [contract.currentAssigneeEmail]).join('; ')
      } else if (column === 'effective_date') {
        row[column] = this.formatRepositoryLegalDate(contract.legalEffectiveDate)
      } else if (column === 'termination_date') {
        row[column] = this.formatRepositoryLegalDate(contract.legalTerminationDate)
      } else if (column === 'notice_period') {
        row[column] = contract.legalNoticePeriod?.trim() || '-'
      } else if (column === 'auto_renewal') {
        row[column] = contract.legalAutoRenewal === true ? 'Yes' : contract.legalAutoRenewal === false ? 'No' : '-'
      } else if (column === 'tat_breached') {
        row[column] = contract.isTatBreached ? 'Yes' : 'No'
      } else if (column === 'overdue_days') {
        row[column] = contract.isTatBreached
          ? Math.max((contract.agingBusinessDays ?? 0) - contractRepositoryTatPolicy.businessDays, 0)
          : 0
      } else if (column === 'contract_title') {
        row[column] = contract.title
      }
    }

    return row
  }

  private formatRepositoryLegalDate(value?: string | null): string {
    if (!value) {
      return '-'
    }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return '-'
    }

    const day = String(parsed.getUTCDate()).padStart(2, '0')
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
    const year = parsed.getUTCFullYear()
    return `${day}-${month}-${year}`
  }

  async getById(tenantId: string, contractId: string): Promise<ContractDetail | null> {
    const supabase = createServiceSupabase()

    const contractDetailSelectWithLegalMetadata =
      'id, tenant_id, title, contract_type_id, counterparty_name, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, signatory_name, signatory_designation, signatory_email, background_of_request, department_id, budget_approved, legal_effective_date, legal_termination_date, legal_notice_period, legal_auto_renewal, request_created_at, current_document_id, void_reason, hod_approved_at, tat_deadline_at, tat_breached_at, file_name, file_size_bytes, file_mime_type, file_path, created_at, updated_at, row_version, upload_mode'
    const contractDetailSelectLegacy =
      'id, tenant_id, title, contract_type_id, counterparty_name, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, signatory_name, signatory_designation, signatory_email, background_of_request, department_id, budget_approved, request_created_at, current_document_id, void_reason, hod_approved_at, tat_deadline_at, tat_breached_at, file_name, file_size_bytes, file_mime_type, file_path, created_at, updated_at, row_version'

    const { data: preferredData, error: preferredError } = await supabase
      .from('contracts')
      .select(contractDetailSelectWithLegalMetadata)
      .eq('tenant_id', tenantId)
      .eq('id', contractId)
      .is('deleted_at', null)
      .single<ContractEntity>()

    if (preferredError && !this.isMissingColumnError(preferredError, 'contracts')) {
      if (preferredError.code === 'PGRST116') {
        return null
      }
      throw new DatabaseError('Failed to fetch contract detail', new Error(preferredError.message), {
        code: preferredError.code,
      })
    }

    let data = preferredData

    if (!data && preferredError && this.isMissingColumnError(preferredError, 'contracts')) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('contracts')
        .select(contractDetailSelectLegacy)
        .eq('tenant_id', tenantId)
        .eq('id', contractId)
        .is('deleted_at', null)
        .single<ContractEntity>()

      if (legacyError) {
        if (legacyError.code === 'PGRST116') {
          return null
        }

        throw new DatabaseError('Failed to fetch contract detail', new Error(legacyError.message), {
          code: legacyError.code,
        })
      }

      data = legacyData
    }

    if (!data) {
      return null
    }

    const metadata = await this.resolveContractDetailMetadata({
      tenantId,
      contractTypeId: data.contract_type_id,
      departmentId: data.department_id,
      uploadMode: data.upload_mode,
      contractStatus: data.status,
      currentAssigneeEmail: data.current_assignee_email,
    })

    const additionalApproverContext = await this.getAdditionalApproverContractContextMap(tenantId, [data.id], null)
    return this.mapDetail(data, metadata, additionalApproverContext.get(data.id))
  }

  async getActionableAdditionalApprovals(params: {
    tenantId: string
    employeeId: string
    limit: number
  }): Promise<ContractListItem[]> {
    const actionableContractIds = await this.getActionableAdditionalApproverContractIds(
      params.tenantId,
      params.employeeId
    )

    if (actionableContractIds.length === 0) {
      return []
    }

    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contracts_repository_view')
      .select(
        'id, tenant_id, title, status, uploaded_by_employee_id, uploaded_by_email, current_assignee_employee_id, current_assignee_email, hod_approved_at, tat_deadline_at, tat_breached_at, aging_business_days, near_breach, is_tat_breached, created_at, updated_at'
      )
      .eq('tenant_id', params.tenantId)
      .in('id', actionableContractIds)
      .order('created_at', { ascending: false })
      .limit(params.limit)

    if (error) {
      throw new DatabaseError('Failed to fetch actionable additional approver contracts', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as Array<{
      id: string
      title: string
      status: string
      uploaded_by_employee_id: string
      uploaded_by_email: string
      current_assignee_employee_id: string
      current_assignee_email: string
      hod_approved_at: string | null
      tat_deadline_at: string | null
      tat_breached_at: string | null
      aging_business_days: number | null
      near_breach: boolean
      is_tat_breached: boolean
      created_at: string
      updated_at: string
    }>

    const additionalApproverContext = await this.getAdditionalApproverContractContextMap(
      params.tenantId,
      rows.map((row) => row.id),
      params.employeeId
    )

    const items = rows.map((row) => this.mapListItem(row, additionalApproverContext.get(row.id)))
    return this.attachActorContractSignals(params.tenantId, params.employeeId, items)
  }

  async getAdditionalApproverDecisionHistory(params: {
    tenantId: string
    employeeId: string
    role?: string
    cursor?: string
    limit: number
    departmentId?: string
  }): Promise<{ items: AdditionalApproverDecisionHistoryItem[]; nextCursor?: string; total: number }> {
    const supabase = createServiceSupabase()
    const decodedCursor = this.decodeCursor(params.cursor)
    const normalizedRole = (params.role ?? '').toUpperCase()
    const isAdminRole =
      normalizedRole === 'ADMIN' || normalizedRole === 'LEGAL_ADMIN' || normalizedRole === 'SUPER_ADMIN'

    let scopedContractIds: string[] | null = null
    if (params.departmentId) {
      const { data: departmentContracts, error: departmentContractsError } = await supabase
        .from('contracts')
        .select('id')
        .eq('tenant_id', params.tenantId)
        .eq('department_id', params.departmentId)
        .is('deleted_at', null)

      if (departmentContractsError) {
        throw new DatabaseError(
          'Failed to resolve department-filtered contracts for additional approver history',
          new Error(departmentContractsError.message),
          {
            code: departmentContractsError.code,
          }
        )
      }

      scopedContractIds = (departmentContracts ?? []).map((row) => row.id)
      if (scopedContractIds.length === 0) {
        return { items: [], total: 0 }
      }
    }

    let totalCount = 0
    if (!params.cursor) {
      let totalQuery = supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', params.tenantId)
        .eq('resource_type', 'contract')
        .in('action', ['contract.approver.approved', 'contract.approver.rejected'])

      if (!isAdminRole) {
        totalQuery = totalQuery.eq('user_id', params.employeeId)
      }

      if (scopedContractIds) {
        totalQuery = totalQuery.in('resource_id', scopedContractIds)
      }

      const totalResult = await totalQuery

      if (totalResult.error) {
        throw new DatabaseError(
          'Failed to count additional approver decision history',
          new Error(totalResult.error.message),
          {
            code: totalResult.error.code,
          }
        )
      }

      totalCount = totalResult.count ?? 0
    }

    let auditQuery = supabase
      .from('audit_logs')
      .select('resource_id, action, actor_email, note_text, created_at')
      .eq('tenant_id', params.tenantId)
      .eq('resource_type', 'contract')
      .in('action', ['contract.approver.approved', 'contract.approver.rejected'])
      .order('created_at', { ascending: false })
      .limit(params.limit + 1)

    if (decodedCursor) {
      auditQuery = auditQuery.lt('created_at', decodedCursor.createdAt)
    }

    if (scopedContractIds) {
      auditQuery = auditQuery.in('resource_id', scopedContractIds)
    }

    if (!isAdminRole) {
      auditQuery = auditQuery.eq('user_id', params.employeeId)
    }

    const { data: auditRows, error: auditError } = await auditQuery

    if (auditError) {
      throw new DatabaseError('Failed to load additional approver decision history', new Error(auditError.message), {
        code: auditError.code,
      })
    }

    const typedAuditRows = (auditRows ?? []) as Array<{
      resource_id: string
      action: string
      actor_email: string | null
      note_text: string | null
      created_at: string
    }>

    if (typedAuditRows.length === 0) {
      return { items: [], total: totalCount }
    }

    const hasNext = typedAuditRows.length > params.limit
    const paginatedRows = typedAuditRows.slice(0, params.limit)

    const contractIds = Array.from(new Set(paginatedRows.map((row) => row.resource_id)))
    const { data: contractRows, error: contractError } = await supabase
      .from('contracts')
      .select('id, title, status, department_id')
      .eq('tenant_id', params.tenantId)
      .is('deleted_at', null)
      .in('id', contractIds)

    if (contractError) {
      throw new DatabaseError(
        'Failed to load contracts for additional approver history',
        new Error(contractError.message),
        {
          code: contractError.code,
        }
      )
    }

    const typedContractRows = (contractRows ?? []) as Array<{
      id: string
      title: string
      status: string
      department_id: string | null
    }>

    const departmentIds = Array.from(
      new Set(typedContractRows.map((row) => row.department_id).filter((value): value is string => Boolean(value)))
    )

    const departmentNameMap = new Map<string, string>()
    if (departmentIds.length > 0) {
      const { data: departments, error: departmentsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('tenant_id', params.tenantId)
        .in('id', departmentIds)

      if (departmentsError) {
        throw new DatabaseError(
          'Failed to resolve department names for additional approver history',
          new Error(departmentsError.message),
          {
            code: departmentsError.code,
          }
        )
      }

      for (const department of (departments ?? []) as Array<{ id: string; name: string }>) {
        departmentNameMap.set(department.id, department.name)
      }
    }

    const contractMap = new Map<string, { title: string; status: ContractStatus; departmentId: string | null }>()
    for (const row of typedContractRows) {
      this.assertStatus(row.status)
      contractMap.set(row.id, {
        title: row.title,
        status: row.status as ContractStatus,
        departmentId: row.department_id,
      })
    }

    const additionalApproverContext = await this.getAdditionalApproverContractContextMap(
      params.tenantId,
      contractIds,
      params.employeeId
    )

    const items = paginatedRows
      .map((row) => {
        const contract = contractMap.get(row.resource_id)
        if (!contract) {
          return null
        }

        const context = additionalApproverContext.get(row.resource_id)
        return {
          contractId: row.resource_id,
          contractTitle: contract.title,
          contractStatus: contract.status,
          contractDisplayStatusLabel: resolveContractStatusDisplayLabel({
            status: contract.status,
            hasPendingAdditionalApprovers: context?.hasPendingAdditionalApprovers ?? false,
          }),
          departmentId: contract.departmentId,
          departmentName: contract.departmentId ? (departmentNameMap.get(contract.departmentId) ?? null) : null,
          actorEmail: row.actor_email,
          decision: row.action === 'contract.approver.rejected' ? 'REJECTED' : 'APPROVED',
          decidedAt: row.created_at,
          reason: row.action === 'contract.approver.rejected' ? row.note_text : null,
        } as AdditionalApproverDecisionHistoryItem
      })
      .filter((item): item is AdditionalApproverDecisionHistoryItem => Boolean(item))

    const nextCursor = hasNext ? this.encodeCursor(items[items.length - 1]?.decidedAt ?? '') : undefined

    return {
      items,
      nextCursor,
      total: totalCount ?? 0,
    }
  }

  async getDocuments(tenantId: string, contractId: string): Promise<ContractDocument[]> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('contract_documents')
      .select(
        'id, document_kind, counterparty_id, version_number, display_name, file_name, file_size_bytes, file_mime_type, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .in('document_kind', ['PRIMARY', 'COUNTERPARTY_SUPPORTING', 'EXECUTED_CONTRACT', 'AUDIT_CERTIFICATE'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      throw new DatabaseError('Failed to fetch contract documents', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as ContractDocumentEntity[]

    const counterpartyIds = rows.map((row) => row.counterparty_id).filter((value): value is string => Boolean(value))

    const counterpartyNameById = new Map<string, string>()
    if (counterpartyIds.length > 0) {
      const { data: counterparties, error: counterpartiesError } = await supabase
        .from('contract_counterparties')
        .select('id, counterparty_name')
        .eq('tenant_id', tenantId)
        .eq('contract_id', contractId)
        .in('id', counterpartyIds)
        .is('deleted_at', null)

      if (counterpartiesError) {
        throw new DatabaseError(
          'Failed to fetch contract counterparties for documents',
          new Error(counterpartiesError.message),
          {
            code: counterpartiesError.code,
          }
        )
      }

      for (const row of (counterparties ?? []) as Array<{ id: string; counterparty_name: string }>) {
        counterpartyNameById.set(row.id, row.counterparty_name)
      }
    }

    return rows.map((row) => ({
      id: row.id,
      documentKind: row.document_kind,
      counterpartyId: row.counterparty_id,
      counterpartyName: row.counterparty_id ? (counterpartyNameById.get(row.counterparty_id) ?? null) : null,
      versionNumber: row.version_number ?? undefined,
      displayName: row.display_name,
      fileName: row.file_name,
      fileSizeBytes: row.file_size_bytes,
      fileMimeType: row.file_mime_type,
      createdAt: row.created_at,
    }))
  }

  async getCounterparties(tenantId: string, contractId: string): Promise<ContractCounterparty[]> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_counterparties')
      .select('id, counterparty_name, sequence_order')
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .is('deleted_at', null)
      .order('sequence_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      if (this.isMissingRelationError(error, 'contract_counterparties')) {
        return []
      }

      throw new DatabaseError('Failed to fetch contract counterparties', new Error(error.message), {
        code: error.code,
      })
    }

    return ((data ?? []) as ContractCounterpartyEntity[]).map((row) => ({
      id: row.id,
      counterpartyName: row.counterparty_name,
      sequenceOrder: row.sequence_order,
    }))
  }

  private async resolveContractDetailMetadata(params: {
    tenantId: string
    contractTypeId: string
    departmentId: string
    uploadMode?: string | null
    contractStatus: string
    currentAssigneeEmail: string
  }): Promise<{
    contractTypeName?: string
    departmentName?: string
    departmentHodName?: string | null
    departmentHodEmail?: string | null
  }> {
    const supabase = createServiceSupabase()
    const normalizedUploadMode = (params.uploadMode ?? contractUploadModes.default).trim().toUpperCase()
    const shouldUseCurrentAssigneeAsHod =
      normalizedUploadMode === contractUploadModes.legalSendForSigning &&
      params.contractStatus === contractStatuses.hodPending

    const [{ data: contractType }, { data: department }, { data: hodMembers }] = await Promise.all([
      supabase
        .from('contract_types')
        .select('name')
        .eq('tenant_id', params.tenantId)
        .eq('id', params.contractTypeId)
        .is('deleted_at', null)
        .maybeSingle<{ name: string }>(),
      supabase
        .from('teams')
        .select('name')
        .eq('tenant_id', params.tenantId)
        .eq('id', params.departmentId)
        .is('deleted_at', null)
        .maybeSingle<{ name: string }>(),
      supabase
        .from('team_role_mappings')
        .select('email')
        .eq('tenant_id', params.tenantId)
        .eq('team_id', params.departmentId)
        .eq('role_type', 'HOD')
        .eq('active_flag', true)
        .is('deleted_at', null)
        .limit(1),
    ])

    let departmentHodName: string | null = null
    let departmentHodEmail: string | null = null

    const mappedDepartmentHodEmail = (hodMembers ?? [])[0]?.email
    const hodEmail = shouldUseCurrentAssigneeAsHod ? params.currentAssigneeEmail : mappedDepartmentHodEmail
    if (hodEmail) {
      const { data: hodUser } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('tenant_id', params.tenantId)
        .eq('email', hodEmail)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle<{ full_name: string | null; email: string }>()

      departmentHodName = hodUser?.full_name ?? null
      departmentHodEmail = hodUser?.email ?? hodEmail
    }

    return {
      contractTypeName: contractType?.name,
      departmentName: department?.name,
      departmentHodName,
      departmentHodEmail,
    }
  }

  async getTimeline(tenantId: string, contractId: string, limit: number): Promise<ContractTimelineEvent[]> {
    const supabase = createServiceSupabase()

    const { data, error } = await supabase
      .from('audit_logs')
      .select(
        'id, event_type, action, user_id, actor_email, actor_role, target_email, note_text, metadata, event_sequence, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('resource_type', 'contract')
      .eq('resource_id', contractId)
      .order('event_sequence', { ascending: false })
      .limit(limit)

    if (error) {
      throw new DatabaseError('Failed to fetch contract timeline', new Error(error.message), {
        code: error.code,
      })
    }

    return (data ?? []).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      action: event.action,
      userId: event.user_id,
      actorEmail: event.actor_email,
      actorRole: event.actor_role,
      targetEmail: event.target_email,
      noteText: event.note_text,
      metadata: (event.metadata ?? null) as Record<string, unknown> | null,
      eventSequence: event.event_sequence,
      createdAt: event.created_at,
    }))
  }

  async getAdditionalApprovers(tenantId: string, contractId: string): Promise<ContractAdditionalApprover[]> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_additional_approvers')
      .select('id, approver_employee_id, approver_email, sequence_order, status, approved_at')
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .is('deleted_at', null)
      .order('sequence_order', { ascending: true })

    if (error) {
      throw new DatabaseError('Failed to fetch additional approvers', new Error(error.message), {
        code: error.code,
      })
    }

    return ((data ?? []) as AdditionalApproverEntity[]).map((row) => ({
      id: row.id,
      approverEmployeeId: row.approver_employee_id,
      approverEmail: row.approver_email,
      sequenceOrder: row.sequence_order,
      status: row.status,
      approvedAt: row.approved_at,
    }))
  }

  async getLegalCollaborators(tenantId: string, contractId: string): Promise<ContractLegalCollaborator[]> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_legal_collaborators')
      .select('id, collaborator_employee_id, collaborator_email, created_at')
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      if (this.isMissingRelationError(error, 'contract_legal_collaborators')) {
        return []
      }

      throw new DatabaseError('Failed to fetch legal collaborators', new Error(error.message), {
        code: error.code,
      })
    }

    return ((data ?? []) as LegalCollaboratorEntity[]).map((row) => ({
      id: row.id,
      collaboratorEmployeeId: row.collaborator_employee_id,
      collaboratorEmail: row.collaborator_email,
      createdAt: row.created_at,
    }))
  }

  async listActiveTenantLegalMembers(tenantId: string): Promise<
    Array<{
      id: string
      email: string
      fullName?: string | null
    }>
  > {
    return this.resolveActiveTenantLegalMembers(tenantId)
  }

  async getSignatories(tenantId: string, contractId: string): Promise<ContractSignatory[]> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_signatories')
      .select(
        'id, signatory_email, recipient_type, routing_order, field_config, status, signed_at, zoho_sign_envelope_id, zoho_sign_recipient_id, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      if (this.isMissingRelationError(error, 'contract_signatories')) {
        return []
      }

      if (error.code === '42703') {
        const { data: legacyData, error: legacyError } = await supabase
          .from('contract_signatories')
          .select('id, signatory_email, status, signed_at, zoho_sign_envelope_id, zoho_sign_recipient_id, created_at')
          .eq('tenant_id', tenantId)
          .eq('contract_id', contractId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })

        if (legacyError) {
          throw new DatabaseError('Failed to fetch signatories', new Error(legacyError.message), {
            code: legacyError.code,
          })
        }

        return ((legacyData ?? []) as SignatoryEntity[]).map((row) => ({
          id: row.id,
          signatoryEmail: row.signatory_email,
          recipientType: 'EXTERNAL',
          routingOrder: 1,
          fieldConfig: [],
          status: row.status,
          signedAt: row.signed_at,
          zohoSignEnvelopeId: row.zoho_sign_envelope_id,
          zohoSignRecipientId: row.zoho_sign_recipient_id,
          createdAt: row.created_at,
        }))
      }

      throw new DatabaseError('Failed to fetch signatories', new Error(error.message), {
        code: error.code,
      })
    }

    return ((data ?? []) as SignatoryEntity[]).map((row) => ({
      id: row.id,
      signatoryEmail: row.signatory_email,
      recipientType: row.recipient_type,
      routingOrder: row.routing_order,
      fieldConfig: (row.field_config ?? []).map((field) => ({
        ...field,
        width: field.width ?? null,
        height: field.height ?? null,
      })),
      status: row.status,
      signedAt: row.signed_at,
      zohoSignEnvelopeId: row.zoho_sign_envelope_id,
      zohoSignRecipientId: row.zoho_sign_recipient_id,
      createdAt: row.created_at,
    }))
  }

  async isLegalCollaborator(tenantId: string, contractId: string, employeeId: string): Promise<boolean> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_legal_collaborators')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .eq('collaborator_employee_id', employeeId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (error) {
      if (this.isMissingRelationError(error, 'contract_legal_collaborators')) {
        return false
      }

      throw new DatabaseError('Failed to verify legal collaborator assignment', new Error(error.message), {
        code: error.code,
      })
    }

    return Boolean(data?.id)
  }

  async saveSigningPreparationDraft(params: {
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
    fields: Array<{
      fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
      pageNumber: number | null
      xPosition: number | null
      yPosition: number | null
      width?: number | null
      height?: number | null
      anchorString: string | null
      assignedSignerEmail: string
    }>
  }): Promise<{
    contractId: string
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
    fields: Array<{
      fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
      pageNumber: number | null
      xPosition: number | null
      yPosition: number | null
      width?: number | null
      height?: number | null
      anchorString: string | null
      assignedSignerEmail: string
    }>
    createdByEmployeeId: string
    updatedByEmployeeId: string
    createdAt: string
    updatedAt: string
  }> {
    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    const draftAllowedStatuses: ContractStatus[] = [contractStatuses.underReview, contractStatuses.completed]
    if (!draftAllowedStatuses.includes(contract.status)) {
      throw new BusinessRuleError(
        'SIGNING_PREPARATION_INVALID_STATUS',
        'Signing preparation drafts can only be saved in UNDER_REVIEW or COMPLETED'
      )
    }

    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_signing_preparation_drafts')
      .upsert(
        {
          tenant_id: params.tenantId,
          contract_id: params.contractId,
          recipients: params.recipients,
          fields: params.fields,
          created_by_employee_id: params.actorEmployeeId,
          updated_by_employee_id: params.actorEmployeeId,
        },
        { onConflict: 'tenant_id,contract_id' }
      )
      .select('contract_id, recipients, fields, created_by_employee_id, updated_by_employee_id, created_at, updated_at')
      .single<SigningPreparationDraftEntity>()

    if (error) {
      throw new DatabaseError('Failed to save signing preparation draft', new Error(error.message), {
        code: error.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: null,
        action: 'contract.signing_preparation_draft.saved',
        actor_email: null,
        actor_role: null,
        resource_type: 'contract',
        resource_id: params.contractId,
        metadata: {
          recipients_count: params.recipients.length,
          fields_count: params.fields.length,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write signing preparation draft audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }

    return {
      contractId: data.contract_id,
      recipients: data.recipients ?? [],
      fields: (data.fields ?? []).map((field) => ({
        ...field,
        width: field.width ?? null,
        height: field.height ?? null,
      })),
      createdByEmployeeId: data.created_by_employee_id,
      updatedByEmployeeId: data.updated_by_employee_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async getSigningPreparationDraft(params: { tenantId: string; contractId: string }): Promise<{
    contractId: string
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
    fields: Array<{
      fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
      pageNumber: number | null
      xPosition: number | null
      yPosition: number | null
      width?: number | null
      height?: number | null
      anchorString: string | null
      assignedSignerEmail: string
    }>
    createdByEmployeeId: string
    updatedByEmployeeId: string
    createdAt: string
    updatedAt: string
  } | null> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_signing_preparation_drafts')
      .select('contract_id, recipients, fields, created_by_employee_id, updated_by_employee_id, created_at, updated_at')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .maybeSingle<SigningPreparationDraftEntity>()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }

      if (this.isMissingRelationError(error)) {
        return null
      }

      throw new DatabaseError('Failed to fetch signing preparation draft', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data) {
      return null
    }

    return {
      contractId: data.contract_id,
      recipients: data.recipients ?? [],
      fields: (data.fields ?? []).map((field) => ({
        ...field,
        width: field.width ?? null,
        height: field.height ?? null,
      })),
      createdByEmployeeId: data.created_by_employee_id,
      updatedByEmployeeId: data.updated_by_employee_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async countPendingSignatoriesByContract(params: { tenantId: string; contractId: string }): Promise<number> {
    const supabase = createServiceSupabase()
    const { count, error } = await supabase
      .from('contract_signatories')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('status', contractSignatoryStatuses.pending)
      .is('deleted_at', null)

    if (error) {
      if (this.isMissingRelationError(error)) {
        return 0
      }

      throw new DatabaseError('Failed to count pending signatories', new Error(error.message), {
        code: error.code,
      })
    }

    return count ?? 0
  }

  async moveContractToInSignature(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    envelopeId: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.actorRole !== 'LEGAL_TEAM' && params.actorRole !== 'ADMIN') {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'Only legal team can send for signing')
    }

    const supabase = createServiceSupabase()
    const { data: currentContract, error: currentContractError } = await supabase
      .from('contracts')
      .select('id, tenant_id, status')
      .eq('id', params.contractId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; tenant_id: string; status: string }>()

    logger.warn('TEMP_DIAG moveContractToInSignature current contract snapshot', {
      contractId: params.contractId,
      requestedTenantId: params.tenantId,
      currentContractStatus: currentContract?.status ?? null,
      currentContractTenantId: currentContract?.tenant_id ?? null,
      currentContractLookupErrorCode: currentContractError?.code ?? null,
      currentContractLookupErrorMessage: currentContractError?.message ?? null,
    })

    const { data: contractUpdate, error: contractUpdateError } = await supabase
      .from('contracts')
      .update({
        status: contractStatuses.signing,
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', params.contractId)
      .in('status', [contractStatuses.underReview, contractStatuses.completed])
      .is('deleted_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()

    const rowsAffected = contractUpdate?.id ? 1 : 0
    logger.warn('TEMP_DIAG moveContractToInSignature update result', {
      contractId: params.contractId,
      requestedTenantId: params.tenantId,
      requiredFromStatuses: [contractStatuses.underReview, contractStatuses.completed],
      targetStatus: contractStatuses.signing,
      rowsAffected,
      contractUpdateErrorCode: contractUpdateError?.code ?? null,
      contractUpdateErrorMessage: contractUpdateError?.message ?? null,
    })

    if (contractUpdateError) {
      throw new DatabaseError('Failed to move contract to in-signature', new Error(contractUpdateError.message), {
        code: contractUpdateError.code,
      })
    }

    if (!contractUpdate?.id) {
      throw new BusinessRuleError(
        'SIGNING_PREPARATION_INVALID_STATUS',
        'Signing preparation send is only allowed in UNDER_REVIEW'
      )
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: contractAuditEvents.signatorySent,
        action: contractAuditActions.signatorySent,
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        metadata: {
          zoho_sign_envelope_id: params.envelopeId,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write in-signature audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async deleteSigningPreparationDraft(params: { tenantId: string; contractId: string }): Promise<void> {
    const supabase = createServiceSupabase()
    const { error } = await supabase
      .from('contract_signing_preparation_drafts')
      .delete()
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)

    if (error && !this.isMissingRelationError(error)) {
      throw new DatabaseError('Failed to delete signing preparation draft', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async canAccessContract(params: {
    tenantId: string
    actorEmployeeId: string
    actorRole?: string
    contract: ContractDetail
  }): Promise<boolean> {
    return this.canActorAccessContract(params)
  }

  async getAvailableActions(params: {
    tenantId: string
    contract: ContractDetail
    actorEmployeeId: string
    actorRole?: string
  }): Promise<ContractAllowedAction[]> {
    if (!params.actorRole) {
      return []
    }

    if (params.contract.status === contractStatuses.void) {
      return []
    }

    const actorRole = params.actorRole

    const transitions = await this.getTransitionsForStatus(params.tenantId, params.contract.status, actorRole)

    const actionsByName = new Map<ContractActionName, ContractAllowedAction>()
    for (const transition of transitions) {
      if (transition.to_status === params.contract.status) {
        continue
      }

      const actionName = transition.trigger_action as ContractActionName
      if (actionsByName.has(actionName)) {
        continue
      }

      const allowedAction = this.toAllowedAction(actionName)
      if (allowedAction) {
        actionsByName.set(actionName, allowedAction)
      }
    }

    const actionsFromGraph = Array.from(actionsByName.values())

    const pendingApproverCount = await this.getPendingApproverCount(params.tenantId, params.contract.id)
    const firstPendingApprover = await this.getFirstPendingApprover(params.tenantId, params.contract.id)
    const isAssignee = params.contract.currentAssigneeEmployeeId === params.actorEmployeeId

    const actions = actionsFromGraph.filter((item) => {
      const isAdditionalApproverAction = item.action === 'approver.approve' || item.action === 'approver.reject'

      if (
        params.actorRole !== 'ADMIN' &&
        params.actorRole !== 'LEGAL_TEAM' &&
        !isAdditionalApproverAction &&
        !isAssignee
      ) {
        const isHodAction =
          item.action === 'hod.approve' || item.action === 'hod.reject' || item.action === 'hod.bypass'
        if (!(params.actorRole === 'HOD' && isHodAction && params.contract.status === contractStatuses.hodPending)) {
          return false
        }
      }

      if (item.action === 'hod.bypass' && !bypassAllowedRoles.has(actorRole)) {
        return false
      }

      if ((item.action === 'legal.set.completed' || item.action === 'legal.approve') && pendingApproverCount > 0) {
        return false
      }

      return true
    })

    if (firstPendingApprover?.approverEmployeeId === params.actorEmployeeId) {
      actions.push(this.toAllowedAction('approver.approve') as ContractAllowedAction)
      actions.push(this.toAllowedAction('approver.reject') as ContractAllowedAction)
    }

    return actions
  }

  async applyAction(params: {
    tenantId: string
    contractId: string
    action: ContractActionName
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    noteText?: string
  }): Promise<ContractDetail> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    const contract = await this.getById(params.tenantId, params.contractId)

    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    if (contract.status === contractStatuses.void) {
      throw new BusinessRuleError('CONTRACT_TERMINAL_STATUS', 'Void Documents is terminal and cannot be changed')
    }

    const effectiveAction: ContractActionName =
      params.action === 'legal.approve'
        ? 'legal.set.completed'
        : params.action === 'legal.query'
          ? 'legal.set.on_hold'
          : params.action

    const canAccess = await this.canActorAccessContract({
      tenantId: params.tenantId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      contract,
    })

    if (!canAccess) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'You do not have access to this contract')
    }

    const isAssignee = contract.currentAssigneeEmployeeId === params.actorEmployeeId
    const isHodAction =
      effectiveAction === 'hod.approve' || effectiveAction === 'hod.reject' || effectiveAction === 'hod.bypass'
    const allowMappedHodAction =
      params.actorRole === 'HOD' &&
      isHodAction &&
      contract.status === contractStatuses.hodPending &&
      contract.uploadMode !== contractUploadModes.legalSendForSigning

    const isAdditionalApproverAction = effectiveAction === 'approver.approve' || effectiveAction === 'approver.reject'

    if (
      !isAdditionalApproverAction &&
      params.actorRole !== 'ADMIN' &&
      params.actorRole !== 'LEGAL_TEAM' &&
      !isAssignee &&
      !allowMappedHodAction
    ) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'Only the current assignee can perform this action')
    }

    if (effectiveAction === 'approver.approve') {
      await this.applyAdditionalApproverApproval({
        tenantId: params.tenantId,
        contract,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
      })

      const unchanged = await this.getById(params.tenantId, params.contractId)
      if (!unchanged) {
        throw new DatabaseError('Failed to load contract after approver action')
      }
      return unchanged
    }

    if (effectiveAction === 'approver.reject') {
      if (!params.noteText?.trim()) {
        throw new BusinessRuleError('REMARK_REQUIRED', 'Remarks are mandatory for this action')
      }

      await this.applyAdditionalApproverRejection({
        tenantId: params.tenantId,
        contract,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
        noteText: params.noteText,
      })

      const unchanged = await this.getById(params.tenantId, params.contractId)
      if (!unchanged) {
        throw new DatabaseError('Failed to load contract after approver rejection action')
      }
      return unchanged
    }

    if (remarkRequiredActions.has(effectiveAction) && !params.noteText?.trim()) {
      throw new BusinessRuleError('REMARK_REQUIRED', 'Remarks are mandatory for this action')
    }

    if (effectiveAction === 'hod.bypass' && !bypassAllowedRoles.has(params.actorRole)) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'Only legal team or admin can bypass HOD approval')
    }

    const transition = await this.resolveTransition(params.tenantId, contract.status, effectiveAction)

    // TODO(notification-workflow): add explicit notifications for currently silent transitions such as
    // legal.void and legal.set.offline_execution once Brevo templates and delivery rules are finalized.

    if (!transition.allowed_roles.includes(params.actorRole)) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'You are not allowed to perform this action')
    }

    const pendingApproverCount = await this.getPendingApproverCount(params.tenantId, params.contractId)
    if (effectiveAction === 'legal.set.completed' && pendingApproverCount > 0) {
      throw new BusinessRuleError('APPROVERS_PENDING', 'All additional approvers must approve before final approval')
    }

    const supabase = createServiceSupabase()

    let nextStatus = transition.to_status as ContractStatus
    let assigneeEmployeeId = contract.currentAssigneeEmployeeId
    let assigneeEmail = contract.currentAssigneeEmail
    let hodApprovedAt = contract.hodApprovedAt ?? null
    let tatDeadlineAt = contract.tatDeadlineAt ?? null

    if (effectiveAction === 'hod.approve' || effectiveAction === 'hod.bypass') {
      const legalAssignee = await this.getLegalAssignee(params.tenantId)
      assigneeEmployeeId = legalAssignee.id
      assigneeEmail = legalAssignee.email
      nextStatus = contractStatuses.underReview

      const nowIso = new Date().toISOString()
      const todayUtc = nowIso.slice(0, 10)
      const { data: deadlineDate, error: deadlineError } = await supabase.rpc('business_day_add', {
        start_date: todayUtc,
        days: contractRepositoryTatPolicy.businessDays,
      })

      if (deadlineError || !deadlineDate) {
        throw new DatabaseError(
          'Failed to compute TAT deadline for HOD transition',
          new Error(deadlineError?.message),
          {
            code: deadlineError?.code,
          }
        )
      }

      hodApprovedAt = nowIso
      tatDeadlineAt = `${deadlineDate}T23:59:59.000Z`
    } else if (effectiveAction === 'legal.query.reroute') {
      const hodAssignee = await this.getTeamHodAssignee(params.tenantId, contract.departmentId)
      assigneeEmployeeId = hodAssignee.id
      assigneeEmail = hodAssignee.email
      nextStatus = contractStatuses.hodPending
    }

    const updatePayload: {
      status: ContractStatus
      current_assignee_employee_id: string
      current_assignee_email: string
      row_version: number
      void_reason?: string | null
      hod_approved_at?: string | null
      tat_deadline_at?: string | null
    } = {
      status: nextStatus,
      current_assignee_employee_id: assigneeEmployeeId,
      current_assignee_email: assigneeEmail,
      row_version: contract.rowVersion + 1,
    }

    if (effectiveAction === 'hod.approve' || effectiveAction === 'hod.bypass') {
      updatePayload.hod_approved_at = hodApprovedAt
      updatePayload.tat_deadline_at = tatDeadlineAt
    }

    if (effectiveAction === 'legal.void') {
      updatePayload.void_reason = params.noteText?.trim() ?? null
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('contracts')
      .update(updatePayload)
      .eq('id', contract.id)
      .eq('tenant_id', params.tenantId)
      .eq('row_version', contract.rowVersion)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (updateError) {
      throw new DatabaseError('Failed to apply contract action', new Error(updateError.message), {
        code: updateError.code,
      })
    }

    if (!updatedRow) {
      throw new ConflictError('Contract was modified by another request. Please refresh and retry.', {
        contractId: params.contractId,
        tenantId: params.tenantId,
        action: params.action,
        expectedRowVersion: contract.rowVersion,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: this.toAuditEventType(effectiveAction),
        action: `contract.${effectiveAction}`,
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: assigneeEmail,
        note_text: params.noteText?.trim() || null,
        metadata: {
          from_status: contract.status,
          to_status: nextStatus,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write contract audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }

    const updated = await this.getById(params.tenantId, params.contractId)

    if (!updated) {
      throw new DatabaseError('Failed to load contract after action update')
    }

    return updated
  }

  async addAdditionalApprover(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    approverEmail: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.actorRole !== 'LEGAL_TEAM' && params.actorRole !== 'ADMIN') {
      throw new AuthorizationError('CONTRACT_APPROVER_FORBIDDEN', 'Only legal team can assign additional approvers')
    }

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    if (params.actorRole !== contractWorkflowRoles.legalTeam && contract.status !== contractStatuses.underReview) {
      throw new BusinessRuleError(
        'APPROVER_ASSIGN_INVALID_STATUS',
        'Additional approvers can only be assigned in UNDER_REVIEW for non-legal-team roles'
      )
    }

    const supabase = createServiceSupabase()

    const { data: approverUser, error: approverError } = await supabase
      .from('users')
      .select('id, email')
      .eq('tenant_id', params.tenantId)
      .eq('email', params.approverEmail)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single<{ id: string; email: string }>()

    if (approverError || !approverUser) {
      throw new BusinessRuleError('APPROVER_NOT_FOUND', 'Approver must be an active tenant user')
    }

    const existingApprovers = await this.getAdditionalApprovers(params.tenantId, params.contractId)
    if (existingApprovers.some((item) => item.approverEmployeeId === approverUser.id && item.status === 'PENDING')) {
      throw new BusinessRuleError('APPROVER_ALREADY_ASSIGNED', 'Approver is already pending on this contract')
    }

    const nextSequence =
      existingApprovers.length > 0 ? Math.max(...existingApprovers.map((item) => item.sequenceOrder)) + 1 : 1

    const { error: insertError } = await supabase.from('contract_additional_approvers').insert([
      {
        tenant_id: params.tenantId,
        contract_id: params.contractId,
        approver_employee_id: approverUser.id,
        approver_email: approverUser.email,
        sequence_order: nextSequence,
        status: 'PENDING',
        created_by_employee_id: params.actorEmployeeId,
      },
    ])

    if (insertError) {
      throw new DatabaseError('Failed to add additional approver', new Error(insertError.message), {
        code: insertError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_APPROVER_ADDED',
        action: 'contract.approver.added',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: approverUser.email,
        metadata: {
          sequence_order: nextSequence,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write approver audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async bypassAdditionalApprover(params: {
    tenantId: string
    contractId: string
    approverId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    reason: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.actorRole !== contractWorkflowRoles.legalTeam && params.actorRole !== contractWorkflowRoles.admin) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'Only LEGAL_TEAM or ADMIN can bypass approvals')
    }

    if (!params.reason?.trim()) {
      throw new BusinessRuleError('REMARK_REQUIRED', 'Remarks are mandatory for this action')
    }

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    const canAccess = await this.canActorAccessContract({
      tenantId: params.tenantId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      contract,
    })

    if (!canAccess) {
      throw new AuthorizationError('CONTRACT_ACTION_FORBIDDEN', 'You do not have access to this contract')
    }

    if (contract.status === contractStatuses.void) {
      throw new BusinessRuleError('CONTRACT_TERMINAL_STATUS', 'Void Documents is terminal and cannot be changed')
    }

    const supabase = createServiceSupabase()

    const { data: approver, error: approverError } = await supabase
      .from('contract_additional_approvers')
      .select('id, approver_email, sequence_order, status')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('id', params.approverId)
      .is('deleted_at', null)
      .maybeSingle<{
        id: string
        approver_email: string
        sequence_order: number
        status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BYPASSED'
      }>()

    if (approverError) {
      throw new DatabaseError('Failed to fetch additional approver for bypass', new Error(approverError.message), {
        code: approverError.code,
      })
    }

    if (!approver) {
      throw new BusinessRuleError('APPROVER_NOT_FOUND', 'Additional approver not found for this contract')
    }

    if (approver.status !== 'PENDING') {
      throw new BusinessRuleError('APPROVER_ACTION_INVALID_STATUS', 'Only pending approvals can be bypassed')
    }

    const { data: bypassedApprover, error: bypassError } = await supabase
      .from('contract_additional_approvers')
      .update({
        status: 'BYPASSED',
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('id', params.approverId)
      .eq('status', 'PENDING')
      .is('deleted_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (bypassError) {
      throw new DatabaseError('Failed to bypass additional approver', new Error(bypassError.message), {
        code: bypassError.code,
      })
    }

    if (!bypassedApprover) {
      throw new ConflictError('Additional approver action was already processed. Please refresh and retry.', {
        contractId: params.contractId,
        tenantId: params.tenantId,
        action: 'BYPASS_APPROVAL',
        approverId: params.approverId,
      })
    }

    const legalAssignee = await this.getLegalAssignee(params.tenantId)

    const { data: updatedContract, error: contractUpdateError } = await supabase
      .from('contracts')
      .update({
        status: contractStatuses.underReview,
        current_assignee_employee_id: legalAssignee.id,
        current_assignee_email: legalAssignee.email,
        row_version: contract.rowVersion + 1,
      })
      .eq('id', contract.id)
      .eq('tenant_id', params.tenantId)
      .eq('row_version', contract.rowVersion)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (contractUpdateError) {
      throw new DatabaseError(
        'Failed to update contract after approval bypass',
        new Error(contractUpdateError.message),
        {
          code: contractUpdateError.code,
        }
      )
    }

    if (!updatedContract) {
      throw new ConflictError('Contract was modified by another request. Please refresh and retry.', {
        contractId: params.contractId,
        tenantId: params.tenantId,
        action: 'BYPASS_APPROVAL',
        expectedRowVersion: contract.rowVersion,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: contractAuditEvents.approverBypassed,
        action: contractAuditActions.approverBypassed,
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: approver.approver_email,
        note_text: params.reason.trim(),
        metadata: {
          approver_id: approver.id,
          sequence_order: approver.sequence_order,
          from_status: contract.status,
          to_status: contractStatuses.underReview,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write approval bypass audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async setLegalOwnerByEmail(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    ownerEmail: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    this.assertLegalAssignmentEditable(contract.status)
    this.assertLegalAssignmentActorRole(params.actorRole)

    const ownerUser = await this.resolveActiveTenantLegalUserByEmail(params.tenantId, params.ownerEmail)
    const supabase = createServiceSupabase()

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        current_assignee_employee_id: ownerUser.id,
        current_assignee_email: ownerUser.email,
        row_version: contract.rowVersion + 1,
      })
      .eq('id', contract.id)
      .eq('tenant_id', params.tenantId)
      .eq('row_version', contract.rowVersion)

    if (updateError) {
      throw new DatabaseError('Failed to update legal owner', new Error(updateError.message), {
        code: updateError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_ASSIGNEE_SET',
        action: 'contract.legal.owner.set',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: ownerUser.email,
        metadata: {
          previous_owner_email: contract.currentAssigneeEmail,
          next_owner_email: ownerUser.email,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write legal owner audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async updateLegalMetadata(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    metadata: ContractLegalMetadata
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.actorRole !== contractWorkflowRoles.legalTeam) {
      throw new AuthorizationError('CONTRACT_LEGAL_METADATA_FORBIDDEN', 'Only LEGAL_TEAM can update legal metadata')
    }

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    const supabase = createServiceSupabase()

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        legal_effective_date: params.metadata.effectiveDate,
        legal_termination_date: params.metadata.terminationDate,
        legal_notice_period: params.metadata.noticePeriod,
        legal_auto_renewal: params.metadata.autoRenewal,
        row_version: contract.rowVersion + 1,
      })
      .eq('id', contract.id)
      .eq('tenant_id', params.tenantId)
      .eq('row_version', contract.rowVersion)

    if (updateError) {
      throw new DatabaseError('Failed to update legal metadata', new Error(updateError.message), {
        code: updateError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_TRANSITIONED',
        action: 'contract.legal.metadata.updated',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        metadata: {
          effective_date: params.metadata.effectiveDate,
          termination_date: params.metadata.terminationDate,
          notice_period: params.metadata.noticePeriod,
          auto_renewal: params.metadata.autoRenewal,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write legal metadata audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async addLegalCollaboratorByEmail(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    collaboratorEmail: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    this.assertLegalAssignmentEditable(contract.status)
    this.assertLegalAssignmentActorRole(params.actorRole)

    const collaboratorUser = await this.resolveActiveTenantLegalUserByEmail(params.tenantId, params.collaboratorEmail)
    const supabase = createServiceSupabase()

    const { data: existing, error: existingError } = await supabase
      .from('contract_legal_collaborators')
      .select('id, deleted_at')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('collaborator_employee_id', collaboratorUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; deleted_at: string | null }>()

    if (existingError) {
      if (this.isMissingRelationError(existingError, 'contract_legal_collaborators')) {
        throw new BusinessRuleError(
          'LEGAL_ASSIGNMENT_UNAVAILABLE',
          'Legal collaborator assignment is unavailable until database migration is applied'
        )
      }

      throw new DatabaseError('Failed to verify legal collaborator assignment', new Error(existingError.message), {
        code: existingError.code,
      })
    }

    if (existing?.id && !existing.deleted_at) {
      throw new BusinessRuleError('LEGAL_COLLABORATOR_ALREADY_ASSIGNED', 'Collaborator is already assigned')
    }

    if (existing?.id && existing.deleted_at) {
      const { error: restoreError } = await supabase
        .from('contract_legal_collaborators')
        .update({
          collaborator_email: collaboratorUser.email,
          created_by_employee_id: params.actorEmployeeId,
          deleted_at: null,
        })
        .eq('id', existing.id)
        .eq('tenant_id', params.tenantId)

      if (restoreError) {
        throw new DatabaseError('Failed to restore legal collaborator assignment', new Error(restoreError.message), {
          code: restoreError.code,
        })
      }
    } else {
      const { error: insertError } = await supabase.from('contract_legal_collaborators').insert([
        {
          tenant_id: params.tenantId,
          contract_id: params.contractId,
          collaborator_employee_id: collaboratorUser.id,
          collaborator_email: collaboratorUser.email,
          created_by_employee_id: params.actorEmployeeId,
        },
      ])

      if (insertError) {
        throw new DatabaseError('Failed to add legal collaborator', new Error(insertError.message), {
          code: insertError.code,
        })
      }
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_COLLABORATOR_ADDED',
        action: 'contract.legal.collaborator.added',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: collaboratorUser.email,
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write collaborator audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async removeLegalCollaboratorByEmail(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    collaboratorEmail: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    this.assertLegalAssignmentEditable(contract.status)
    this.assertLegalAssignmentActorRole(params.actorRole)

    const collaboratorUser = await this.resolveActiveTenantLegalUserByEmail(params.tenantId, params.collaboratorEmail)
    const supabase = createServiceSupabase()
    const { data: activeAssignment, error: assignmentError } = await supabase
      .from('contract_legal_collaborators')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('collaborator_employee_id', collaboratorUser.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (assignmentError) {
      if (this.isMissingRelationError(assignmentError, 'contract_legal_collaborators')) {
        throw new BusinessRuleError(
          'LEGAL_ASSIGNMENT_UNAVAILABLE',
          'Legal collaborator assignment is unavailable until database migration is applied'
        )
      }

      throw new DatabaseError('Failed to load legal collaborator assignment', new Error(assignmentError.message), {
        code: assignmentError.code,
      })
    }

    if (!activeAssignment?.id) {
      throw new BusinessRuleError('LEGAL_COLLABORATOR_NOT_FOUND', 'Collaborator is not assigned to this contract')
    }

    const { error: deleteError } = await supabase
      .from('contract_legal_collaborators')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', activeAssignment.id)
      .eq('tenant_id', params.tenantId)

    if (deleteError) {
      throw new DatabaseError('Failed to remove legal collaborator', new Error(deleteError.message), {
        code: deleteError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_COLLABORATOR_REMOVED',
        action: 'contract.legal.collaborator.removed',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: collaboratorUser.email,
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write collaborator removal audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async addSignatory(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    signatoryEmail: string
    recipientType: 'INTERNAL' | 'EXTERNAL'
    routingOrder: number
    fieldConfig: Array<{
      fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
      pageNumber: number | null
      xPosition: number | null
      yPosition: number | null
      width?: number | null
      height?: number | null
      anchorString: string | null
      assignedSignerEmail: string
    }>
    zohoSignEnvelopeId: string
    zohoSignRecipientId: string
    envelopeSourceDocumentId: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.actorRole !== 'LEGAL_TEAM' && params.actorRole !== 'ADMIN') {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'Only legal team can assign signatories')
    }

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    const assignAllowedStatuses: ContractStatus[] = [contractStatuses.underReview, contractStatuses.completed]
    if (!assignAllowedStatuses.includes(contract.status)) {
      throw new BusinessRuleError(
        'SIGNATORY_ASSIGN_INVALID_STATUS',
        'Signatories can only be assigned in UNDER_REVIEW or COMPLETED'
      )
    }

    const existingSignatories = await this.getSignatories(params.tenantId, params.contractId)
    if (
      existingSignatories.some(
        (item) => item.signatoryEmail === params.signatoryEmail && item.status === contractSignatoryStatuses.pending
      )
    ) {
      throw new BusinessRuleError('SIGNATORY_ALREADY_ASSIGNED', 'Signatory is already pending on this contract')
    }

    const supabase = createServiceSupabase()
    const { error: insertError } = await supabase.from('contract_signatories').insert([
      {
        tenant_id: params.tenantId,
        contract_id: params.contractId,
        signatory_email: params.signatoryEmail,
        recipient_type: params.recipientType,
        routing_order: params.routingOrder,
        field_config: params.fieldConfig,
        status: contractSignatoryStatuses.pending,
        zoho_sign_envelope_id: params.zohoSignEnvelopeId,
        zoho_sign_recipient_id: params.zohoSignRecipientId,
        envelope_source_document_id: params.envelopeSourceDocumentId,
        created_by_employee_id: params.actorEmployeeId,
      },
    ])

    if (insertError) {
      throw new DatabaseError('Failed to add signatory', new Error(insertError.message), {
        code: insertError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: contractAuditEvents.signatoryAdded,
        action: contractAuditActions.signatoryAdded,
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: params.signatoryEmail,
        metadata: {
          zoho_sign_envelope_id: params.zohoSignEnvelopeId,
          zoho_sign_recipient_id: params.zohoSignRecipientId,
          envelope_source_document_id: params.envelopeSourceDocumentId,
          recipient_type: params.recipientType,
          routing_order: params.routingOrder,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write signatory audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async resolveEnvelopeContext(params: { envelopeId: string; recipientEmail?: string }): Promise<{
    tenantId: string
    contractId: string
    signatoryEmail: string
    signatoryStatus: 'PENDING' | 'SIGNED'
    contractStatus: ContractStatus
    recipientType: 'INTERNAL' | 'EXTERNAL'
    routingOrder: number
  } | null> {
    const supabase = createServiceSupabase()
    let query = supabase
      .from('contract_signatories')
      .select('tenant_id, contract_id, signatory_email, status, recipient_type, routing_order')
      .eq('zoho_sign_envelope_id', params.envelopeId)
      .is('deleted_at', null)
      .limit(1)

    if (params.recipientEmail) {
      query = query.eq('signatory_email', params.recipientEmail.trim().toLowerCase())
    }

    const { data, error } = await query.maybeSingle<{
      tenant_id: string
      contract_id: string
      signatory_email: string
      status: 'PENDING' | 'SIGNED'
      recipient_type: 'INTERNAL' | 'EXTERNAL'
      routing_order: number
    }>()

    if (error) {
      throw new DatabaseError('Failed to resolve envelope context', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data) {
      return null
    }

    const { data: contractRow, error: contractError } = await supabase
      .from('contracts')
      .select('status')
      .eq('tenant_id', data.tenant_id)
      .eq('id', data.contract_id)
      .is('deleted_at', null)
      .maybeSingle<{ status: ContractStatus }>()

    if (contractError) {
      throw new DatabaseError(
        'Failed to resolve contract status for envelope context',
        new Error(contractError.message),
        {
          code: contractError.code,
        }
      )
    }

    if (!contractRow) {
      return null
    }

    return {
      tenantId: data.tenant_id,
      contractId: data.contract_id,
      signatoryEmail: data.signatory_email,
      signatoryStatus: data.status,
      contractStatus: contractRow.status,
      recipientType: data.recipient_type,
      routingOrder: data.routing_order,
    }
  }

  async recordZohoSignWebhookEvent(params: {
    tenantId: string
    contractId: string
    envelopeId: string
    recipientEmail?: string
    eventType: string
    eventKey: string
    payload: Record<string, unknown>
    signerIp?: string
  }): Promise<{ inserted: boolean }> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('zoho_sign_webhook_events')
      .insert({
        tenant_id: params.tenantId,
        contract_id: params.contractId,
        envelope_id: params.envelopeId,
        recipient_email: params.recipientEmail ?? null,
        event_type: params.eventType,
        event_key: params.eventKey,
        signer_ip: params.signerIp ?? null,
        payload: params.payload,
      })
      .select('id')
      .maybeSingle<{ id: string }>()

    if (error) {
      if (error.code === '23505') {
        return { inserted: false }
      }

      throw new DatabaseError('Failed to record Zoho Sign webhook event', new Error(error.message), {
        code: error.code,
      })
    }

    return { inserted: Boolean(data?.id) }
  }

  async addSignatoryWebhookAuditEvent(params: {
    tenantId: string
    contractId: string
    eventType: string
    action: string
    recipientEmail?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const supabase = createServiceSupabase()
    const { error } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: 'SYSTEM',
        event_type: params.eventType,
        action: params.action,
        actor_email: null,
        actor_role: 'SYSTEM',
        resource_type: 'contract',
        resource_id: params.contractId,
        target_email: params.recipientEmail ?? null,
        metadata: params.metadata ?? null,
      },
    ])

    if (error) {
      throw new DatabaseError('Failed to append signatory webhook audit event', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async markSignatoryAsSigned(params: {
    tenantId: string
    envelopeId: string
    recipientEmail?: string
    signedAt?: string
  }): Promise<void> {
    const supabase = createServiceSupabase()
    let updateQuery = supabase
      .from('contract_signatories')
      .update({
        status: contractSignatoryStatuses.signed,
        signed_at: params.signedAt ?? new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .eq('zoho_sign_envelope_id', params.envelopeId)
      .eq('status', contractSignatoryStatuses.pending)
      .is('deleted_at', null)

    if (params.recipientEmail) {
      updateQuery = updateQuery.eq('signatory_email', params.recipientEmail)
    }

    const { data: updatedSignatories, error: updateError } = await updateQuery
      .select('id, contract_id, signatory_email')
      .limit(1)

    if (updateError) {
      throw new DatabaseError('Failed to mark signatory as signed', new Error(updateError.message), {
        code: updateError.code,
      })
    }

    const updated = (updatedSignatories ?? [])[0]
    if (!updated) {
      return
    }

    const pendingCount = await this.countPendingSignatoriesByContract({
      tenantId: params.tenantId,
      contractId: updated.contract_id,
    })

    if (pendingCount === 0) {
      const { data: transitionedContract, error: transitionError } = await supabase
        .from('contracts')
        .update({
          status: contractStatuses.executed,
        })
        .eq('tenant_id', params.tenantId)
        .eq('id', updated.contract_id)
        .in('status', [contractStatuses.signing, contractStatuses.pendingExternal])
        .is('deleted_at', null)
        .select('id')
        .maybeSingle<{ id: string }>()

      if (transitionError) {
        throw new DatabaseError('Failed to transition contract to executed', new Error(transitionError.message), {
          code: transitionError.code,
        })
      }

      if (transitionedContract?.id) {
        const { error: transitionAuditError } = await supabase.from('audit_logs').insert([
          {
            tenant_id: params.tenantId,
            user_id: 'SYSTEM',
            event_type: 'CONTRACT_TRANSITIONED',
            action: 'contract.system.mark_executed',
            actor_email: null,
            actor_role: 'SYSTEM',
            resource_type: 'contract',
            resource_id: updated.contract_id,
            metadata: {
              from_status: contractStatuses.signing,
              from_status_fallback: contractStatuses.pendingExternal,
              to_status: contractStatuses.executed,
              zoho_sign_envelope_id: params.envelopeId,
            },
          },
        ])

        if (transitionAuditError) {
          throw new DatabaseError(
            'Failed to write executed transition audit event',
            new Error(transitionAuditError.message),
            {
              code: transitionAuditError.code,
            }
          )
        }
      }
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: 'SYSTEM',
        event_type: contractAuditEvents.signatorySigned,
        action: contractAuditActions.signatorySigned,
        actor_email: null,
        actor_role: 'SYSTEM',
        resource_type: 'contract',
        resource_id: updated.contract_id,
        target_email: updated.signatory_email,
        metadata: {
          signatory_id: updated.id,
          zoho_sign_envelope_id: params.envelopeId,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write signatory signed audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  async listFailedNotificationDeliveries(params: {
    tenantId: string
    cursor?: string
    limit: number
    contractId?: string
  }): Promise<{ items: ContractNotificationFailure[]; nextCursor?: string; total: number }> {
    const supabase = createServiceSupabase()
    const decodedCursor = this.decodeCursor(params.cursor)

    let query = supabase
      .from('contract_notification_deliveries')
      .select(
        'id, contract_id, envelope_id, recipient_email, notification_type, template_id, provider_name, provider_message_id, retry_count, max_retries, next_retry_at, last_error, created_at, updated_at'
      )
      .eq('tenant_id', params.tenantId)
      .eq('status', contractNotificationStatuses.failed)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1)

    if (params.contractId) {
      query = query.eq('contract_id', params.contractId)
    }

    if (decodedCursor) {
      query = query.lt('created_at', decodedCursor.createdAt)
    }

    const { data, error } = await query

    if (error) {
      throw new DatabaseError('Failed to list failed notification deliveries', new Error(error.message), {
        code: error.code,
      })
    }

    let totalQuery = supabase
      .from('contract_notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', params.tenantId)
      .eq('status', contractNotificationStatuses.failed)

    if (params.contractId) {
      totalQuery = totalQuery.eq('contract_id', params.contractId)
    }

    const { count: totalCount, error: totalError } = await totalQuery

    if (totalError) {
      throw new DatabaseError('Failed to count failed notification deliveries', new Error(totalError.message), {
        code: totalError.code,
      })
    }

    const rows = (data ?? []) as Array<{
      id: string
      contract_id: string
      envelope_id: string | null
      recipient_email: string
      notification_type: 'SIGNATORY_LINK' | 'SIGNING_COMPLETED'
      template_id: number
      provider_name: string
      provider_message_id: string | null
      retry_count: number
      max_retries: number
      next_retry_at: string | null
      last_error: string | null
      created_at: string
      updated_at: string
    }>

    const hasNext = rows.length > params.limit
    const items = rows.slice(0, params.limit).map((row) => ({
      id: row.id,
      contractId: row.contract_id,
      envelopeId: row.envelope_id,
      recipientEmail: row.recipient_email,
      notificationType: row.notification_type,
      templateId: row.template_id,
      providerName: row.provider_name,
      providerMessageId: row.provider_message_id,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      nextRetryAt: row.next_retry_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    const nextCursor = hasNext ? this.encodeCursor(items[items.length - 1]?.createdAt ?? '') : undefined

    return {
      items,
      nextCursor,
      total: totalCount ?? 0,
    }
  }

  async getEnvelopeNotificationProfile(params: { tenantId: string; contractId: string; envelopeId: string }): Promise<{
    contractTitle: string
    recipientEmails: string[]
  } | null> {
    const supabase = createServiceSupabase()

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('title, uploaded_by_email')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.contractId)
      .is('deleted_at', null)
      .maybeSingle<{ title: string; uploaded_by_email: string }>()

    if (contractError) {
      throw new DatabaseError('Failed to load contract notification profile', new Error(contractError.message), {
        code: contractError.code,
      })
    }

    if (!contract) {
      return null
    }

    const { data: recipients, error: recipientsError } = await supabase
      .from('contract_signatories')
      .select('signatory_email')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('zoho_sign_envelope_id', params.envelopeId)
      .is('deleted_at', null)

    if (recipientsError) {
      throw new DatabaseError('Failed to load envelope notification recipients', new Error(recipientsError.message), {
        code: recipientsError.code,
      })
    }

    const normalizedEmails = new Set<string>([contract.uploaded_by_email.trim().toLowerCase()])
    for (const recipient of (recipients ?? []) as Array<{ signatory_email: string }>) {
      normalizedEmails.add(recipient.signatory_email.trim().toLowerCase())
    }

    return {
      contractTitle: contract.title,
      recipientEmails: Array.from(normalizedEmails),
    }
  }

  async getLatestNotificationDelivery(params: {
    tenantId: string
    contractId: string
    envelopeId?: string
    recipientEmail: string
    notificationType:
      | 'SIGNATORY_LINK'
      | 'SIGNING_COMPLETED'
      | 'HOD_APPROVAL_REQUESTED'
      | 'APPROVAL_REMINDER'
      | 'ADDITIONAL_APPROVER_ADDED'
  }): Promise<ContractNotificationDeliverySummary | null> {
    const supabase = createServiceSupabase()

    let query = supabase
      .from('contract_notification_deliveries')
      .select('id, created_at, status')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('recipient_email', params.recipientEmail.trim().toLowerCase())
      .eq('notification_type', params.notificationType)

    if (params.envelopeId?.trim()) {
      query = query.eq('envelope_id', params.envelopeId.trim())
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; created_at: string; status: 'SENT' | 'FAILED' }>()

    if (error) {
      throw new DatabaseError('Failed to load latest contract notification delivery', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data) {
      return null
    }

    return {
      id: data.id,
      createdAt: data.created_at,
      status: data.status,
    }
  }

  async recordContractNotificationDelivery(params: {
    tenantId: string
    contractId: string
    envelopeId?: string
    recipientEmail: string
    channel: 'EMAIL'
    notificationType: 'SIGNATORY_LINK' | 'SIGNING_COMPLETED'
    templateId: number
    providerName: string
    providerMessageId?: string
    status: 'SENT' | 'FAILED'
    retryCount: number
    maxRetries: number
    nextRetryAt?: string
    lastError?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    if (
      !Object.values(contractNotificationChannels).includes(params.channel) ||
      !Object.values(contractNotificationTypes).includes(params.notificationType) ||
      !Object.values(contractNotificationStatuses).includes(params.status)
    ) {
      throw new BusinessRuleError('NOTIFICATION_DELIVERY_INVALID', 'Invalid notification delivery payload')
    }

    const supabase = createServiceSupabase()
    const { error } = await supabase.from('contract_notification_deliveries').insert([
      {
        tenant_id: params.tenantId,
        contract_id: params.contractId,
        envelope_id: params.envelopeId ?? null,
        recipient_email: params.recipientEmail.trim().toLowerCase(),
        channel: params.channel,
        notification_type: params.notificationType,
        template_id: params.templateId,
        provider_name: params.providerName,
        provider_message_id: params.providerMessageId ?? null,
        status: params.status,
        retry_count: params.retryCount,
        max_retries: params.maxRetries,
        next_retry_at: params.nextRetryAt ?? null,
        last_error: params.lastError ?? null,
        metadata: params.metadata ?? null,
      },
    ])

    if (error) {
      throw new DatabaseError('Failed to record contract notification delivery', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async addContractNote(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    noteText: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    const canAccess = await this.canActorAccessContract({
      tenantId: params.tenantId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      contract,
    })

    if (!canAccess) {
      throw new AuthorizationError('CONTRACT_NOTE_FORBIDDEN', 'You do not have access to add notes on this contract')
    }

    const supabase = createServiceSupabase()
    const { error } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_NOTE_ADDED',
        action: 'contract.note.added',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        note_text: params.noteText.trim(),
      },
    ])

    if (error) {
      throw new DatabaseError('Failed to add contract note', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async addContractActivityMessage(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    messageText: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (!activityMessageAllowedRoles.has(params.actorRole)) {
      throw new AuthorizationError(
        'CONTRACT_ACTIVITY_FORBIDDEN',
        'Only legal team, admin, and HOD can post activity messages'
      )
    }

    const contract = await this.getById(params.tenantId, params.contractId)
    if (!contract) {
      throw new BusinessRuleError('CONTRACT_NOT_FOUND', 'Contract not found')
    }

    const canAccess = await this.canActorAccessContract({
      tenantId: params.tenantId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      contract,
    })

    if (!canAccess) {
      throw new AuthorizationError('CONTRACT_ACTIVITY_FORBIDDEN', 'You do not have access to this contract activity')
    }

    const normalizedMessage = params.messageText.trim()
    if (!normalizedMessage) {
      throw new BusinessRuleError('ACTIVITY_MESSAGE_REQUIRED', 'Activity message is required')
    }

    const mentionedEmails = this.extractMentionEmails(normalizedMessage)
    if (mentionedEmails.length > 0) {
      await this.assertMentionUsersExist(params.tenantId, mentionedEmails)
    }

    const supabase = createServiceSupabase()
    const { error } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_ACTIVITY_MESSAGE_ADDED',
        action: 'contract.activity.message.added',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contractId,
        note_text: normalizedMessage,
        metadata: {
          mentions: mentionedEmails,
        },
      },
    ])

    if (error) {
      throw new DatabaseError('Failed to add contract activity message', new Error(error.message), {
        code: error.code,
      })
    }
  }

  async markContractActivitySeen(params: {
    tenantId: string
    contractId: string
    employeeId: string
  }): Promise<ContractActivityReadState> {
    const supabase = createServiceSupabase()

    const { data: latestEvent, error: latestError } = await supabase
      .from('audit_logs')
      .select('event_sequence')
      .eq('tenant_id', params.tenantId)
      .eq('resource_type', 'contract')
      .eq('resource_id', params.contractId)
      .eq('event_type', 'CONTRACT_ACTIVITY_MESSAGE_ADDED')
      .order('event_sequence', { ascending: false })
      .limit(1)
      .maybeSingle<{ event_sequence: number | null }>()

    if (latestError) {
      throw new DatabaseError('Failed to resolve latest contract activity sequence', new Error(latestError.message), {
        code: latestError.code,
      })
    }

    const latestSequence = latestEvent?.event_sequence ?? null
    const now = new Date().toISOString()

    const { error: upsertError } = await supabase.from('contract_activity_read_state').upsert(
      {
        tenant_id: params.tenantId,
        contract_id: params.contractId,
        employee_id: params.employeeId,
        last_seen_event_sequence: latestSequence,
        last_seen_at: now,
        updated_at: now,
      },
      {
        onConflict: 'tenant_id,contract_id,employee_id',
      }
    )

    if (upsertError) {
      if (this.isMissingRelationError(upsertError, 'contract_activity_read_state')) {
        return {
          contractId: params.contractId,
          employeeId: params.employeeId,
          lastSeenEventSequence: latestSequence,
          lastSeenAt: now,
          hasUnread: false,
        }
      }

      throw new DatabaseError('Failed to update contract activity read state', new Error(upsertError.message), {
        code: upsertError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.employeeId,
        event_type: null,
        action: 'contract.activity.read_state.updated',
        actor_email: null,
        actor_role: null,
        resource_type: 'contract_activity_read_state',
        resource_id: `${params.contractId}:${params.employeeId}`,
        metadata: {
          contract_id: params.contractId,
          employee_id: params.employeeId,
          last_seen_event_sequence: latestSequence,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError(
        'Failed to write contract activity read-state audit event',
        new Error(auditError.message),
        {
          code: auditError.code,
        }
      )
    }

    return {
      contractId: params.contractId,
      employeeId: params.employeeId,
      lastSeenEventSequence: latestSequence,
      lastSeenAt: now,
      hasUnread: false,
    }
  }

  private async applyAdditionalApproverApproval(params: {
    tenantId: string
    contract: ContractDetail
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.contract.status !== contractStatuses.underReview) {
      throw new BusinessRuleError(
        'APPROVER_ACTION_INVALID_STATUS',
        'Additional approver can only approve in UNDER_REVIEW'
      )
    }

    const firstPendingApprover = await this.getFirstPendingApprover(params.tenantId, params.contract.id)
    if (!firstPendingApprover || firstPendingApprover.approverEmployeeId !== params.actorEmployeeId) {
      throw new AuthorizationError('APPROVER_ACTION_FORBIDDEN', 'Only the next pending sequential approver can approve')
    }

    const supabase = createServiceSupabase()
    const { data: updatedApprover, error: updateError } = await supabase
      .from('contract_additional_approvers')
      .update({
        status: 'APPROVED',
        approved_at: new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', firstPendingApprover.id)
      .eq('status', 'PENDING')
      .is('deleted_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (updateError) {
      throw new DatabaseError('Failed to approve additional approver', new Error(updateError.message), {
        code: updateError.code,
      })
    }

    if (!updatedApprover) {
      throw new ConflictError('Additional approver action was already processed. Please refresh and retry.', {
        contractId: params.contract.id,
        tenantId: params.tenantId,
        action: 'approver.approve',
        approverId: firstPendingApprover.id,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_APPROVER_APPROVED',
        action: 'contract.approver.approved',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contract.id,
        metadata: {
          approver_id: firstPendingApprover.id,
          sequence_order: firstPendingApprover.sequenceOrder,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError('Failed to write additional approver audit event', new Error(auditError.message), {
        code: auditError.code,
      })
    }
  }

  private async applyAdditionalApproverRejection(params: {
    tenantId: string
    contract: ContractDetail
    actorEmployeeId: string
    actorRole: string
    actorEmail: string
    noteText: string
  }): Promise<void> {
    this.assertActorMetadata({
      actorEmployeeId: params.actorEmployeeId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    })

    if (params.contract.status !== contractStatuses.underReview) {
      throw new BusinessRuleError(
        'APPROVER_ACTION_INVALID_STATUS',
        'Additional approver can only reject in UNDER_REVIEW'
      )
    }

    const firstPendingApprover = await this.getFirstPendingApprover(params.tenantId, params.contract.id)
    if (!firstPendingApprover || firstPendingApprover.approverEmployeeId !== params.actorEmployeeId) {
      throw new AuthorizationError('APPROVER_ACTION_FORBIDDEN', 'Only the next pending sequential approver can reject')
    }

    const supabase = createServiceSupabase()
    const { data: rejectedApprover, error: rejectError } = await supabase
      .from('contract_additional_approvers')
      .update({
        status: 'REJECTED',
        approved_at: null,
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', firstPendingApprover.id)
      .eq('status', 'PENDING')
      .is('deleted_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (rejectError) {
      throw new DatabaseError('Failed to reject additional approver', new Error(rejectError.message), {
        code: rejectError.code,
      })
    }

    if (!rejectedApprover) {
      throw new ConflictError('Additional approver action was already processed. Please refresh and retry.', {
        contractId: params.contract.id,
        tenantId: params.tenantId,
        action: 'approver.reject',
        approverId: firstPendingApprover.id,
      })
    }

    const { error: pruneError } = await supabase
      .from('contract_additional_approvers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contract.id)
      .eq('status', 'PENDING')
      .gt('sequence_order', firstPendingApprover.sequenceOrder)
      .is('deleted_at', null)

    if (pruneError) {
      throw new DatabaseError('Failed to clear remaining pending additional approvers', new Error(pruneError.message), {
        code: pruneError.code,
      })
    }

    const { error: auditError } = await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        user_id: params.actorEmployeeId,
        event_type: 'CONTRACT_APPROVER_REJECTED',
        action: 'contract.approver.rejected',
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        resource_type: 'contract',
        resource_id: params.contract.id,
        note_text: params.noteText.trim(),
        metadata: {
          approver_id: firstPendingApprover.id,
          sequence_order: firstPendingApprover.sequenceOrder,
        },
      },
    ])

    if (auditError) {
      throw new DatabaseError(
        'Failed to write additional approver rejection audit event',
        new Error(auditError.message),
        {
          code: auditError.code,
        }
      )
    }
  }

  private async getTransitionsForStatus(
    tenantId: string,
    fromStatus: ContractStatus,
    role: string
  ): Promise<TransitionGraphEntity[]> {
    const supabase = createServiceSupabase()
    const { data: tenantRows, error: tenantError } = await supabase
      .from('contract_transition_graph')
      .select('trigger_action, to_status, allowed_roles')
      .eq('tenant_id', tenantId)
      .eq('from_status', fromStatus)
      .eq('is_active', true)
      .contains('allowed_roles', [role])

    if (tenantError) {
      throw new DatabaseError('Failed to resolve transitions', new Error(tenantError.message), {
        code: tenantError.code,
      })
    }

    if (tenantRows && tenantRows.length > 0) {
      return tenantRows as TransitionGraphEntity[]
    }

    const { data: defaultRows, error: defaultError } = await supabase
      .from('contract_transition_graph')
      .select('trigger_action, to_status, allowed_roles')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('from_status', fromStatus)
      .eq('is_active', true)
      .contains('allowed_roles', [role])

    if (defaultError) {
      throw new DatabaseError('Failed to resolve default transitions', new Error(defaultError.message), {
        code: defaultError.code,
      })
    }

    return (defaultRows ?? []) as TransitionGraphEntity[]
  }

  private async resolveTransition(tenantId: string, fromStatus: ContractStatus, action: ContractActionName) {
    if (action === 'legal.query.reroute') {
      return this.resolveRerouteTransition(tenantId, fromStatus)
    }

    const supabase = createServiceSupabase()

    const { data: tenantTransitions, error } = await supabase
      .from('contract_transition_graph')
      .select('to_status, allowed_roles')
      .eq('tenant_id', tenantId)
      .eq('from_status', fromStatus)
      .eq('trigger_action', action)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(2)

    if (error) {
      throw new DatabaseError('Failed to resolve workflow transition', new Error(error.message), {
        code: error.code,
      })
    }

    if (tenantTransitions && tenantTransitions.length > 1) {
      throw new BusinessRuleError(
        'CONTRACT_TRANSITION_AMBIGUOUS',
        'Multiple active workflow transitions configured for this action'
      )
    }

    if (tenantTransitions && tenantTransitions.length === 1) {
      return tenantTransitions[0] as { to_status: string; allowed_roles: string[] }
    }

    const { data: fallbackTransitions, error: fallbackError } = await supabase
      .from('contract_transition_graph')
      .select('to_status, allowed_roles')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('from_status', fromStatus)
      .eq('trigger_action', action)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(2)

    if (fallbackError) {
      throw new DatabaseError('Failed to resolve default workflow transition', new Error(fallbackError.message), {
        code: fallbackError.code,
      })
    }

    if (fallbackTransitions && fallbackTransitions.length > 1) {
      throw new BusinessRuleError(
        'CONTRACT_TRANSITION_AMBIGUOUS',
        'Multiple default active workflow transitions configured for this action'
      )
    }

    if (!fallbackTransitions || fallbackTransitions.length === 0) {
      throw new BusinessRuleError(
        'CONTRACT_TRANSITION_INVALID',
        'No active workflow transition configured for this action'
      )
    }

    return fallbackTransitions[0] as { to_status: string; allowed_roles: string[] }
  }

  private async resolveRerouteTransition(tenantId: string, fromStatus: ContractStatus) {
    const supabase = createServiceSupabase()

    const loadTransition = async (scopeTenantId: string) => {
      const { data, error } = await supabase
        .from('contract_transition_graph')
        .select('to_status, allowed_roles')
        .eq('tenant_id', scopeTenantId)
        .eq('from_status', fromStatus)
        .eq('trigger_action', 'legal.query.reroute')
        .eq('to_status', contractStatuses.hodPending)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(2)

      if (error) {
        throw new DatabaseError('Failed to resolve reroute transition', new Error(error.message), {
          code: error.code,
        })
      }

      if (data && data.length > 1) {
        throw new BusinessRuleError(
          'CONTRACT_TRANSITION_AMBIGUOUS',
          'Multiple active reroute transitions configured for HOD_PENDING'
        )
      }

      return data
    }

    const tenantTransition = await loadTransition(tenantId)
    if (tenantTransition && tenantTransition.length > 0) {
      return tenantTransition[0] as { to_status: string; allowed_roles: string[] }
    }

    const fallbackTransition = await loadTransition(DEFAULT_TENANT_ID)
    if (fallbackTransition && fallbackTransition.length > 0) {
      return fallbackTransition[0] as { to_status: string; allowed_roles: string[] }
    }

    throw new BusinessRuleError('CONTRACT_TRANSITION_INVALID', 'No active reroute transition configured for HOD')
  }

  private async canActorAccessContract(params: {
    tenantId: string
    actorEmployeeId: string
    actorRole?: string
    contract: ContractDetail
  }): Promise<boolean> {
    if (params.actorRole === 'ADMIN' || params.actorRole === 'LEGAL_TEAM') {
      return true
    }

    if (params.contract.uploadedByEmployeeId === params.actorEmployeeId) {
      return true
    }

    if (
      params.contract.currentAssigneeEmployeeId === params.actorEmployeeId &&
      (params.actorRole === 'HOD' || params.actorRole === 'LEGAL_TEAM')
    ) {
      return true
    }

    if (params.actorRole !== 'HOD') {
      const isActionableApprover = await this.isActionableAdditionalApprover({
        tenantId: params.tenantId,
        contractId: params.contract.id,
        actorEmployeeId: params.actorEmployeeId,
        status: params.contract.status,
      })

      if (isActionableApprover) {
        return true
      }

      return this.isAdditionalApproverParticipant({
        tenantId: params.tenantId,
        contractId: params.contract.id,
        actorEmployeeId: params.actorEmployeeId,
      })
    }

    if (params.contract.uploadMode === contractUploadModes.legalSendForSigning) {
      const isActionableApprover = await this.isActionableAdditionalApprover({
        tenantId: params.tenantId,
        contractId: params.contract.id,
        actorEmployeeId: params.actorEmployeeId,
        status: params.contract.status,
      })

      if (isActionableApprover) {
        return true
      }

      return this.isAdditionalApproverParticipant({
        tenantId: params.tenantId,
        contractId: params.contract.id,
        actorEmployeeId: params.actorEmployeeId,
      })
    }

    const hodDepartmentIds = await this.getHodDepartmentIds(params.tenantId, params.actorEmployeeId)
    if (hodDepartmentIds.length === 0) {
      return false
    }

    if (hodDepartmentIds.includes(params.contract.departmentId)) {
      return true
    }

    const isActionableApprover = await this.isActionableAdditionalApprover({
      tenantId: params.tenantId,
      contractId: params.contract.id,
      actorEmployeeId: params.actorEmployeeId,
      status: params.contract.status,
    })

    if (isActionableApprover) {
      return true
    }

    return this.isAdditionalApproverParticipant({
      tenantId: params.tenantId,
      contractId: params.contract.id,
      actorEmployeeId: params.actorEmployeeId,
    })
  }

  private async getVisibilityFilter(
    tenantId: string,
    role: string | undefined,
    employeeId: string,
    employeeEmail?: string | null
  ): Promise<VisibilityFilterContext> {
    const actionableAdditionalApproverContractIdsPromise = this.getActionableAdditionalApproverContractIds(
      tenantId,
      employeeId
    )

    if (role === 'ADMIN' || role === 'LEGAL_TEAM') {
      const actionableAdditionalApproverContractIds = await actionableAdditionalApproverContractIdsPromise
      return {
        filter: null,
        actionableContractIds: actionableAdditionalApproverContractIds,
      }
    }

    if (role !== 'HOD') {
      const actionableAdditionalApproverContractIds = await actionableAdditionalApproverContractIdsPromise
      const actionableApproverFilter =
        actionableAdditionalApproverContractIds.length > 0
          ? `id.in.(${actionableAdditionalApproverContractIds.join(',')})`
          : null
      const conditions = [`uploaded_by_employee_id.eq.${employeeId}`]
      if (actionableApproverFilter) {
        conditions.push(actionableApproverFilter)
      }
      return {
        filter: conditions.join(','),
        actionableContractIds: actionableAdditionalApproverContractIds,
      }
    }

    const [actionableAdditionalApproverContractIds, hodDepartmentIds] = await Promise.all([
      actionableAdditionalApproverContractIdsPromise,
      this.getHodDepartmentIds(tenantId, employeeId, employeeEmail),
    ])
    const actionableApproverFilter =
      actionableAdditionalApproverContractIds.length > 0
        ? `id.in.(${actionableAdditionalApproverContractIds.join(',')})`
        : null

    if (hodDepartmentIds.length === 0) {
      const conditions = [`uploaded_by_employee_id.eq.${employeeId}`]
      if (actionableApproverFilter) {
        conditions.push(actionableApproverFilter)
      }
      return {
        filter: conditions.join(','),
        actionableContractIds: actionableAdditionalApproverContractIds,
      }
    }

    const conditions = [`current_assignee_employee_id.eq.${employeeId}`, `uploaded_by_employee_id.eq.${employeeId}`]
    if (actionableApproverFilter) {
      conditions.push(actionableApproverFilter)
    }

    return {
      filter: conditions.join(','),
      actionableContractIds: actionableAdditionalApproverContractIds,
    }
  }

  private getPendingApprovalStatuses(role?: string): ContractStatus[] {
    if (role === 'HOD') {
      return [contractStatuses.hodPending]
    }

    if (role === 'LEGAL_TEAM') {
      return [contractStatuses.underReview]
    }

    if (role === 'ADMIN') {
      return [contractStatuses.hodPending, contractStatuses.underReview]
    }

    return []
  }

  private resolveDashboardFilter(
    role: string | undefined,
    requestedFilter: DashboardContractFilter
  ): DashboardContractFilter {
    if (role === 'ADMIN') {
      return requestedFilter
    }

    if (role === 'LEGAL_TEAM') {
      if (requestedFilter === 'ALL') {
        return 'UNDER_REVIEW'
      }

      return requestedFilter
    }

    if (role === 'HOD' || role === 'POC') {
      if (requestedFilter === 'ALL') {
        return 'HOD_PENDING'
      }

      return requestedFilter
    }

    return 'HOD_PENDING'
  }

  private resolveDashboardStatusFromFilter(filter: DashboardContractFilter): ContractStatus | null {
    if (filter === 'ALL' || filter === 'ASSIGNED_TO_ME') {
      return null
    }

    if (filter === 'HOD_PENDING') {
      return contractStatuses.hodPending
    }

    if (filter === 'UNDER_REVIEW') {
      return contractStatuses.underReview
    }

    if (filter === 'COMPLETED') {
      return contractStatuses.completed
    }

    return contractStatuses.onHold
  }

  private async getEmployeeEmail(tenantId: string, employeeId: string): Promise<string | null> {
    const supabase = createServiceSupabase()

    const { data: employee, error: employeeError } = await supabase
      .from('users')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('id', employeeId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle<{ email: string | null }>()

    if (employeeError) {
      throw new DatabaseError('Failed to resolve employee email', new Error(employeeError.message), {
        code: employeeError.code,
      })
    }

    return employee?.email?.trim().toLowerCase() ?? null
  }

  private async getHodDepartmentIds(
    tenantId: string,
    employeeId: string,
    preResolvedEmail?: string | null
  ): Promise<string[]> {
    const resolvedEmployeeEmail = preResolvedEmail ?? (await this.getEmployeeEmail(tenantId, employeeId))
    if (!resolvedEmployeeEmail) {
      return []
    }

    const supabase = createServiceSupabase()

    const { data: hodTeams, error: hodTeamsError } = await supabase
      .from('team_role_mappings')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .eq('email', resolvedEmployeeEmail)
      .eq('role_type', 'HOD')
      .eq('active_flag', true)
      .is('deleted_at', null)

    if (hodTeamsError) {
      if (
        this.isMissingRelationError(hodTeamsError, 'team_role_mappings') ||
        this.isMissingColumnError(hodTeamsError, 'team_role_mappings')
      ) {
        return []
      }

      throw new DatabaseError('Failed to resolve HOD departments for access checks', new Error(hodTeamsError.message), {
        code: hodTeamsError.code,
      })
    }

    return Array.from(new Set((hodTeams ?? []).map((member) => member.team_id)))
  }

  private async getPendingApproverCount(tenantId: string, contractId: string): Promise<number> {
    const supabase = createServiceSupabase()
    const { count, error } = await supabase
      .from('contract_additional_approvers')
      .select('id', { head: true, count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .eq('status', 'PENDING')
      .is('deleted_at', null)

    if (error) {
      throw new DatabaseError('Failed to evaluate pending approvers', new Error(error.message), {
        code: error.code,
      })
    }

    return count ?? 0
  }

  private async getFirstPendingApprover(
    tenantId: string,
    contractId: string
  ): Promise<ContractAdditionalApprover | null> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_additional_approvers')
      .select('id, approver_employee_id, approver_email, sequence_order, status, approved_at')
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .eq('status', 'PENDING')
      .is('deleted_at', null)
      .order('sequence_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new DatabaseError('Failed to fetch pending approver', new Error(error.message), {
        code: error.code,
      })
    }

    if (!data) {
      return null
    }

    return {
      id: data.id,
      approverEmployeeId: data.approver_employee_id,
      approverEmail: data.approver_email,
      sequenceOrder: data.sequence_order,
      status: data.status,
      approvedAt: data.approved_at,
    }
  }

  private async getActionableAdditionalApproverContractIds(
    tenantId: string,
    actorEmployeeId: string
  ): Promise<string[]> {
    const supabase = createServiceSupabase()
    const { data: actorPendingRows, error: actorPendingError } = await supabase
      .from('contract_additional_approvers')
      .select('contract_id, sequence_order')
      .eq('tenant_id', tenantId)
      .eq('approver_employee_id', actorEmployeeId)
      .eq('status', 'PENDING')
      .is('deleted_at', null)

    if (actorPendingError) {
      if (
        this.isMissingRelationError(actorPendingError, 'contract_additional_approvers') ||
        this.isMissingColumnError(actorPendingError, 'contract_additional_approvers')
      ) {
        return []
      }

      throw new DatabaseError(
        'Failed to load actor pending additional approvals',
        new Error(actorPendingError.message),
        {
          code: actorPendingError.code,
        }
      )
    }

    if (!actorPendingRows || actorPendingRows.length === 0) {
      return []
    }

    const candidateContractIds = Array.from(new Set(actorPendingRows.map((row) => row.contract_id)))
    const [underReviewResult, allPendingResult] = await Promise.all([
      supabase
        .from('contracts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', contractStatuses.underReview)
        .in('id', candidateContractIds),
      supabase
        .from('contract_additional_approvers')
        .select('contract_id, sequence_order')
        .eq('tenant_id', tenantId)
        .eq('status', 'PENDING')
        .is('deleted_at', null)
        .in('contract_id', candidateContractIds),
    ])

    if (underReviewResult.error) {
      throw new DatabaseError(
        'Failed to load under-review contracts for additional approver visibility',
        new Error(underReviewResult.error.message),
        {
          code: underReviewResult.error.code,
        }
      )
    }

    const underReviewContractIds = new Set((underReviewResult.data ?? []).map((row) => row.id))
    if (underReviewContractIds.size === 0) {
      return []
    }

    const filteredActorPendingRows = actorPendingRows.filter((row) => underReviewContractIds.has(row.contract_id))
    if (filteredActorPendingRows.length === 0) {
      return []
    }

    const { data: allPendingRows, error: allPendingError } = allPendingResult

    if (allPendingError) {
      if (
        this.isMissingRelationError(allPendingError, 'contract_additional_approvers') ||
        this.isMissingColumnError(allPendingError, 'contract_additional_approvers')
      ) {
        return []
      }

      throw new DatabaseError(
        'Failed to evaluate sequential pending additional approvals',
        new Error(allPendingError.message),
        {
          code: allPendingError.code,
        }
      )
    }

    const minSequenceByContract = new Map<string, number>()
    for (const row of allPendingRows ?? []) {
      const currentMin = minSequenceByContract.get(row.contract_id)
      if (currentMin === undefined || row.sequence_order < currentMin) {
        minSequenceByContract.set(row.contract_id, row.sequence_order)
      }
    }

    return filteredActorPendingRows
      .filter((row) => row.sequence_order === minSequenceByContract.get(row.contract_id))
      .map((row) => row.contract_id)
  }

  private async isActionableAdditionalApprover(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    status: ContractStatus
  }): Promise<boolean> {
    if (params.status !== contractStatuses.underReview) {
      return false
    }

    const firstPendingApprover = await this.getFirstPendingApprover(params.tenantId, params.contractId)
    return firstPendingApprover?.approverEmployeeId === params.actorEmployeeId
  }

  private async isAdditionalApproverParticipant(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
  }): Promise<boolean> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_additional_approvers')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('contract_id', params.contractId)
      .eq('approver_employee_id', params.actorEmployeeId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (error) {
      if (
        this.isMissingRelationError(error, 'contract_additional_approvers') ||
        this.isMissingColumnError(error, 'contract_additional_approvers')
      ) {
        return false
      }

      throw new DatabaseError(
        'Failed to resolve additional approver contract participation',
        new Error(error.message),
        {
          code: error.code,
        }
      )
    }

    return Boolean(data?.id)
  }

  private async getAdditionalApproverContractContextMap(
    tenantId: string,
    contractIds: string[],
    actorEmployeeId: string | null
  ): Promise<Map<string, AdditionalApproverContractContext>> {
    const contextMap = new Map<string, AdditionalApproverContractContext>()
    const uniqueContractIds = Array.from(new Set(contractIds)).filter((id) => id.length > 0)

    if (uniqueContractIds.length === 0) {
      return contextMap
    }

    const supabase = createServiceSupabase()

    // Run both queries in parallel — they have no dependency on each other.
    const [pendingResult, rejectionResult] = await Promise.all([
      supabase
        .from('contract_additional_approvers')
        .select('contract_id, approver_employee_id, sequence_order')
        .eq('tenant_id', tenantId)
        .eq('status', 'PENDING')
        .is('deleted_at', null)
        .in('contract_id', uniqueContractIds),
      supabase
        .from('audit_logs')
        .select('resource_id, note_text, created_at')
        .eq('tenant_id', tenantId)
        .eq('resource_type', 'contract')
        .eq('action', 'contract.approver.rejected')
        .in('resource_id', uniqueContractIds)
        .order('created_at', { ascending: false }),
    ])

    const { data: pendingRows, error: pendingError } = pendingResult

    if (pendingError) {
      if (
        this.isMissingRelationError(pendingError, 'contract_additional_approvers') ||
        this.isMissingColumnError(pendingError, 'contract_additional_approvers')
      ) {
        for (const contractId of uniqueContractIds) {
          contextMap.set(contractId, {
            hasPendingAdditionalApprovers: false,
            latestAdditionalApproverRejectionReason: null,
            latestAdditionalApproverRejectionAt: null,
            isAdditionalApproverActionable: false,
          })
        }

        return contextMap
      }

      throw new DatabaseError(
        'Failed to evaluate pending additional approvers for contracts',
        new Error(pendingError.message),
        {
          code: pendingError.code,
        }
      )
    }

    const typedPendingRows = (pendingRows ?? []) as Array<{
      contract_id: string
      approver_employee_id: string
      sequence_order: number
    }>

    const pendingContractIds = new Set(typedPendingRows.map((row) => row.contract_id))
    const minPendingSequenceByContract = new Map<string, number>()
    for (const row of typedPendingRows) {
      const currentMin = minPendingSequenceByContract.get(row.contract_id)
      if (currentMin === undefined || row.sequence_order < currentMin) {
        minPendingSequenceByContract.set(row.contract_id, row.sequence_order)
      }
    }

    const actionableContractIds = new Set<string>()
    if (actorEmployeeId) {
      for (const row of typedPendingRows) {
        if (
          row.approver_employee_id === actorEmployeeId &&
          row.sequence_order === minPendingSequenceByContract.get(row.contract_id)
        ) {
          actionableContractIds.add(row.contract_id)
        }
      }
    }

    const { data: rejectionData, error: rejectionError } = rejectionResult

    let rejectionRows: Array<{ resource_id: string; note_text: string | null; created_at: string }> = []

    if (rejectionError) {
      if (
        this.isMissingRelationError(rejectionError, 'audit_logs') ||
        this.isMissingColumnError(rejectionError, 'audit_logs')
      ) {
        rejectionRows = []
      } else {
        throw new DatabaseError(
          'Failed to load additional approver rejection context for contracts',
          new Error(rejectionError.message),
          {
            code: rejectionError.code,
          }
        )
      }
    } else {
      rejectionRows = (rejectionData ?? []) as Array<{
        resource_id: string
        note_text: string | null
        created_at: string
      }>
    }

    const latestRejectionByContract = new Map<string, { reason: string | null; at: string | null }>()
    for (const row of rejectionRows) {
      if (!latestRejectionByContract.has(row.resource_id)) {
        latestRejectionByContract.set(row.resource_id, {
          reason: row.note_text,
          at: row.created_at,
        })
      }
    }

    for (const contractId of uniqueContractIds) {
      const latestRejection = latestRejectionByContract.get(contractId)
      contextMap.set(contractId, {
        hasPendingAdditionalApprovers: pendingContractIds.has(contractId),
        latestAdditionalApproverRejectionReason: latestRejection?.reason ?? null,
        latestAdditionalApproverRejectionAt: latestRejection?.at ?? null,
        isAdditionalApproverActionable: actionableContractIds.has(contractId),
      })
    }

    return contextMap
  }

  private async getLegalAssignee(tenantId: string): Promise<{ id: string; email: string }> {
    const legalMembers = await this.resolveActiveTenantLegalMembers(tenantId)
    const assignee = legalMembers[0]

    if (!assignee) {
      throw new BusinessRuleError('LEGAL_ASSIGNEE_NOT_FOUND', 'No active legal team member available for routing')
    }

    return {
      id: assignee.id,
      email: assignee.email,
    }
  }

  private async resolveActiveTenantLegalUserByEmail(
    tenantId: string,
    email: string
  ): Promise<{ id: string; email: string }> {
    const normalizedEmail = email.trim().toLowerCase()
    const legalMembers = await this.resolveActiveTenantLegalMembers(tenantId)
    const legalUser = legalMembers.find((member) => member.email.trim().toLowerCase() === normalizedEmail)

    if (!legalUser) {
      throw new BusinessRuleError('LEGAL_USER_NOT_FOUND', 'Email must belong to an active legal user in this tenant')
    }

    return {
      id: legalUser.id,
      email: legalUser.email,
    }
  }

  private async resolveActiveTenantLegalMembers(
    tenantId: string
  ): Promise<Array<{ id: string; email: string; fullName?: string | null }>> {
    const supabase = createServiceSupabase()

    const { data: canonicalRoleRows, error: canonicalRoleError } = await supabase
      .from('user_roles')
      .select('user_id, roles:roles!inner(role_key, is_active, deleted_at)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .eq('roles.role_key', 'LEGAL_TEAM')
      .eq('roles.is_active', true)
      .is('roles.deleted_at', null)

    if (canonicalRoleError && !this.isMissingRelationError(canonicalRoleError)) {
      throw new DatabaseError('Failed to fetch legal team members', new Error(canonicalRoleError.message), {
        code: canonicalRoleError.code,
      })
    }

    const canonicalLegalUserIds = new Set<string>()
    for (const row of (canonicalRoleRows ?? []) as Array<{ user_id: string }>) {
      if (row.user_id) {
        canonicalLegalUserIds.add(row.user_id)
      }
    }

    const { data: legacyRows, error: legacyError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('tenant_id', tenantId)
      .eq('role', 'LEGAL_TEAM')
      .eq('is_active', true)
      .is('deleted_at', null)

    if (legacyError) {
      throw new DatabaseError('Failed to fetch legal team members', new Error(legacyError.message), {
        code: legacyError.code,
      })
    }

    const merged = new Map<string, { id: string; email: string; fullName?: string | null }>()

    for (const row of (legacyRows ?? []) as Array<{ id: string; email: string; full_name: string | null }>) {
      merged.set(row.id, {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
      })
    }

    if (canonicalLegalUserIds.size > 0) {
      const { data: canonicalUsers, error: canonicalUsersError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .in('id', Array.from(canonicalLegalUserIds))

      if (canonicalUsersError) {
        throw new DatabaseError('Failed to fetch legal team members', new Error(canonicalUsersError.message), {
          code: canonicalUsersError.code,
        })
      }

      for (const row of (canonicalUsers ?? []) as Array<{ id: string; email: string; full_name: string | null }>) {
        merged.set(row.id, {
          id: row.id,
          email: row.email,
          fullName: row.full_name,
        })
      }
    }

    return Array.from(merged.values()).sort((left, right) => {
      const leftName = left.fullName?.trim().toLowerCase() ?? ''
      const rightName = right.fullName?.trim().toLowerCase() ?? ''
      if (leftName && rightName && leftName !== rightName) {
        return leftName.localeCompare(rightName)
      }

      if (leftName && !rightName) {
        return -1
      }

      if (!leftName && rightName) {
        return 1
      }

      return left.email.localeCompare(right.email)
    })
  }

  private assertLegalAssignmentActorRole(actorRole: string): void {
    if (
      !contractLegalAssignmentAllowedRoles.includes(actorRole as (typeof contractLegalAssignmentAllowedRoles)[number])
    ) {
      throw new AuthorizationError('CONTRACT_ASSIGNMENT_FORBIDDEN', 'Only legal team can manage legal assignments')
    }
  }

  private assertLegalAssignmentEditable(status: ContractStatus): void {
    if (!contractLegalAssignmentEditableStatuses.includes(status)) {
      throw new BusinessRuleError(
        'LEGAL_ASSIGNMENT_INVALID_STATUS',
        'Legal assignment can only be updated in active legal workflow statuses'
      )
    }
  }

  private async getTeamHodAssignee(tenantId: string, departmentId: string): Promise<{ id: string; email: string }> {
    const supabase = createServiceSupabase()

    const { data: hodMapping, error: hodMappingError } = await supabase
      .from('team_role_mappings')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('team_id', departmentId)
      .eq('role_type', 'HOD')
      .eq('active_flag', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle<{ email: string }>()

    if (hodMappingError || !hodMapping?.email) {
      throw new BusinessRuleError('HOD_ASSIGNEE_NOT_FOUND', 'Department HOD is not configured for reroute')
    }

    const { data: hod, error: hodError } = await supabase
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenantId)
      .eq('email', hodMapping.email)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single<{ id: string; email: string }>()

    if (hodError || !hod) {
      throw new BusinessRuleError('HOD_ASSIGNEE_NOT_FOUND', 'No active HOD found for team routing')
    }

    return hod
  }

  private isMissingRelationError(
    error: { code?: string; message?: string; details?: string; hint?: string } | null,
    relation?: string
  ): boolean {
    if (!error) {
      return false
    }

    if (error.code === '42P01' || error.code === 'PGRST205') {
      return true
    }

    const combined = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase()
    if (!combined) {
      return false
    }

    const hasMissingRelationSignal =
      combined.includes('does not exist') ||
      combined.includes('could not find the table') ||
      combined.includes('relation')

    if (!relation) {
      return hasMissingRelationSignal
    }

    return hasMissingRelationSignal && combined.includes(relation.toLowerCase())
  }

  private isMissingColumnError(
    error: { code?: string; message?: string; details?: string; hint?: string },
    relation: string
  ): boolean {
    if (error.code === '42703' || error.code === 'PGRST204') {
      return true
    }

    const combined = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase()
    if (!combined) {
      return false
    }

    return combined.includes('column') && combined.includes(relation.toLowerCase())
  }

  private isViewQueryCompatibilityError(
    error: { code?: string; message?: string; details?: string; hint?: string },
    relation: string
  ): boolean {
    if (this.isMissingRelationError(error, relation) || this.isMissingColumnError(error, relation)) {
      return true
    }

    const combined = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase()
    if (!combined) {
      return false
    }

    return combined.includes(relation.toLowerCase())
  }

  private toAllowedAction(action: ContractActionName): ContractAllowedAction | null {
    if (!(action in actionLabelMap)) {
      return null
    }

    return {
      action,
      label: actionLabelMap[action],
      requiresRemark: remarkRequiredActions.has(action),
    }
  }

  private toAuditEventType(action: ContractActionName): string {
    if (
      action === 'legal.set.under_review' ||
      action === 'legal.set.pending_internal' ||
      action === 'legal.set.pending_external' ||
      action === 'legal.set.offline_execution' ||
      action === 'legal.set.on_hold' ||
      action === 'legal.set.completed' ||
      action === 'legal.query' ||
      action === 'legal.query.reroute' ||
      action === 'legal.void'
    ) {
      return 'CONTRACT_TRANSITIONED'
    }

    if (action === 'hod.reject' || action === 'legal.reject' || action === 'approver.reject') {
      return 'CONTRACT_TRANSITIONED'
    }

    if (action === 'hod.bypass') {
      return 'CONTRACT_BYPASSED'
    }

    return 'CONTRACT_APPROVED'
  }

  private async attachActorContractSignals(
    tenantId: string,
    employeeId: string,
    items: ContractListItem[],
    role?: string
  ): Promise<ContractListItem[]> {
    if (items.length === 0) {
      return items
    }

    const contractIds = items.map((item) => item.id)
    const [assignedContractIds, unreadContractIds] = await Promise.all([
      this.getAssignedContractIdSet(tenantId, employeeId, contractIds, role),
      this.getUnreadActivityContractIdSet(tenantId, employeeId, contractIds),
    ])

    return items.map((item) => ({
      ...item,
      isAssignedToMe: assignedContractIds.has(item.id),
      hasUnreadActivity: unreadContractIds.has(item.id),
      canHodApprove: role === 'HOD' && item.status === contractStatuses.hodPending,
      canHodReject: role === 'HOD' && item.status === contractStatuses.hodPending,
    }))
  }

  private async getAssignedContractIdSet(
    tenantId: string,
    employeeId: string,
    contractIds: string[],
    role?: string
  ): Promise<Set<string>> {
    if (contractIds.length === 0) {
      return new Set<string>()
    }

    const supabase = createServiceSupabase()
    const assignedIds = new Set<string>()

    const shouldIncludeAssignee = role !== 'LEGAL_TEAM'

    if (shouldIncludeAssignee) {
      const { data: assigneeRows, error: assigneeError } = await supabase
        .from('contracts')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', contractIds)
        .eq('current_assignee_employee_id', employeeId)
        .is('deleted_at', null)

      if (assigneeError) {
        throw new DatabaseError('Failed to resolve assignee contract set', new Error(assigneeError.message), {
          code: assigneeError.code,
        })
      }

      for (const row of (assigneeRows ?? []) as Array<{ id: string }>) {
        assignedIds.add(row.id)
      }
    }

    const { data: collaboratorRows, error: collaboratorError } = await supabase
      .from('contract_legal_collaborators')
      .select('contract_id')
      .eq('tenant_id', tenantId)
      .eq('collaborator_employee_id', employeeId)
      .in('contract_id', contractIds)
      .is('deleted_at', null)

    if (collaboratorError) {
      if (
        this.isMissingRelationError(collaboratorError, 'contract_legal_collaborators') ||
        this.isMissingColumnError(collaboratorError, 'contract_legal_collaborators')
      ) {
        return assignedIds
      }

      throw new DatabaseError('Failed to resolve collaborator contract set', new Error(collaboratorError.message), {
        code: collaboratorError.code,
      })
    }

    for (const row of (collaboratorRows ?? []) as Array<{ contract_id: string }>) {
      assignedIds.add(row.contract_id)
    }

    return assignedIds
  }

  private async getUnreadActivityContractIdSet(
    tenantId: string,
    employeeId: string,
    contractIds: string[]
  ): Promise<Set<string>> {
    if (contractIds.length === 0) {
      return new Set<string>()
    }

    const supabase = createServiceSupabase()
    const unreadIds = new Set<string>()

    const { data: latestRows, error: latestError } = await supabase
      .from('audit_logs')
      .select('resource_id, event_sequence')
      .eq('tenant_id', tenantId)
      .eq('resource_type', 'contract')
      .eq('event_type', 'CONTRACT_ACTIVITY_MESSAGE_ADDED')
      .in('resource_id', contractIds)
      .order('event_sequence', { ascending: false })

    if (latestError) {
      if (
        this.isMissingRelationError(latestError, 'audit_logs') ||
        this.isMissingColumnError(latestError, 'audit_logs')
      ) {
        return unreadIds
      }

      throw new DatabaseError('Failed to resolve latest activity state', new Error(latestError.message), {
        code: latestError.code,
      })
    }

    const latestByContract = new Map<string, number>()
    for (const row of (latestRows ?? []) as Array<{ resource_id: string; event_sequence: number }>) {
      if (!latestByContract.has(row.resource_id)) {
        latestByContract.set(row.resource_id, row.event_sequence)
      }
    }

    const { data: readRows, error: readError } = await supabase
      .from('contract_activity_read_state')
      .select('contract_id, last_seen_event_sequence')
      .eq('tenant_id', tenantId)
      .eq('employee_id', employeeId)
      .in('contract_id', contractIds)

    if (readError) {
      if (
        this.isMissingRelationError(readError, 'contract_activity_read_state') ||
        this.isMissingColumnError(readError, 'contract_activity_read_state')
      ) {
        return unreadIds
      }

      throw new DatabaseError('Failed to resolve activity read state', new Error(readError.message), {
        code: readError.code,
      })
    }

    const seenByContract = new Map<string, number>()
    for (const row of (readRows ?? []) as Array<{ contract_id: string; last_seen_event_sequence: number | null }>) {
      if (typeof row.last_seen_event_sequence === 'number') {
        seenByContract.set(row.contract_id, row.last_seen_event_sequence)
      }
    }

    for (const [contractId, latestSequence] of latestByContract.entries()) {
      const seenSequence = seenByContract.get(contractId)
      if (typeof seenSequence !== 'number' || latestSequence > seenSequence) {
        unreadIds.add(contractId)
      }
    }

    return unreadIds
  }

  private extractMentionEmails(messageText: string): string[] {
    const matches = messageText.match(/@([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi) ?? []
    return [...new Set(matches.map((token) => token.slice(1).toLowerCase()))]
  }

  private async assertMentionUsersExist(tenantId: string, emails: string[]): Promise<void> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('tenant_id', tenantId)
      .in('email', emails)
      .eq('is_active', true)
      .is('deleted_at', null)

    if (error) {
      throw new DatabaseError('Failed to validate tagged users', new Error(error.message), {
        code: error.code,
      })
    }

    const foundEmails = new Set((data ?? []).map((row) => row.email.toLowerCase()))
    const missingEmails = emails.filter((email) => !foundEmails.has(email))

    if (missingEmails.length > 0) {
      throw new BusinessRuleError(
        'ACTIVITY_MENTION_USER_NOT_FOUND',
        `Tagged users not found or inactive: ${missingEmails.join(', ')}`
      )
    }
  }

  private mapListItem(
    row: {
      id: string
      title: string
      status: string
      uploaded_by_employee_id: string
      uploaded_by_email: string
      current_assignee_employee_id: string
      current_assignee_email: string
      hod_approved_at?: string | null
      tat_deadline_at?: string | null
      tat_breached_at?: string | null
      request_created_at?: string | null
      department_id?: string | null
      legal_effective_date?: string | null
      legal_termination_date?: string | null
      legal_notice_period?: string | null
      legal_auto_renewal?: boolean | null
      void_reason?: string | null
      aging_business_days?: number | null
      near_breach?: boolean
      is_tat_breached?: boolean
      created_at: string
      updated_at: string
    },
    additionalApproverContext?: AdditionalApproverContractContext,
    metadata?: {
      creatorName?: string | null
      executedAt?: string | null
      departmentName?: string | null
      assignedToUsers?: string[]
    }
  ): ContractListItem {
    this.assertStatus(row.status)

    const status = row.status as ContractStatus
    const repositoryStatus = resolveRepositoryStatus({
      status,
      hasPendingAdditionalApprovers: additionalApproverContext?.hasPendingAdditionalApprovers ?? false,
    })

    return {
      id: row.id,
      title: row.title,
      status,
      voidReason: row.void_reason ?? null,
      displayStatusLabel: resolveContractStatusDisplayLabel({
        status,
        hasPendingAdditionalApprovers: additionalApproverContext?.hasPendingAdditionalApprovers ?? false,
      }),
      repositoryStatus,
      repositoryStatusLabel: contractRepositoryStatusLabels[repositoryStatus],
      creatorName: metadata?.creatorName ?? null,
      uploadedByEmployeeId: row.uploaded_by_employee_id,
      uploadedByEmail: row.uploaded_by_email,
      currentAssigneeEmployeeId: row.current_assignee_employee_id,
      currentAssigneeEmail: row.current_assignee_email,
      latestAdditionalApproverRejectionReason:
        additionalApproverContext?.latestAdditionalApproverRejectionReason ?? null,
      latestAdditionalApproverRejectionAt: additionalApproverContext?.latestAdditionalApproverRejectionAt ?? null,
      isAdditionalApproverActionable: additionalApproverContext?.isAdditionalApproverActionable ?? false,
      hodApprovedAt: row.hod_approved_at ?? null,
      tatDeadlineAt: row.tat_deadline_at ?? null,
      tatBreachedAt: row.tat_breached_at ?? null,
      agingBusinessDays: row.aging_business_days ?? null,
      nearBreach: Boolean(row.near_breach),
      isTatBreached: Boolean(row.is_tat_breached),
      requestCreatedAt: row.request_created_at ?? null,
      executedAt: metadata?.executedAt ?? null,
      legalEffectiveDate: row.legal_effective_date ?? null,
      legalTerminationDate: row.legal_termination_date ?? null,
      legalNoticePeriod: row.legal_notice_period ?? null,
      legalAutoRenewal: row.legal_auto_renewal ?? null,
      departmentId: row.department_id ?? null,
      departmentName: metadata?.departmentName ?? null,
      assignedToUsers: metadata?.assignedToUsers ?? [row.current_assignee_email],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private async resolveListContractEnrichment(
    tenantId: string,
    rows: Array<{
      id: string
      uploaded_by_employee_id: string
      uploaded_by_email: string
    }>
  ): Promise<{
    creatorNameByContractId: Map<string, string | null>
    executedAtByContractId: Map<string, string | null>
  }> {
    const creatorNameByContractId = new Map<string, string | null>()
    const executedAtByContractId = new Map<string, string | null>()

    if (rows.length === 0) {
      return { creatorNameByContractId, executedAtByContractId }
    }

    const supabase = createServiceSupabase()
    const contractIds = Array.from(new Set(rows.map((row) => row.id)))
    const uploaderIds = Array.from(new Set(rows.map((row) => row.uploaded_by_employee_id).filter(Boolean)))

    const [usersResult, signatoriesResult] = await Promise.all([
      uploaderIds.length > 0
        ? supabase.from('users').select('id, full_name').eq('tenant_id', tenantId).in('id', uploaderIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
      contractIds.length > 0
        ? supabase
            .from('contract_signatories')
            .select('contract_id, status, signed_at')
            .eq('tenant_id', tenantId)
            .in('contract_id', contractIds)
            .is('deleted_at', null)
        : Promise.resolve({
            data: [] as Array<{ contract_id: string; status: string; signed_at: string | null }>,
            error: null,
          }),
    ])

    if (usersResult.error) {
      throw new DatabaseError('Failed to resolve creator names for contracts', new Error(usersResult.error.message), {
        code: usersResult.error.code,
      })
    }

    if (signatoriesResult.error) {
      if (
        !this.isMissingRelationError(signatoriesResult.error, 'contract_signatories') &&
        !this.isMissingColumnError(signatoriesResult.error, 'contract_signatories')
      ) {
        throw new DatabaseError(
          'Failed to resolve executed timestamps for contracts',
          new Error(signatoriesResult.error.message),
          {
            code: signatoriesResult.error.code,
          }
        )
      }
    }

    const creatorNameByEmployeeId = new Map<string, string | null>()
    for (const userRow of (usersResult.data ?? []) as Array<{ id: string; full_name: string | null }>) {
      creatorNameByEmployeeId.set(userRow.id, userRow.full_name ?? null)
    }

    for (const row of rows) {
      creatorNameByContractId.set(row.id, creatorNameByEmployeeId.get(row.uploaded_by_employee_id) ?? null)
    }

    const signatoryRows = (signatoriesResult.data ?? []) as Array<{
      contract_id: string
      status: string
      signed_at: string | null
    }>

    const signatoryAggregateByContractId = new Map<
      string,
      {
        hasSignatories: boolean
        allSigned: boolean
        latestSignedAt: string | null
      }
    >()

    for (const contractId of contractIds) {
      signatoryAggregateByContractId.set(contractId, {
        hasSignatories: false,
        allSigned: true,
        latestSignedAt: null,
      })
    }

    for (const signatoryRow of signatoryRows) {
      const aggregate = signatoryAggregateByContractId.get(signatoryRow.contract_id)
      if (!aggregate) {
        continue
      }

      aggregate.hasSignatories = true

      if (signatoryRow.status !== contractSignatoryStatuses.signed || !signatoryRow.signed_at) {
        aggregate.allSigned = false
      }

      if (signatoryRow.signed_at && (!aggregate.latestSignedAt || signatoryRow.signed_at > aggregate.latestSignedAt)) {
        aggregate.latestSignedAt = signatoryRow.signed_at
      }
    }

    for (const contractId of contractIds) {
      const aggregate = signatoryAggregateByContractId.get(contractId)
      const executedAt =
        aggregate && aggregate.hasSignatories && aggregate.allSigned && aggregate.latestSignedAt
          ? aggregate.latestSignedAt
          : null
      executedAtByContractId.set(contractId, executedAt)
    }

    return { creatorNameByContractId, executedAtByContractId }
  }

  private resolveDepartmentName(department: RepositoryJoinedContractRow['department']): string | null {
    if (!department) {
      return null
    }

    if (Array.isArray(department)) {
      return department[0]?.name ?? null
    }

    return department.name ?? null
  }

  private buildAssignmentMapFromJoinedRows(rows: RepositoryJoinedContractRow[], role?: string): Map<string, string[]> {
    const assignmentMap = new Map<string, string[]>()

    for (const row of rows) {
      if (role === 'LEGAL_TEAM') {
        const collaboratorEmails = (row.legal_collaborators ?? [])
          .filter((item) => !item.deleted_at)
          .map((item) => item.collaborator_email)

        if (collaboratorEmails.length > 0) {
          assignmentMap.set(row.id, Array.from(new Set(collaboratorEmails)))
        }
        continue
      }

      const assignmentEmails = (row.assignments ?? []).filter((item) => !item.deleted_at).map((item) => item.user_email)

      if (assignmentEmails.length > 0) {
        assignmentMap.set(row.id, Array.from(new Set(assignmentEmails)))
      }
    }

    return assignmentMap
  }

  private buildAdditionalApproverContextFromJoinedRows(
    rows: RepositoryJoinedContractRow[],
    actorEmployeeId: string,
    actionableContractIds: string[]
  ): Map<string, AdditionalApproverContractContext> {
    const actionableSet = new Set(actionableContractIds)
    const contextMap = new Map<string, AdditionalApproverContractContext>()

    for (const row of rows) {
      const approvers = (row.additional_approvers ?? []).filter((item) => !item.deleted_at)
      const hasPendingAdditionalApprovers = approvers.some((item) => item.status === 'PENDING')
      const latestRejected = approvers
        .filter((item) => item.status === 'REJECTED')
        .sort((left, right) => {
          const leftTs = left.approved_at ? new Date(left.approved_at).getTime() : 0
          const rightTs = right.approved_at ? new Date(right.approved_at).getTime() : 0
          return rightTs - leftTs
        })[0]

      const pendingApprovers = approvers
        .filter((item) => item.status === 'PENDING')
        .sort((left, right) => left.sequence_order - right.sequence_order)
      const firstPendingApprover = pendingApprovers[0]
      const isActionableInPayload =
        Boolean(firstPendingApprover) && firstPendingApprover?.approver_employee_id === actorEmployeeId

      contextMap.set(row.id, {
        hasPendingAdditionalApprovers,
        latestAdditionalApproverRejectionReason: null,
        latestAdditionalApproverRejectionAt: latestRejected?.approved_at ?? null,
        isAdditionalApproverActionable: actionableSet.has(row.id) || isActionableInPayload,
      })
    }

    return contextMap
  }

  private async getContractAssignmentEmailMap(
    tenantId: string,
    contractIds: string[],
    fallbackRows: Array<{ id: string; current_assignee_email: string }>
  ): Promise<Map<string, string[]>> {
    const assignmentMap = new Map<string, string[]>()

    if (contractIds.length === 0) {
      return assignmentMap
    }

    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_repository_assignments')
      .select('contract_id, user_email')
      .eq('tenant_id', tenantId)
      .in('contract_id', contractIds)
      .is('deleted_at', null)

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        for (const row of fallbackRows) {
          assignmentMap.set(row.id, [row.current_assignee_email])
        }

        return assignmentMap
      }

      throw new DatabaseError('Failed to resolve contract assignments', new Error(error.message), {
        code: error.code,
      })
    }

    for (const assignment of (data ?? []) as Array<{ contract_id: string; user_email: string }>) {
      const existing = assignmentMap.get(assignment.contract_id) ?? []
      if (!existing.includes(assignment.user_email)) {
        existing.push(assignment.user_email)
      }
      assignmentMap.set(assignment.contract_id, existing)
    }

    for (const row of fallbackRows) {
      if (!assignmentMap.has(row.id)) {
        assignmentMap.set(row.id, [row.current_assignee_email])
      }
    }

    return assignmentMap
  }

  private async getContractLegalCollaboratorEmailMap(
    tenantId: string,
    contractRows: Array<{ id: string; current_assignee_email: string }>
  ): Promise<Map<string, string[]>> {
    const assignmentMap = new Map<string, string[]>()

    if (contractRows.length === 0) {
      return assignmentMap
    }

    const contractIds = contractRows.map((row) => row.id)

    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contract_legal_collaborators')
      .select('contract_id, collaborator_email')
      .eq('tenant_id', tenantId)
      .in('contract_id', contractIds)
      .is('deleted_at', null)

    if (error) {
      if (
        this.isMissingRelationError(error, 'contract_legal_collaborators') ||
        this.isMissingColumnError(error, 'contract_legal_collaborators')
      ) {
        return assignmentMap
      }

      throw new DatabaseError('Failed to resolve legal collaborator assignment map', new Error(error.message), {
        code: error.code,
      })
    }

    for (const assignment of (data ?? []) as Array<{ contract_id: string; collaborator_email: string }>) {
      const existing = assignmentMap.get(assignment.contract_id) ?? []
      if (!existing.includes(assignment.collaborator_email)) {
        existing.push(assignment.collaborator_email)
      }
      assignmentMap.set(assignment.contract_id, existing)
    }

    return assignmentMap
  }

  private async getContractLegalMetadataMap(
    tenantId: string,
    contractIds: string[]
  ): Promise<
    Map<
      string,
      {
        legalEffectiveDate: string | null
        legalTerminationDate: string | null
        legalNoticePeriod: string | null
        legalAutoRenewal: boolean | null
      }
    >
  > {
    const legalMetadataMap = new Map<
      string,
      {
        legalEffectiveDate: string | null
        legalTerminationDate: string | null
        legalNoticePeriod: string | null
        legalAutoRenewal: boolean | null
      }
    >()

    if (contractIds.length === 0) {
      return legalMetadataMap
    }

    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('contracts')
      .select('id, legal_effective_date, legal_termination_date, legal_notice_period, legal_auto_renewal')
      .eq('tenant_id', tenantId)
      .in('id', contractIds)
      .is('deleted_at', null)

    if (error) {
      if (this.isMissingColumnError(error, 'contracts')) {
        return legalMetadataMap
      }

      throw new DatabaseError('Failed to resolve legal metadata for repository contracts', new Error(error.message), {
        code: error.code,
      })
    }

    for (const row of (data ?? []) as Array<{
      id: string
      legal_effective_date: string | null
      legal_termination_date: string | null
      legal_notice_period: string | null
      legal_auto_renewal: boolean | null
    }>) {
      legalMetadataMap.set(row.id, {
        legalEffectiveDate: row.legal_effective_date ?? null,
        legalTerminationDate: row.legal_termination_date ?? null,
        legalNoticePeriod: row.legal_notice_period ?? null,
        legalAutoRenewal: row.legal_auto_renewal ?? null,
      })
    }

    return legalMetadataMap
  }

  private async collectRepositoryContractsForReporting(params: {
    tenantId: string
    employeeId: string
    role?: string
    search?: string
    status?: ContractStatus
    repositoryStatus?: ContractRepositoryStatus
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): Promise<
    Array<{
      status: ContractStatus
      repositoryStatus: ContractRepositoryStatus
      departmentId: string | null
      departmentName: string | null
      isTatBreached: boolean
    }>
  > {
    const supabase = createServiceSupabase()
    const dateFilter = this.resolveRepositoryDateFilter({
      dateBasis: params.dateBasis,
      datePreset: params.datePreset,
      fromDate: params.fromDate,
      toDate: params.toDate,
    })
    const visibilityFilter = await this.getVisibilityFilter(params.tenantId, params.role, params.employeeId)
    const workflowStatusesForRepositoryStatus = params.repositoryStatus
      ? repositoryStatusToWorkflowStatuses[params.repositoryStatus]
      : null

    let query = supabase
      .from('contracts_repository_view')
      .select('status, department_id, is_tat_breached')
      .eq('tenant_id', params.tenantId)

    if (params.status) {
      query = query.eq('status', params.status)
    }

    if (workflowStatusesForRepositoryStatus && workflowStatusesForRepositoryStatus.length > 0) {
      query = query.in('status', workflowStatusesForRepositoryStatus)
    }

    if (params.search) {
      query = query.ilike('title', `%${params.search}%`)
    }

    if (dateFilter.fromInclusive) {
      query = query.gte(dateFilter.column, dateFilter.fromInclusive)
    }

    if (dateFilter.toExclusive) {
      query = query.lt(dateFilter.column, dateFilter.toExclusive)
    }

    if (visibilityFilter?.filter) {
      query = query.or(visibilityFilter.filter)
    }

    const { data, error } = await query
    if (error) {
      throw new DatabaseError('Failed to fetch repository report source rows', new Error(error.message), {
        code: error.code,
      })
    }

    const rows = (data ?? []) as Array<{
      status: ContractStatus
      department_id: string | null
      is_tat_breached: boolean | null
    }>

    const departmentIds = Array.from(
      new Set(rows.map((row) => row.department_id).filter((value): value is string => Boolean(value)))
    )

    const departmentNameMap = new Map<string, string>()
    if (departmentIds.length > 0) {
      const { data: departments, error: departmentsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('tenant_id', params.tenantId)
        .in('id', departmentIds)

      if (departmentsError) {
        throw new DatabaseError(
          'Failed to resolve department names for repository report source rows',
          new Error(departmentsError.message),
          {
            code: departmentsError.code,
          }
        )
      }

      for (const department of (departments ?? []) as Array<{ id: string; name: string }>) {
        departmentNameMap.set(department.id, department.name)
      }
    }

    return rows.map((row) => {
      return {
        status: row.status,
        repositoryStatus: resolveRepositoryStatus({ status: row.status }),
        departmentId: row.department_id ?? null,
        departmentName: row.department_id ? (departmentNameMap.get(row.department_id) ?? null) : null,
        isTatBreached: Boolean(row.is_tat_breached),
      }
    })
  }

  private resolveRepositoryDateFilter(params: {
    dateBasis?: RepositoryDateBasis
    datePreset?: RepositoryDatePreset
    fromDate?: string
    toDate?: string
  }): {
    column: RepositoryDateBasis
    fromInclusive?: string
    toExclusive?: string
  } {
    const column = params.dateBasis ?? 'request_created_at'

    const now = new Date()
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    let start: Date | undefined
    let endInclusive: Date | undefined

    if (params.datePreset === 'custom') {
      if (params.fromDate) {
        start = this.parseDateOnly(params.fromDate)
      }

      if (params.toDate) {
        endInclusive = this.parseDateOnly(params.toDate)
      }
    } else if (params.datePreset === 'week') {
      start = this.shiftDays(todayUtc, -6)
      endInclusive = todayUtc
    } else if (params.datePreset === 'month') {
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1))
      endInclusive = todayUtc
    } else if (params.datePreset === 'multiple_months') {
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 2, 1))
      endInclusive = todayUtc
    } else if (params.datePreset === 'quarter') {
      const quarterStartMonth = Math.floor(todayUtc.getUTCMonth() / 3) * 3
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), quarterStartMonth, 1))
      endInclusive = todayUtc
    } else if (params.datePreset === 'year') {
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), 0, 1))
      endInclusive = todayUtc
    }

    return {
      column,
      fromInclusive: start?.toISOString(),
      toExclusive: endInclusive ? this.shiftDays(endInclusive, 1).toISOString() : undefined,
    }
  }

  private parseDateOnly(value: string): Date | undefined {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime())) {
      return undefined
    }

    return parsed
  }

  private shiftDays(date: Date, days: number): Date {
    const shifted = new Date(date)
    shifted.setUTCDate(shifted.getUTCDate() + days)
    return shifted
  }

  private mapDetail(
    row: ContractEntity,
    metadata?: {
      contractTypeName?: string
      departmentName?: string
      departmentHodName?: string | null
      departmentHodEmail?: string | null
    },
    additionalApproverContext?: AdditionalApproverContractContext
  ): ContractDetail {
    this.assertStatus(row.status)

    const status = row.status as ContractStatus

    return {
      id: row.id,
      title: row.title,
      contractTypeId: row.contract_type_id,
      contractTypeName: metadata?.contractTypeName,
      counterpartyName: row.counterparty_name,
      status,
      displayStatusLabel: resolveContractStatusDisplayLabel({
        status,
        hasPendingAdditionalApprovers: additionalApproverContext?.hasPendingAdditionalApprovers ?? false,
      }),
      uploadedByEmployeeId: row.uploaded_by_employee_id,
      uploadedByEmail: row.uploaded_by_email,
      currentAssigneeEmployeeId: row.current_assignee_employee_id,
      currentAssigneeEmail: row.current_assignee_email,
      latestAdditionalApproverRejectionReason:
        additionalApproverContext?.latestAdditionalApproverRejectionReason ?? null,
      latestAdditionalApproverRejectionAt: additionalApproverContext?.latestAdditionalApproverRejectionAt ?? null,
      isAdditionalApproverActionable: additionalApproverContext?.isAdditionalApproverActionable ?? false,
      departmentId: row.department_id,
      departmentName: metadata?.departmentName,
      uploadMode:
        row.upload_mode === contractUploadModes.legalSendForSigning
          ? contractUploadModes.legalSendForSigning
          : contractUploadModes.default,
      departmentHodName: metadata?.departmentHodName,
      departmentHodEmail: metadata?.departmentHodEmail,
      signatoryName: row.signatory_name,
      signatoryDesignation: row.signatory_designation,
      signatoryEmail: row.signatory_email,
      backgroundOfRequest: row.background_of_request,
      budgetApproved: row.budget_approved,
      legalEffectiveDate: row.legal_effective_date ?? null,
      legalTerminationDate: row.legal_termination_date ?? null,
      legalNoticePeriod: row.legal_notice_period ?? null,
      legalAutoRenewal: row.legal_auto_renewal ?? null,
      requestCreatedAt: row.request_created_at,
      voidReason: row.void_reason,
      currentDocumentId: row.current_document_id,
      hodApprovedAt: row.hod_approved_at,
      tatDeadlineAt: row.tat_deadline_at,
      tatBreachedAt: row.tat_breached_at,
      fileName: row.file_name ?? '',
      fileSizeBytes: row.file_size_bytes ?? 0,
      fileMimeType: row.file_mime_type ?? '',
      filePath: row.file_path ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowVersion: row.row_version,
    }
  }

  private encodeCursor(createdAt: string): string {
    return Buffer.from(createdAt).toString('base64')
  }

  private encodeTimestampIdCursor(createdAt: string, id: string): string {
    return Buffer.from(`${createdAt}|${id}`).toString('base64')
  }

  private decodeTimestampIdCursor(cursor?: string): { createdAt: string; id?: string } | null {
    const decoded = this.decodeCursor(cursor)
    if (!decoded) {
      return null
    }

    const [createdAt, id] = decoded.createdAt.split('|')
    if (!createdAt) {
      return null
    }

    const normalizedCreatedAt = createdAt.replace(/\+00:00$/, 'Z')

    if (!id) {
      return { createdAt: normalizedCreatedAt }
    }

    return { createdAt: normalizedCreatedAt, id }
  }

  private decodeCursor(cursor?: string): { createdAt: string } | null {
    if (!cursor) {
      return null
    }

    try {
      const createdAt = Buffer.from(cursor, 'base64').toString('utf8')
      if (!createdAt) {
        return null
      }
      return { createdAt }
    } catch {
      return null
    }
  }

  private assertStatus(status: string): void {
    if (!this.validStatuses.has(status as ContractStatus)) {
      throw new DatabaseError('Invalid contract status found in database', undefined, {
        status,
      })
    }
  }
}

export const supabaseContractQueryRepository = new SupabaseContractQueryRepository()
