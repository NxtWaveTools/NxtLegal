import { AuthorizationError } from '@/core/http/errors'

const mockSession = {
  employeeId: 'legal-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

const mockContractSignatoryService = {
  assignSignatory: jest.fn(),
}

const mockContractQueryService = {
  getContractDetail: jest.fn(),
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
  getContractQueryService: () => mockContractQueryService,
}))

import { POST } from '@/app/api/contracts/[contractId]/signatories/route'

type PostRequestArg = Parameters<typeof POST>[0]
type PostContextArg = Parameters<typeof POST>[1]

describe('Contract signatory assignment route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.tenantId = '00000000-0000-0000-0000-000000000000'
    mockContractQueryService.getContractDetail.mockResolvedValue({
      contract: { status: 'FINAL_APPROVED' },
    })
  })

  it('returns session invalid when tenant is missing', async () => {
    mockSession.tenantId = ''

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'signer@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SESSION_INVALID')
  })

  it('returns contract id required for missing contract id', async () => {
    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'signer@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: {} } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONTRACT_ID_REQUIRED')
  })

  it('returns validation error for invalid signatory payload', async () => {
    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'invalid-email',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(mockContractSignatoryService.assignSignatory).not.toHaveBeenCalled()
  })

  it('returns updated contract detail on success', async () => {
    mockContractSignatoryService.assignSignatory.mockResolvedValueOnce({
      contract: { id: 'contract-1', title: 'Master Service Agreement' },
      documents: [],
      availableActions: [],
      additionalApprovers: [],
      signatories: [
        {
          id: 'sig-1',
          signatoryEmail: 'signer@nxtwave.co.in',
          recipientType: 'EXTERNAL',
          routingOrder: 1,
          fieldConfig: [],
          status: 'PENDING',
        },
      ],
    })

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'signer@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.contract.id).toBe('contract-1')
    expect(mockContractSignatoryService.assignSignatory).toHaveBeenCalledWith({
      tenantId: mockSession.tenantId,
      contractId: 'contract-1',
      actorEmployeeId: mockSession.employeeId,
      actorRole: mockSession.role,
      actorEmail: mockSession.email,
      recipients: [
        {
          signatoryEmail: 'signer@nxtwave.co.in',
          recipientType: 'EXTERNAL',
          routingOrder: 1,
          fields: [],
        },
      ],
    })
  })

  it('returns invalid status when contract is not final approved', async () => {
    mockContractQueryService.getContractDetail.mockResolvedValueOnce({
      contract: { status: 'LEGAL_PENDING' },
    })

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'signer@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SIGNATORY_ASSIGN_INVALID_STATUS')
    expect(mockContractSignatoryService.assignSignatory).not.toHaveBeenCalled()
  })

  it('maps app errors with status and code', async () => {
    mockContractSignatoryService.assignSignatory.mockRejectedValueOnce(
      new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'Denied')
    )

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'signer@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONTRACT_SIGNATORY_FORBIDDEN')
  })

  it('returns provider not configured when integration config is missing', async () => {
    mockContractSignatoryService.assignSignatory.mockRejectedValueOnce(
      new Error('DocuSign config is incomplete. Please set required DOCUSIGN_* environment variables.')
    )

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              signatoryEmail: 'signer@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 1,
              fields: [],
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SIGNATORY_PROVIDER_NOT_CONFIGURED')
  })
})
