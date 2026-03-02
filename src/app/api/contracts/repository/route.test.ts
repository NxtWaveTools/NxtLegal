/**
 * Integration tests for GET /api/contracts/repository
 *
 * Tests: default params, filters, includeReport parallel fetch, pagination,
 * role/tenant isolation, validation errors, service errors.
 */

// ─── Session stub ─────────────────────────────────────────────────────────────

const mockSession = {
  employeeId: 'employee-legal-1',
  tenantId: '00000000-0000-0000-0000-000000000003',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

// ─── Service stub ─────────────────────────────────────────────────────────────

const mockContractQueryService = {
  listRepositoryContracts: jest.fn(),
  getRepositoryReport: jest.fn(),
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

import { GET } from '@/app/api/contracts/repository/route'

type GetRequestArg = Parameters<typeof GET>[0]

const makeRequest = (searchParams: Record<string, string> = {}): GetRequestArg =>
  ({
    nextUrl: {
      pathname: '/api/contracts/repository',
      search: new URLSearchParams(searchParams).toString(),
      searchParams: new URLSearchParams(searchParams),
    },
  }) as unknown as GetRequestArg

const defaultListResult = {
  items: [{ id: 'c1', title: 'MSA', status: 'COMPLETED' }],
  nextCursor: undefined,
  total: 1,
}

const defaultReport = {
  totalContracts: 1,
  byStatus: { COMPLETED: 1 },
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/contracts/repository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockContractQueryService.listRepositoryContracts.mockResolvedValue(defaultListResult)
    mockContractQueryService.getRepositoryReport.mockResolvedValue(defaultReport)
  })

  // ──────────────────────── Happy-path (no report) ─────────────────────────────

  it('returns 200 with contracts list and pagination', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.contracts).toHaveLength(1)
    expect(body.data.pagination).toBeDefined()
    expect(body.data.pagination.total).toBe(1)
  })

  it('does not include report when includeReport is not set', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.data.report).toBeUndefined()
    expect(mockContractQueryService.getRepositoryReport).not.toHaveBeenCalled()
  })

  it('passes tenantId from session to listRepositoryContracts', async () => {
    await GET(makeRequest())

    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: mockSession.tenantId })
    )
  })

  it('passes role from session to listRepositoryContracts', async () => {
    await GET(makeRequest())

    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'LEGAL_TEAM' })
    )
  })

  it('returns null cursor when there is no next page', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.data.pagination.cursor).toBeNull()
  })

  it('returns next cursor when more pages are available', async () => {
    mockContractQueryService.listRepositoryContracts.mockResolvedValue({
      items: [],
      nextCursor: 'cursor-xyz',
      total: 100,
    })

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.data.pagination.cursor).toBe('cursor-xyz')
  })

  // ──────────────────────── Filters ────────────────────────────────────────────

  it('forwards search param to service', async () => {
    await GET(makeRequest({ search: 'insurance' }))

    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'insurance' })
    )
  })

  it('forwards status filter to service', async () => {
    await GET(makeRequest({ status: 'COMPLETED' }))

    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED' })
    )
  })

  it('forwards cursor for page continuation', async () => {
    await GET(makeRequest({ cursor: 'some-cursor' }))

    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'some-cursor' })
    )
  })

  // ──────────────────────── includeReport ─────────────────────────────────────

  it('fetches list and report in parallel when includeReport=true', async () => {
    const response = await GET(makeRequest({ includeReport: 'true' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledTimes(1)
    expect(mockContractQueryService.getRepositoryReport).toHaveBeenCalledTimes(1)
    expect(body.data.report).toBeDefined()
    expect(body.data.report.totalContracts).toBe(1)
  })

  it('passes consistent filter params to both list and report calls', async () => {
    await GET(makeRequest({ includeReport: 'true', search: 'nda', status: 'EXECUTED' }))

    expect(mockContractQueryService.listRepositoryContracts).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'nda', status: 'EXECUTED' })
    )
    expect(mockContractQueryService.getRepositoryReport).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'nda', status: 'EXECUTED' })
    )
  })

  // ──────────────────────── Validation errors ──────────────────────────────────

  it('returns 400 for invalid limit parameter', async () => {
    const response = await GET(makeRequest({ limit: 'abc' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when limit exceeds maximum (50)', async () => {
    const response = await GET(makeRequest({ limit: '9999' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  // ──────────────────────── Service errors ─────────────────────────────────────

  it('forwards AppError status code from service', async () => {
    const { AuthorizationError } = jest.requireActual('@/core/http/errors') as typeof import('@/core/http/errors')
    mockContractQueryService.listRepositoryContracts.mockRejectedValue(
      new AuthorizationError('FORBIDDEN', 'Insufficient permissions')
    )

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 500 for unexpected service errors', async () => {
    mockContractQueryService.listRepositoryContracts.mockRejectedValue(new Error('Timeout'))

    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
  })

  it('returns 500 when getRepositoryReport throws while includeReport=true', async () => {
    mockContractQueryService.getRepositoryReport.mockRejectedValue(new Error('Report service unavailable'))

    const response = await GET(makeRequest({ includeReport: 'true' }))

    expect(response.status).toBe(500)
  })
})
