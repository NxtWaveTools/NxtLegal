/**
 * Integration tests for GET /api/contracts/dashboard
 *
 * Tests: filter forwarding, scope, pagination, includeExtras, error handling.
 */

// ─── Session stub ─────────────────────────────────────────────────────────────

const mockSession = {
  employeeId: 'employee-legal-1',
  tenantId: '00000000-0000-0000-0000-000000000002',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

// ─── Service stub ─────────────────────────────────────────────────────────────

const mockContractQueryService = {
  getDashboardContracts: jest.fn(),
  getActionableAdditionalApprovals: jest.fn(),
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

import { GET } from '@/app/api/contracts/dashboard/route'

type GetRequestArg = Parameters<typeof GET>[0]

const makeRequest = (searchParams: Record<string, string> = {}): GetRequestArg =>
  ({
    nextUrl: {
      pathname: '/api/contracts/dashboard',
      search: new URLSearchParams(searchParams).toString(),
      searchParams: new URLSearchParams(searchParams),
    },
  }) as unknown as GetRequestArg

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/contracts/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockContractQueryService.getDashboardContracts.mockResolvedValue({
      items: [],
      nextCursor: undefined,
      total: 0,
    })

    mockContractQueryService.getActionableAdditionalApprovals.mockResolvedValue([])
  })

  // ──────────────────────── Happy-path ────────────────────────────────────────

  it('returns 200 with contracts list for valid filter', async () => {
    mockContractQueryService.getDashboardContracts.mockResolvedValue({
      items: [{ id: 'c1', status: 'UNDER_REVIEW' }],
      nextCursor: 'next-1',
      total: 7,
    })

    const response = await GET(makeRequest({ filter: 'ALL' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.filter).toBe('ALL')
    expect(body.data.contracts).toHaveLength(1)
    expect(body.data.pagination.total).toBe(7)
    expect(body.data.pagination.cursor).toBe('next-1')
  })

  it('passes tenantId and employeeId to service', async () => {
    await GET(makeRequest({ filter: 'UNDER_REVIEW' }))

    expect(mockContractQueryService.getDashboardContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: mockSession.tenantId,
        employeeId: mockSession.employeeId,
      })
    )
  })

  it('passes filter value to service', async () => {
    await GET(makeRequest({ filter: 'HOD_PENDING' }))

    expect(mockContractQueryService.getDashboardContracts).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'HOD_PENDING' })
    )
  })

  it('passes scope to service when provided', async () => {
    await GET(makeRequest({ filter: 'ALL', scope: 'personal' }))

    expect(mockContractQueryService.getDashboardContracts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'personal' })
    )
  })

  it('defaults scope to "default" when not provided', async () => {
    await GET(makeRequest({ filter: 'ALL' }))

    expect(mockContractQueryService.getDashboardContracts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'default' })
    )
  })

  it('returns null cursor when there is no next page', async () => {
    const response = await GET(makeRequest({ filter: 'ALL' }))
    const body = await response.json()

    expect(body.data.pagination.cursor).toBeNull()
  })

  // ──────────────────────── includeExtras ─────────────────────────────────────

  it('does NOT call getActionableAdditionalApprovals when includeExtras=false', async () => {
    // Note: z.coerce.boolean() uses Boolean(), so string 'false' coerces to true.
    // To actually pass false, omit the field or pass the boolean false directly.
    // URL params are always strings, so includeExtras must be absent to default to false.
    await GET(makeRequest({ filter: 'ALL' }))

    expect(mockContractQueryService.getActionableAdditionalApprovals).not.toHaveBeenCalled()
  })

  it('does NOT include additionalApproverSections when includeExtras omitted', async () => {
    const response = await GET(makeRequest({ filter: 'ALL' }))
    const body = await response.json()

    expect(body.data.additionalApproverSections).toBeUndefined()
  })

  it('fetches and returns additionalApproverSections when includeExtras=true', async () => {
    mockContractQueryService.getActionableAdditionalApprovals.mockResolvedValue([{ id: 'c2', status: 'UNDER_REVIEW' }])

    const response = await GET(makeRequest({ filter: 'ALL', includeExtras: 'true' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockContractQueryService.getActionableAdditionalApprovals).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: mockSession.tenantId,
        employeeId: mockSession.employeeId,
      })
    )
    expect(body.data.additionalApproverSections.actionableContracts).toHaveLength(1)
  })

  // ──────────────────────── Validation errors ──────────────────────────────────

  it('returns 400 when filter is missing', async () => {
    const response = await GET(makeRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when filter is an invalid value', async () => {
    const response = await GET(makeRequest({ filter: 'NONEXISTENT' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when limit exceeds max page size (50)', async () => {
    const response = await GET(makeRequest({ filter: 'ALL', limit: '999' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  // ──────────────────────── Service errors ─────────────────────────────────────

  it('forwards AppError status codes from service', async () => {
    const { AuthorizationError } = jest.requireActual('@/core/http/errors') as typeof import('@/core/http/errors')
    mockContractQueryService.getDashboardContracts.mockRejectedValue(new AuthorizationError('FORBIDDEN', 'Not allowed'))

    const response = await GET(makeRequest({ filter: 'ALL' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 500 for unexpected errors', async () => {
    mockContractQueryService.getDashboardContracts.mockRejectedValue(new Error('DB crash'))

    const response = await GET(makeRequest({ filter: 'ALL' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('returns 500 when getActionableAdditionalApprovals throws an unexpected error', async () => {
    mockContractQueryService.getActionableAdditionalApprovals.mockRejectedValue(new Error('extras fail'))

    const response = await GET(makeRequest({ filter: 'ALL', includeExtras: 'true' }))

    expect(response.status).toBe(500)
  })
})
