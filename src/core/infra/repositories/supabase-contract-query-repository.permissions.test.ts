import { AuthorizationError } from '@/core/http/errors'

jest.mock('@/lib/supabase/service', () => ({
  createServiceSupabase: jest.fn(),
}))

import { supabaseContractQueryRepository } from '@/core/infra/repositories/supabase-contract-query-repository'

describe('supabaseContractQueryRepository action permissions', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('blocks legal action when actor is not current assignee', async () => {
    const getByIdSpy = jest.spyOn(supabaseContractQueryRepository, 'getById')

    getByIdSpy.mockResolvedValue({
      id: 'contract-1',
      title: 'Contract A',
      contractTypeId: 'type-1',
      status: 'LEGAL_PENDING',
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
})
