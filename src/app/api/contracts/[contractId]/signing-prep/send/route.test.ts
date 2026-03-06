import { BusinessRuleError } from '@/core/http/errors'

const mockSession = {
  employeeId: 'legal-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

const mockContractSignatoryService = {
  sendSigningPreparationDraft: jest.fn(),
}

type MockRequest = {
  json?: () => Promise<unknown>
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
  getContractSignatoryService: () => mockContractSignatoryService,
}))

import { POST } from '@/app/api/contracts/[contractId]/signing-prep/send/route'

type PostRequestArg = Parameters<typeof POST>[0]
type PostContextArg = Parameters<typeof POST>[1]

describe('Contract signing prep send route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.tenantId = '00000000-0000-0000-0000-000000000000'
  })

  it('returns session invalid when tenant is missing', async () => {
    mockSession.tenantId = ''

    const response = await POST({} as PostRequestArg, { params: { contractId: 'contract-1' } } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SESSION_INVALID')
  })

  it('returns contract id required for missing contract id', async () => {
    const response = await POST({} as PostRequestArg, { params: {} } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONTRACT_ID_REQUIRED')
  })

  it('returns envelope details on success', async () => {
    mockContractSignatoryService.sendSigningPreparationDraft.mockResolvedValueOnce({
      envelopeId: 'env-1',
      contractView: {
        contract: { id: 'contract-1', status: 'SIGNING' },
        documents: [],
        availableActions: [],
        additionalApprovers: [],
        signatories: [],
      },
    })

    const response = await POST({} as PostRequestArg, { params: { contractId: 'contract-1' } } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.envelopeId).toBe('env-1')
    expect(mockContractSignatoryService.sendSigningPreparationDraft).toHaveBeenCalledWith({
      tenantId: mockSession.tenantId,
      contractId: 'contract-1',
      actorEmployeeId: mockSession.employeeId,
      actorRole: mockSession.role,
      actorEmail: mockSession.email,
    })
  })

  it('maps app errors with status and code', async () => {
    mockContractSignatoryService.sendSigningPreparationDraft.mockRejectedValueOnce(
      new BusinessRuleError('SIGNING_PREPARATION_DRAFT_NOT_FOUND', 'Draft missing')
    )

    const response = await POST({} as PostRequestArg, { params: { contractId: 'contract-1' } } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SIGNING_PREPARATION_DRAFT_NOT_FOUND')
  })
})
