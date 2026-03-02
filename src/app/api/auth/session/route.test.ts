/**
 * Integration tests for GET /api/auth/session
 *
 * Tests: authenticated session, unauthenticated, service errors.
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CORRELATION_ID = 'test-correlation-id-session'

const mockEmployee = {
  employeeId: 'emp-1',
  tenantId: '00000000-0000-0000-0000-000000000001',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

// ─── Service stubs ────────────────────────────────────────────────────────────

const mockAuthService = {
  getSession: jest.fn(),
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/core/http/with-correlation-id', () => ({
  withCorrelationId: (handler: (req: unknown, id: string) => unknown) => (req: unknown) => handler(req, CORRELATION_ID),
}))

jest.mock('@/core/registry/service-registry', () => ({
  getAuthService: () => mockAuthService,
}))

jest.mock('@/core/infra/logging/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GET } from '@/app/api/auth/session/route'

type GetRequestArg = Parameters<typeof GET>[0]

const makeRequest = (): GetRequestArg => ({}) as unknown as GetRequestArg

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ──────────────────────── Authenticated ─────────────────────────────────────

  it('returns authenticated=true with employee data when session is active', async () => {
    mockAuthService.getSession.mockResolvedValue(mockEmployee)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.authenticated).toBe(true)
    expect(body.data.employee.employeeId).toBe('emp-1')
    expect(body.data.employee.email).toBe('legal@nxtwave.co.in')
  })

  it('includes role in the returned employee object', async () => {
    mockAuthService.getSession.mockResolvedValue(mockEmployee)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.data.employee.role).toBe('LEGAL_TEAM')
  })

  it('includes tenantId in the returned employee object', async () => {
    mockAuthService.getSession.mockResolvedValue(mockEmployee)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.data.employee.tenantId).toBe(mockEmployee.tenantId)
  })

  // ──────────────────────── Unauthenticated ────────────────────────────────────

  it('returns authenticated=false with 200 when no session exists', async () => {
    mockAuthService.getSession.mockResolvedValue(null)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.authenticated).toBe(false)
    expect(body.data.employee).toBeUndefined()
  })

  it('does not include employee key when session is null', async () => {
    mockAuthService.getSession.mockResolvedValue(null)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(Object.keys(body.data)).not.toContain('employee')
  })

  // ──────────────────────── Error handling ─────────────────────────────────────

  it('returns authenticated=false (not 500) when session retrieval throws', async () => {
    mockAuthService.getSession.mockRejectedValue(new Error('JWT decode failed'))

    const response = await GET(makeRequest())
    const body = await response.json()

    // Route returns 200 + { authenticated: false } on errors — "graceful degradation"
    expect(response.status).toBe(200)
    expect(body.data.authenticated).toBe(false)
  })

  it('does not expose the error message to the client when getSession throws', async () => {
    mockAuthService.getSession.mockRejectedValue(new Error('Internal token error'))

    const response = await GET(makeRequest())
    const body = await response.json()

    const bodyString = JSON.stringify(body)
    expect(bodyString).not.toContain('Internal token error')
  })
})
