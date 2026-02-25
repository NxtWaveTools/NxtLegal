const mockSession = {
  employeeId: 'legal-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

const mockContractQueryService = {
  listFailedNotificationDeliveries: jest.fn(),
}

type MockRequest = {
  nextUrl?: {
    searchParams: URLSearchParams
  }
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

import { GET } from '@/app/api/contracts/notifications/failed/route'

type GetRequestArg = Parameters<typeof GET>[0]

describe('Contract failed notification route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.tenantId = '00000000-0000-0000-0000-000000000000'
    mockSession.role = 'LEGAL_TEAM'
  })

  it('returns session invalid when tenant is missing', async () => {
    mockSession.tenantId = ''

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams() },
    } as unknown as GetRequestArg)

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SESSION_INVALID')
  })

  it('returns forbidden for unsupported roles', async () => {
    mockSession.role = 'POC'

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams() },
    } as unknown as GetRequestArg)

    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONTRACT_NOTIFICATION_READ_FORBIDDEN')
  })

  it('returns failed notification deliveries with pagination', async () => {
    mockContractQueryService.listFailedNotificationDeliveries.mockResolvedValueOnce({
      items: [
        {
          id: 'delivery-1',
          contractId: 'contract-1',
          envelopeId: 'env-1',
          recipientEmail: 'signer@nxtwave.co.in',
          notificationType: 'SIGNATORY_LINK',
          templateId: 101,
          providerName: 'BREVO',
          providerMessageId: null,
          retryCount: 2,
          maxRetries: 2,
          nextRetryAt: null,
          lastError: 'timeout',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      nextCursor: 'cursor-2',
      total: 1,
    })

    const response = await GET({
      nextUrl: {
        searchParams: new URLSearchParams({ limit: '10' }),
      },
    } as unknown as GetRequestArg)

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.pagination.cursor).toBe('cursor-2')
    expect(mockContractQueryService.listFailedNotificationDeliveries).toHaveBeenCalledWith({
      tenantId: mockSession.tenantId,
      cursor: undefined,
      limit: 10,
      contractId: undefined,
    })
  })

  it('returns validation error for invalid contractId query', async () => {
    const response = await GET({
      nextUrl: {
        searchParams: new URLSearchParams({ contractId: 'invalid' }),
      },
    } as unknown as GetRequestArg)

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
