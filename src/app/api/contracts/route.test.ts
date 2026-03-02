/**
 * Integration tests for GET /api/contracts
 *
 * Tests: pagination, tenant isolation, auth enforcement, error handling.
 * withAuth is mocked so we control session. Service is mocked so no DB is hit.
 */

// ─── Session stub ─────────────────────────────────────────────────────────────

const mockSession = {
  employeeId: 'employee-legal-1',
  tenantId: '00000000-0000-0000-0000-000000000001',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

// ─── Service stub ─────────────────────────────────────────────────────────────

const mockContractQueryService = {
  listContracts: jest.fn(),
}

// ─── Mocks (hoisted before import) ───────────────────────────────────────────

type MockAuthHandler = (
  request: { nextUrl: { pathname: string; searchParams: URLSearchParams; search: string } },
  context: { session: typeof mockSession }
) => unknown

jest.mock('@/core/http/with-auth', () => ({
  withAuth:
    (handler: MockAuthHandler) =>
    async (
      request: { nextUrl: { pathname: string; searchParams: URLSearchParams; search: string } },
      context: { params?: Record<string, string> } = {}
    ) =>
      handler(request, { session: mockSession }),
}))

jest.mock('@/core/registry/service-registry', () => ({
  getContractQueryService: () => mockContractQueryService,
}))

jest.mock('@/core/infra/logging/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GET } from '@/app/api/contracts/route'

type GetRequestArg = Parameters<typeof GET>[0]

const makeRequest = (searchParams: Record<string, string> = {}): GetRequestArg =>
  ({
    nextUrl: {
      pathname: '/api/contracts',
      search: new URLSearchParams(searchParams).toString(),
      searchParams: new URLSearchParams(searchParams),
    },
  }) as unknown as GetRequestArg

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns paginated contract list with 200', async () => {
    mockContractQueryService.listContracts.mockResolvedValue({
      items: [{ id: 'contract-1', title: 'MSA', status: 'UNDER_REVIEW' }],
      nextCursor: 'cursor-abc',
      total: 42,
    })

    const response = await GET(makeRequest({ limit: '10' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.contracts).toHaveLength(1)
    expect(body.data.pagination.total).toBe(42)
    expect(body.data.pagination.cursor).toBe('cursor-abc')
    expect(body.data.pagination.limit).toBe(10)
  })

  it('passes tenantId from session to service (tenant isolation)', async () => {
    mockContractQueryService.listContracts.mockResolvedValue({ items: [], nextCursor: undefined, total: 0 })

    await GET(makeRequest())

    expect(mockContractQueryService.listContracts).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: mockSession.tenantId })
    )
  })

  it('passes role from session to service', async () => {
    mockContractQueryService.listContracts.mockResolvedValue({ items: [], nextCursor: undefined, total: 0 })

    await GET(makeRequest())

    expect(mockContractQueryService.listContracts).toHaveBeenCalledWith(expect.objectContaining({ role: 'LEGAL_TEAM' }))
  })

  it('returns null cursor when no more pages', async () => {
    mockContractQueryService.listContracts.mockResolvedValue({ items: [], nextCursor: undefined, total: 0 })

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.data.pagination.cursor).toBeNull()
  })

  it('returns 400 for invalid limit parameter', async () => {
    const response = await GET(makeRequest({ limit: 'not-a-number' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when limit exceeds page size max', async () => {
    const response = await GET(makeRequest({ limit: '9999' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  it('forwards AppError status codes from service', async () => {
    const { AuthorizationError } = jest.requireActual('@/core/http/errors') as typeof import('@/core/http/errors')
    mockContractQueryService.listContracts.mockRejectedValue(new AuthorizationError('FORBIDDEN', 'Access denied'))

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 500 for unexpected errors', async () => {
    mockContractQueryService.listContracts.mockRejectedValue(new Error('Unexpected DB error'))

    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
  })

  it('uses cursor from query params for continuation page', async () => {
    mockContractQueryService.listContracts.mockResolvedValue({ items: [], nextCursor: undefined, total: 5 })

    await GET(makeRequest({ cursor: 'prev-cursor', limit: '10' }))

    expect(mockContractQueryService.listContracts).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'prev-cursor' })
    )
  })
})
