import { BusinessRuleError } from '@/core/http/errors'

const mockSession = {
  employeeId: 'legal-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

const mockContractQueryService = {
  saveSigningPreparationDraft: jest.fn(),
  getSigningPreparationDraft: jest.fn(),
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
  getContractQueryService: () => mockContractQueryService,
}))

import { GET, POST } from '@/app/api/contracts/[contractId]/signing-preparation-draft/route'

type PostRequestArg = Parameters<typeof POST>[0]
type PostContextArg = Parameters<typeof POST>[1]
type GetRequestArg = Parameters<typeof GET>[0]
type GetContextArg = Parameters<typeof GET>[1]

describe('Contract signing preparation draft route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.tenantId = '00000000-0000-0000-0000-000000000000'
  })

  it('saves draft when contract is FINAL_APPROVED', async () => {
    mockContractQueryService.saveSigningPreparationDraft.mockResolvedValueOnce({
      contractId: 'contract-1',
      recipients: [
        {
          name: 'Shriya Mattoo',
          email: 'shriya@example.com',
          recipientType: 'INTERNAL',
          routingOrder: 1,
        },
      ],
      fields: [
        {
          fieldType: 'SIGNATURE',
          pageNumber: 1,
          xPosition: 100,
          yPosition: 200,
          anchorString: null,
          assignedSignerEmail: 'shriya@example.com',
        },
      ],
      createdByEmployeeId: 'legal-user-id',
      updatedByEmployeeId: 'legal-user-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              name: 'Shriya Mattoo',
              email: 'shriya@example.com',
              recipient_type: 'INTERNAL',
              routing_order: 1,
            },
          ],
          fields: [
            {
              field_type: 'SIGNATURE',
              page_number: 1,
              x_position: 100,
              y_position: 200,
              assigned_signer_email: 'shriya@example.com',
            },
          ],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockContractQueryService.saveSigningPreparationDraft).toHaveBeenCalledWith({
      tenantId: mockSession.tenantId,
      contractId: 'contract-1',
      actorEmployeeId: mockSession.employeeId,
      actorRole: mockSession.role,
      recipients: [
        {
          name: 'Shriya Mattoo',
          email: 'shriya@example.com',
          recipientType: 'INTERNAL',
          routingOrder: 1,
        },
      ],
      fields: [
        {
          fieldType: 'SIGNATURE',
          pageNumber: 1,
          xPosition: 100,
          yPosition: 200,
          anchorString: null,
          assignedSignerEmail: 'shriya@example.com',
        },
      ],
    })
  })

  it('returns invalid status when contract is not final approved', async () => {
    mockContractQueryService.saveSigningPreparationDraft.mockRejectedValueOnce(
      new BusinessRuleError('SIGNING_PREPARATION_INVALID_STATUS', 'Invalid status')
    )

    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              name: 'Shriya Mattoo',
              email: 'shriya@example.com',
              recipient_type: 'INTERNAL',
              routing_order: 1,
            },
          ],
          fields: [],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SIGNING_PREPARATION_INVALID_STATUS')
  })

  it('returns validation error when field lacks anchor and coordinates', async () => {
    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              name: 'Shriya Mattoo',
              email: 'shriya@example.com',
              recipient_type: 'INTERNAL',
              routing_order: 1,
            },
          ],
          fields: [
            {
              field_type: 'SIGNATURE',
              assigned_signer_email: 'shriya@example.com',
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
    expect(mockContractQueryService.saveSigningPreparationDraft).not.toHaveBeenCalled()
  })

  it('returns validation error when recipient is missing required properties', async () => {
    const response = await POST(
      {
        json: async () => ({
          recipients: [
            {
              email: 'shriya@example.com',
              recipient_type: 'INTERNAL',
              routing_order: 1,
            },
          ],
          fields: [],
        }),
      } as unknown as PostRequestArg,
      { params: { contractId: 'contract-1' } } as PostContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(mockContractQueryService.saveSigningPreparationDraft).not.toHaveBeenCalled()
  })

  it('loads signing preparation draft for same tenant contract', async () => {
    mockContractQueryService.getSigningPreparationDraft.mockResolvedValueOnce({
      contractId: 'contract-1',
      recipients: [],
      fields: [],
      createdByEmployeeId: 'legal-user-id',
      updatedByEmployeeId: 'legal-user-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const response = await GET({} as GetRequestArg, { params: { contractId: 'contract-1' } } as GetContextArg)

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockContractQueryService.getSigningPreparationDraft).toHaveBeenCalledWith({
      tenantId: mockSession.tenantId,
      contractId: 'contract-1',
      actorEmployeeId: mockSession.employeeId,
      actorRole: mockSession.role,
    })
  })
})
