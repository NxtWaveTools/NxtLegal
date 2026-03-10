const mockSession = {
  employeeId: 'employee-1',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

const mockIdempotencyService = {
  claimOrGet: jest.fn(),
  store: jest.fn(),
  releaseClaim: jest.fn(),
}

const mockContractQueryService = {
  applyContractAction: jest.fn(),
  bypassAdditionalApprover: jest.fn(),
}

const mockContractApprovalNotificationService = {
  notifyInternalAssignment: jest.fn(),
  notifyApprovalReceived: jest.fn(),
  notifyReturnedToHod: jest.fn(),
  notifyContractRejected: jest.fn(),
}

const mockContractSignatoryService = {
  recallSigningEnvelopes: jest.fn(),
}

type MockRequest = {
  headers: {
    get: (name: string) => string | null
  }
  json: () => Promise<unknown>
}

type MockContext = {
  params?: Record<string, string>
}

type MockAuthHandler = (
  request: MockRequest,
  context: { session: typeof mockSession; params?: Record<string, string> }
) => unknown

jest.mock('@/core/http/with-auth', () => ({
  withAuth: (handler: MockAuthHandler) => {
    return async (request: MockRequest, context: MockContext = {}) => {
      return handler(request, {
        session: mockSession,
        params: context.params,
      })
    }
  },
}))

jest.mock('@/core/registry/service-registry', () => ({
  getIdempotencyService: () => mockIdempotencyService,
  getContractQueryService: () => mockContractQueryService,
  getContractApprovalNotificationService: () => mockContractApprovalNotificationService,
  getContractSignatoryService: () => mockContractSignatoryService,
}))

import { POST } from '@/app/api/contracts/[contractId]/action/route'

type PostRequestArg = Parameters<typeof POST>[0]
type PostContextArg = Parameters<typeof POST>[1]

describe('Contract action route idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns conflict when same idempotency key is already in progress', async () => {
    mockIdempotencyService.claimOrGet.mockResolvedValue({ status: 'in-progress' })

    const response = await POST(
      {
        headers: {
          get: (name: string) => (name === 'Idempotency-Key' ? 'idem-action-1' : null),
        },
        json: async () => ({ action: 'legal.query' }),
      } as unknown as PostRequestArg,
      { params: { contractId: '33333333-3333-3333-3333-333333333333' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS')
    expect(mockContractQueryService.applyContractAction).not.toHaveBeenCalled()
  })

  it('stores successful action response when idempotency key is provided', async () => {
    mockIdempotencyService.claimOrGet.mockResolvedValue({ status: 'claimed' })
    mockContractQueryService.applyContractAction.mockResolvedValue({
      contract: {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'NDA',
        status: 'UNDER_REVIEW',
        currentAssigneeEmail: 'legal@nxtwave.co.in',
        uploadedByEmail: 'poc@nxtwave.co.in',
        departmentHodEmail: 'hod@nxtwave.co.in',
      },
      counterparties: [],
      documents: [],
      availableActions: [],
      additionalApprovers: [],
      legalCollaborators: [],
      signatories: [],
    })

    const response = await POST(
      {
        headers: {
          get: (name: string) => (name === 'Idempotency-Key' ? 'idem-action-2' : null),
        },
        json: async () => ({ action: 'legal.query' }),
      } as unknown as PostRequestArg,
      { params: { contractId: '33333333-3333-3333-3333-333333333333' } } as PostContextArg
    )

    expect(response.status).toBe(200)
    expect(mockIdempotencyService.store).toHaveBeenCalledWith(
      'idem-action-2',
      mockSession.tenantId,
      expect.objectContaining({ ok: true }),
      200
    )
  })

  it('recalls Zoho envelopes when legal.void is applied', async () => {
    mockIdempotencyService.claimOrGet.mockResolvedValue({ status: 'claimed' })
    mockContractSignatoryService.recallSigningEnvelopes.mockResolvedValue(undefined)
    mockContractQueryService.applyContractAction.mockResolvedValue({
      contract: {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'NDA',
        status: 'VOID',
        currentAssigneeEmail: 'legal@nxtwave.co.in',
        uploadedByEmail: 'poc@nxtwave.co.in',
        departmentHodEmail: 'hod@nxtwave.co.in',
      },
      counterparties: [],
      documents: [],
      availableActions: [],
      additionalApprovers: [],
      legalCollaborators: [],
      signatories: [
        { zohoSignEnvelopeId: 'envelope-1' },
        { zohoSignEnvelopeId: 'envelope-1' },
        { zohoSignEnvelopeId: 'envelope-2' },
      ],
    })

    const response = await POST(
      {
        headers: {
          get: (name: string) => (name === 'Idempotency-Key' ? 'idem-action-3' : null),
        },
        json: async () => ({ action: 'legal.void', noteText: 'Incorrect recipient' }),
      } as unknown as PostRequestArg,
      { params: { contractId: '33333333-3333-3333-3333-333333333333' } } as PostContextArg
    )

    expect(response.status).toBe(200)
    expect(mockContractSignatoryService.recallSigningEnvelopes).toHaveBeenCalledWith({
      tenantId: mockSession.tenantId,
      contractId: '33333333-3333-3333-3333-333333333333',
      envelopeIds: ['envelope-1', 'envelope-2'],
      actorEmployeeId: mockSession.employeeId,
      actorRole: mockSession.role,
      actorEmail: mockSession.email,
      reason: 'Incorrect recipient',
    })
  })
})
