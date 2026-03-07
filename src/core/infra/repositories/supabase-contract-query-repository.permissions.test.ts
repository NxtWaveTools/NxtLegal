import { AuthorizationError } from '@/core/http/errors'

jest.mock('@/lib/supabase/service', () => ({
  createServiceSupabase: jest.fn(),
}))

import { createServiceSupabase } from '@/lib/supabase/service'
import { supabaseContractQueryRepository } from '@/core/infra/repositories/supabase-contract-query-repository'

describe('supabaseContractQueryRepository action permissions', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('blocks legal action when actor is not current assignee', async () => {
    const getByIdSpy = jest.spyOn(supabaseContractQueryRepository, 'getById')
    const collaboratorSpy = jest.spyOn(supabaseContractQueryRepository, 'isLegalCollaborator')
    const canActorAccessSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        canActorAccessContract: (...args: unknown[]) => Promise<boolean>
      },
      'canActorAccessContract'
    )

    collaboratorSpy.mockResolvedValue(false)
    canActorAccessSpy.mockResolvedValue(false)

    getByIdSpy.mockResolvedValue({
      id: 'contract-1',
      title: 'Contract A',
      contractTypeId: 'type-1',
      status: 'UNDER_REVIEW',
      uploadedByEmployeeId: 'poc-1',
      uploadedByEmail: 'poc@nxtwave.co.in',
      currentAssigneeEmployeeId: 'legal-assignee',
      currentAssigneeEmail: 'legal.assignee@nxtwave.co.in',
      departmentId: 'dept-1',
      signatoryName: 'Sig Name',
      signatoryDesignation: 'Manager',
      signatoryEmail: 'sig@nxtwave.co.in',
      backgroundOfRequest: 'Need review',
      budgetApproved: true,
      requestCreatedAt: new Date().toISOString(),
      fileName: 'file.docx',
      fileSizeBytes: 1024,
      fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filePath: 'tenant/contract-1/file.docx',
      rowVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await expect(
      supabaseContractQueryRepository.applyAction({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        action: 'legal.query',
        actorEmployeeId: 'legal-not-assigned',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal.not.assigned@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_ACTION_FORBIDDEN',
    })
  })

  it('blocks mapped department HOD action for send-for-signing when actor is not current assignee', async () => {
    const getByIdSpy = jest.spyOn(supabaseContractQueryRepository, 'getById')
    const canActorAccessSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        canActorAccessContract: (...args: unknown[]) => Promise<boolean>
      },
      'canActorAccessContract'
    )

    canActorAccessSpy.mockResolvedValue(true)

    getByIdSpy.mockResolvedValue({
      id: 'contract-1',
      title: 'Contract A',
      contractTypeId: 'type-1',
      status: 'HOD_PENDING',
      uploadMode: 'LEGAL_SEND_FOR_SIGNING',
      uploadedByEmployeeId: 'legal-team-1',
      uploadedByEmail: 'legalteam@nxtwave.co.in',
      currentAssigneeEmployeeId: 'legal-hod-1',
      currentAssigneeEmail: 'legalhod@nxtwave.co.in',
      departmentId: 'finance-dept-1',
      signatoryName: 'Sig Name',
      signatoryDesignation: 'Manager',
      signatoryEmail: 'sig@nxtwave.co.in',
      backgroundOfRequest: 'Need review',
      budgetApproved: true,
      requestCreatedAt: new Date().toISOString(),
      fileName: 'file.docx',
      fileSizeBytes: 1024,
      fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filePath: 'tenant/contract-1/file.docx',
      rowVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await expect(
      supabaseContractQueryRepository.applyAction({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        action: 'hod.approve',
        actorEmployeeId: 'finance-hod-1',
        actorRole: 'HOD',
        actorEmail: 'financehod@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_ACTION_FORBIDDEN',
    })
  })

  it('blocks signatory assignment for non-legal roles', async () => {
    await expect(
      supabaseContractQueryRepository.addSignatory({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'poc-1',
        actorRole: 'POC',
        actorEmail: 'poc@nxtwave.co.in',
        signatoryEmail: 'signer@nxtwave.co.in',
        recipientType: 'EXTERNAL',
        routingOrder: 1,
        fieldConfig: [],
        zohoSignEnvelopeId: 'env-1',
        zohoSignRecipientId: '1',
        envelopeSourceDocumentId: 'document-1',
      })
    ).rejects.toMatchObject<Partial<AuthorizationError>>({
      code: 'CONTRACT_SIGNATORY_FORBIDDEN',
    })
  })

  it('enforces tenant filter when marking signatory as signed', async () => {
    const eq = jest.fn().mockReturnThis()
    const is = jest.fn().mockReturnThis()
    const select = jest.fn().mockReturnThis()
    const limit = jest.fn().mockResolvedValue({ data: [], error: null })
    const update = jest.fn().mockReturnValue({
      eq,
      is,
      select,
      limit,
    })
    const from = jest.fn().mockReturnValue({ update })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    await supabaseContractQueryRepository.markSignatoryAsSigned({
      tenantId: 'tenant-1',
      envelopeId: 'env-1',
      recipientEmail: 'signer@nxtwave.co.in',
    })

    expect(from).toHaveBeenCalledWith('contract_signatories')
    expect(eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eq).toHaveBeenCalledWith('zoho_sign_envelope_id', 'env-1')
    expect(eq).toHaveBeenCalledWith('status', 'PENDING')
    expect(eq).toHaveBeenCalledWith('signatory_email', 'signer@nxtwave.co.in')
    expect(is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns empty signatories when signatory table is not migrated yet', async () => {
    const order = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "contract_signatories" does not exist',
      },
    })
    const is = jest.fn().mockReturnValue({ order })
    const eqContract = jest.fn().mockReturnValue({ is })
    const eqTenant = jest.fn().mockReturnValue({ eq: eqContract })
    const select = jest.fn().mockReturnValue({ eq: eqTenant })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const result = await supabaseContractQueryRepository.getSignatories('tenant-1', 'contract-1')

    expect(result).toEqual([])
    expect(from).toHaveBeenCalledWith('contract_signatories')
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eqContract).toHaveBeenCalledWith('contract_id', 'contract-1')
  })

  it('enforces tenant-scoped draft upsert when saving signing preparation draft', async () => {
    const getByIdSpy = jest.spyOn(supabaseContractQueryRepository, 'getById')
    getByIdSpy.mockResolvedValue({
      id: 'contract-1',
      title: 'Contract A',
      contractTypeId: 'type-1',
      status: 'COMPLETED',
      uploadedByEmployeeId: 'poc-1',
      uploadedByEmail: 'poc@nxtwave.co.in',
      currentAssigneeEmployeeId: 'legal-1',
      currentAssigneeEmail: 'legal@nxtwave.co.in',
      departmentId: 'dept-1',
      signatoryName: 'Sig Name',
      signatoryDesignation: 'Manager',
      signatoryEmail: 'sig@nxtwave.co.in',
      backgroundOfRequest: 'Need review',
      budgetApproved: true,
      requestCreatedAt: new Date().toISOString(),
      fileName: 'file.docx',
      fileSizeBytes: 1024,
      fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filePath: 'tenant/contract-1/file.docx',
      rowVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const upsert = jest.fn().mockReturnThis()
    const select = jest.fn().mockReturnThis()
    const single = jest.fn().mockResolvedValue({
      data: {
        contract_id: 'contract-1',
        recipients: [],
        fields: [],
        created_by_employee_id: 'legal-1',
        updated_by_employee_id: 'legal-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    })
    const insert = jest.fn().mockResolvedValue({ error: null })
    const from = jest.fn((table: string) => {
      if (table === 'contract_signing_preparation_drafts') {
        return { upsert, select, single }
      }

      if (table === 'audit_logs') {
        return { insert }
      }

      return {}
    })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    await supabaseContractQueryRepository.saveSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      recipients: [],
      fields: [],
    })

    expect(from).toHaveBeenCalledWith('contract_signing_preparation_drafts')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        contract_id: 'contract-1',
      }),
      { onConflict: 'tenant_id,contract_id' }
    )
  })

  it('enforces tenant filter when loading signing preparation draft', async () => {
    const eqContract = jest.fn().mockReturnThis()
    const eqTenant = jest
      .fn()
      .mockReturnValue({ eq: eqContract, maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const select = jest.fn().mockReturnValue({ eq: eqTenant })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    await supabaseContractQueryRepository.getSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
    })

    expect(from).toHaveBeenCalledWith('contract_signing_preparation_drafts')
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eqContract).toHaveBeenCalledWith('contract_id', 'contract-1')
  })

  it('returns null when signing preparation draft table is missing via PostgREST code', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST205',
        message: 'Could not find the table public.contract_signing_preparation_drafts in schema cache',
      },
    })
    const eqContract = jest.fn().mockReturnValue({ maybeSingle })
    const eqTenant = jest.fn().mockReturnValue({ eq: eqContract })
    const select = jest.fn().mockReturnValue({ eq: eqTenant })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const result = await supabaseContractQueryRepository.getSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
    })

    expect(result).toBeNull()
    expect(from).toHaveBeenCalledWith('contract_signing_preparation_drafts')
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eqContract).toHaveBeenCalledWith('contract_id', 'contract-1')
  })

  it('allows read access for historical additional approver participant', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'approver-row-1' },
      error: null,
    })
    const limit = jest.fn().mockReturnValue({ maybeSingle })
    const is = jest.fn().mockReturnValue({ limit })
    const eqApprover = jest.fn().mockReturnValue({ is })
    const eqContract = jest.fn().mockReturnValue({ eq: eqApprover })
    const eqTenant = jest.fn().mockReturnValue({ eq: eqContract })
    const select = jest.fn().mockReturnValue({ eq: eqTenant })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const canAccess = await supabaseContractQueryRepository.canAccessContract({
      tenantId: 'tenant-1',
      actorEmployeeId: 'employee-1',
      actorRole: 'USER',
      contract: {
        id: 'contract-1',
        title: 'Contract A',
        contractTypeId: 'type-1',
        status: 'COMPLETED',
        uploadedByEmployeeId: 'poc-1',
        uploadedByEmail: 'poc@nxtwave.co.in',
        currentAssigneeEmployeeId: 'legal-1',
        currentAssigneeEmail: 'legal@nxtwave.co.in',
        departmentId: 'dept-1',
        signatoryName: 'Sig Name',
        signatoryDesignation: 'Manager',
        signatoryEmail: 'sig@nxtwave.co.in',
        backgroundOfRequest: 'Need review',
        budgetApproved: true,
        requestCreatedAt: new Date().toISOString(),
        fileName: 'file.docx',
        fileSizeBytes: 1024,
        fileMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filePath: 'tenant/contract-1/file.docx',
        rowVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })

    expect(canAccess).toBe(true)
    expect(from).toHaveBeenCalledWith('contract_additional_approvers')
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eqContract).toHaveBeenCalledWith('contract_id', 'contract-1')
    expect(eqApprover).toHaveBeenCalledWith('approver_employee_id', 'employee-1')
  })

  it('retains collaborator when email matches current assignee regression', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'collab-1',
          collaborator_employee_id: 'legal-1',
          collaborator_email: 'legal.team@nxtwave.co.in',
          created_at: '2026-02-27T04:30:00.000Z',
        },
      ],
      error: null,
    })
    const is = jest.fn().mockReturnValue({ order })
    const eqContract = jest.fn().mockReturnValue({ is })
    const eqTenant = jest.fn().mockReturnValue({ eq: eqContract })
    const select = jest.fn().mockReturnValue({ eq: eqTenant })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const result = await supabaseContractQueryRepository.getLegalCollaborators('tenant-1', 'contract-1')

    expect(result).toEqual([
      {
        id: 'collab-1',
        collaboratorEmployeeId: 'legal-1',
        collaboratorEmail: 'legal.team@nxtwave.co.in',
        createdAt: '2026-02-27T04:30:00.000Z',
      },
    ])
    expect(from).toHaveBeenCalledWith('contract_legal_collaborators')
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eqContract).toHaveBeenCalledWith('contract_id', 'contract-1')
  })

  it('builds collaborator assignment map without dropping assignee-matching email', async () => {
    const is = jest.fn().mockResolvedValue({
      data: [
        { contract_id: 'contract-1', collaborator_email: 'legal.team@nxtwave.co.in' },
        { contract_id: 'contract-1', collaborator_email: 'legal.team@nxtwave.co.in' },
        { contract_id: 'contract-1', collaborator_email: 'trishanth.reddy@nxtwave.co.in' },
      ],
      error: null,
    })
    const inFilter = jest.fn().mockReturnValue({ is })
    const eq = jest.fn().mockReturnValue({ in: inFilter })
    const select = jest.fn().mockReturnValue({ eq })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const result = await (
      supabaseContractQueryRepository as unknown as {
        getContractLegalCollaboratorEmailMap: (
          tenantId: string,
          contractRows: Array<{ id: string; current_assignee_email: string }>
        ) => Promise<Map<string, string[]>>
      }
    ).getContractLegalCollaboratorEmailMap('tenant-1', [
      { id: 'contract-1', current_assignee_email: 'legal.team@nxtwave.co.in' },
    ])

    expect(result.get('contract-1')).toEqual(['legal.team@nxtwave.co.in', 'trishanth.reddy@nxtwave.co.in'])
  })

  it('returns empty collaborator assignment map when collaborator table is missing', async () => {
    const is = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST205',
        message: 'Could not find relation',
      },
    })
    const inFilter = jest.fn().mockReturnValue({ is })
    const eq = jest.fn().mockReturnValue({ in: inFilter })
    const select = jest.fn().mockReturnValue({ eq })
    const from = jest.fn().mockReturnValue({ select })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const result = await (
      supabaseContractQueryRepository as unknown as {
        getContractLegalCollaboratorEmailMap: (
          tenantId: string,
          contractRows: Array<{ id: string; current_assignee_email: string }>
        ) => Promise<Map<string, string[]>>
      }
    ).getContractLegalCollaboratorEmailMap('tenant-1', [
      { id: 'contract-1', current_assignee_email: 'legal.team@nxtwave.co.in' },
    ])

    expect(result.size).toBe(0)
  })

  it('includes legal users from canonical role assignments in active legal members list', async () => {
    const userRolesIsRolesDeleted = jest.fn().mockResolvedValue({
      data: [{ user_id: 'legal-2' }],
      error: null,
    })
    const userRolesEqRolesIsActive = jest.fn().mockReturnValue({ is: userRolesIsRolesDeleted })
    const userRolesEqRolesRoleKey = jest.fn().mockReturnValue({ eq: userRolesEqRolesIsActive })
    const userRolesIsDeletedAt = jest.fn().mockReturnValue({ eq: userRolesEqRolesRoleKey })
    const userRolesEqIsActive = jest.fn().mockReturnValue({ is: userRolesIsDeletedAt })
    const userRolesEqTenant = jest.fn().mockReturnValue({ eq: userRolesEqIsActive })
    const userRolesSelect = jest.fn().mockReturnValue({ eq: userRolesEqTenant })

    const legacyUsersIsDeletedAt = jest.fn().mockResolvedValue({
      data: [{ id: 'legal-1', email: 'legal.one@nxtwave.co.in', full_name: 'Legal One' }],
      error: null,
    })
    const legacyUsersEqIsActive = jest.fn().mockReturnValue({ is: legacyUsersIsDeletedAt })
    const legacyUsersEqRole = jest.fn().mockReturnValue({ eq: legacyUsersEqIsActive })
    const legacyUsersEqTenant = jest.fn().mockReturnValue({ eq: legacyUsersEqRole })
    const legacyUsersSelect = jest.fn().mockReturnValue({ eq: legacyUsersEqTenant })

    const canonicalUsersInIds = jest.fn().mockResolvedValue({
      data: [{ id: 'legal-2', email: 'legal.two@nxtwave.co.in', full_name: 'Legal Two' }],
      error: null,
    })
    const canonicalUsersIsDeletedAt = jest.fn().mockReturnValue({ in: canonicalUsersInIds })
    const canonicalUsersEqIsActive = jest.fn().mockReturnValue({ is: canonicalUsersIsDeletedAt })
    const canonicalUsersEqTenant = jest.fn().mockReturnValue({ eq: canonicalUsersEqIsActive })
    const canonicalUsersSelect = jest.fn().mockReturnValue({ eq: canonicalUsersEqTenant })

    let usersFromCall = 0
    const from = jest.fn((table: string) => {
      if (table === 'user_roles') {
        return { select: userRolesSelect }
      }

      if (table === 'users') {
        usersFromCall += 1
        if (usersFromCall === 1) {
          return { select: legacyUsersSelect }
        }

        return { select: canonicalUsersSelect }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const members = await supabaseContractQueryRepository.listActiveTenantLegalMembers('tenant-1')

    expect(members).toEqual([
      { id: 'legal-1', email: 'legal.one@nxtwave.co.in', fullName: 'Legal One' },
      { id: 'legal-2', email: 'legal.two@nxtwave.co.in', fullName: 'Legal Two' },
    ])
    expect(canonicalUsersInIds).toHaveBeenCalledWith('id', ['legal-2'])
  })

  it('falls back to legacy legal role when canonical role tables are unavailable', async () => {
    const userRolesIsRolesDeleted = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "user_roles" does not exist',
      },
    })
    const userRolesEqRolesIsActive = jest.fn().mockReturnValue({ is: userRolesIsRolesDeleted })
    const userRolesEqRolesRoleKey = jest.fn().mockReturnValue({ eq: userRolesEqRolesIsActive })
    const userRolesIsDeletedAt = jest.fn().mockReturnValue({ eq: userRolesEqRolesRoleKey })
    const userRolesEqIsActive = jest.fn().mockReturnValue({ is: userRolesIsDeletedAt })
    const userRolesEqTenant = jest.fn().mockReturnValue({ eq: userRolesEqIsActive })
    const userRolesSelect = jest.fn().mockReturnValue({ eq: userRolesEqTenant })

    const legacyUsersIsDeletedAt = jest.fn().mockResolvedValue({
      data: [{ id: 'legal-1', email: 'legacy.legal@nxtwave.co.in', full_name: 'Legacy Legal' }],
      error: null,
    })
    const legacyUsersEqIsActive = jest.fn().mockReturnValue({ is: legacyUsersIsDeletedAt })
    const legacyUsersEqRole = jest.fn().mockReturnValue({ eq: legacyUsersEqIsActive })
    const legacyUsersEqTenant = jest.fn().mockReturnValue({ eq: legacyUsersEqRole })
    const legacyUsersSelect = jest.fn().mockReturnValue({ eq: legacyUsersEqTenant })

    const from = jest.fn((table: string) => {
      if (table === 'user_roles') {
        return { select: userRolesSelect }
      }

      if (table === 'users') {
        return { select: legacyUsersSelect }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const members = await supabaseContractQueryRepository.listActiveTenantLegalMembers('tenant-1')

    expect(members).toEqual([{ id: 'legal-1', email: 'legacy.legal@nxtwave.co.in', fullName: 'Legacy Legal' }])
  })

  it('bypasses global visibility override for dashboard personal scope', async () => {
    const listOr = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'contract-1',
          title: 'Contract A',
          status: 'HOD_PENDING',
          uploaded_by_employee_id: 'poc-1',
          uploaded_by_email: 'poc@nxtwave.co.in',
          current_assignee_employee_id: 'admin-1',
          current_assignee_email: 'legalhod@nxtwave.co.in',
          hod_approved_at: null,
          tat_deadline_at: null,
          tat_breached_at: null,
          aging_business_days: null,
          near_breach: false,
          is_tat_breached: false,
          created_at: '2026-02-27T10:00:00.000Z',
          updated_at: '2026-02-27T10:00:00.000Z',
        },
      ],
      error: null,
    })
    const listBuilder: {
      eq: jest.Mock
      order: jest.Mock
      limit: jest.Mock
      lt: jest.Mock
      in: jest.Mock
      or: jest.Mock
    } = {
      eq: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      lt: jest.fn(),
      in: jest.fn(),
      or: listOr,
    }
    listBuilder.eq.mockReturnValue(listBuilder)
    listBuilder.order.mockReturnValue(listBuilder)
    listBuilder.limit.mockReturnValue(listBuilder)
    listBuilder.lt.mockReturnValue(listBuilder)
    listBuilder.in.mockReturnValue(listBuilder)
    const listSelect = jest.fn().mockReturnValue(listBuilder)

    const totalOr = jest.fn().mockResolvedValue({ count: 1, error: null })
    const totalBuilder: {
      eq: jest.Mock
      in: jest.Mock
      or: jest.Mock
    } = {
      eq: jest.fn(),
      in: jest.fn(),
      or: totalOr,
    }
    totalBuilder.eq.mockReturnValue(totalBuilder)
    totalBuilder.in.mockReturnValue(totalBuilder)
    const totalSelect = jest.fn().mockReturnValue(totalBuilder)

    const from = jest.fn().mockReturnValueOnce({ select: listSelect }).mockReturnValueOnce({ select: totalSelect })

    ;(createServiceSupabase as jest.Mock).mockReturnValue({ from })

    const getEmployeeEmailSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        getEmployeeEmail: (tenantId: string, employeeId: string) => Promise<string | null>
      },
      'getEmployeeEmail'
    )
    getEmployeeEmailSpy.mockResolvedValue('legalhod@nxtwave.co.in')

    const getVisibilityFilterSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        getVisibilityFilter: (tenantId: string, role: string | undefined, employeeId: string) => Promise<string | null>
      },
      'getVisibilityFilter'
    )

    const additionalContextSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        getAdditionalApproverContractContextMap: (
          tenantId: string,
          contractIds: string[],
          employeeId: string
        ) => Promise<Map<string, unknown>>
      },
      'getAdditionalApproverContractContextMap'
    )
    additionalContextSpy.mockResolvedValue(new Map())

    const enrichmentSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        resolveListContractEnrichment: (
          tenantId: string,
          rows: Array<{ id: string; uploaded_by_employee_id: string; uploaded_by_email: string }>
        ) => Promise<{
          creatorNameByContractId: Map<string, string | null>
          executedAtByContractId: Map<string, string | null>
        }>
      },
      'resolveListContractEnrichment'
    )
    enrichmentSpy.mockResolvedValue({
      creatorNameByContractId: new Map(),
      executedAtByContractId: new Map(),
    })

    const attachSignalsSpy = jest.spyOn(
      supabaseContractQueryRepository as unknown as {
        attachActorContractSignals: (
          tenantId: string,
          employeeId: string,
          items: unknown[],
          role?: string
        ) => Promise<unknown[]>
      },
      'attachActorContractSignals'
    )
    attachSignalsSpy.mockImplementation(async (_tenantId, _employeeId, items) => items)

    const result = await supabaseContractQueryRepository.getDashboardContracts({
      tenantId: 'tenant-1',
      employeeId: 'admin-1',
      role: 'ADMIN',
      filter: 'ASSIGNED_TO_ME',
      scope: 'personal',
      limit: 10,
    })

    expect(result.total).toBe(1)
    expect(getVisibilityFilterSpy).not.toHaveBeenCalled()
    expect(listOr).toHaveBeenCalledWith(
      'current_assignee_employee_id.eq.admin-1,current_assignee_email.eq.legalhod@nxtwave.co.in'
    )
    expect(totalOr).toHaveBeenCalledWith(
      'current_assignee_employee_id.eq.admin-1,current_assignee_email.eq.legalhod@nxtwave.co.in'
    )
    expect(listBuilder.eq).toHaveBeenCalledWith('status', 'HOD_PENDING')
    expect(totalBuilder.eq).toHaveBeenCalledWith('status', 'HOD_PENDING')
  })
})
