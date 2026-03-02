/**
 * Integration tests for POST /api/auth/login
 *
 * Tests: input validation, rate limiting, account lockout, idempotency,
 * successful login, auth failures, audit logging.
 *
 * IMPORTANT: jest.mock() factories are hoisted before variable declarations,
 * so we use only jest.fn() inline in factories, then retrieve references with
 * jest.requireMock() after the imports to avoid ReferenceError TDZ issues.
 */

// ─── Mocks (factories MUST NOT reference outer const/let variables) ───────────

jest.mock('@/core/http/with-correlation-id', () => ({
  withCorrelationId: (handler: (req: unknown, id: string) => unknown) => (req: unknown) =>
    handler(req, 'test-correlation-id-login'),
}))

jest.mock('@/core/registry/service-registry', () => ({
  getAuthService: jest.fn(),
  getIdempotencyService: jest.fn(),
  getAuditLogger: jest.fn(),
}))

jest.mock('@/core/infra/rate-limiting/simple-rate-limiter', () => ({
  rateLimiter: { checkLimit: jest.fn() },
}))

jest.mock('@/core/infra/security/account-lockout-service', () => ({
  accountLockoutService: {
    isLocked: jest.fn(),
    getLockoutRemainingSeconds: jest.fn(),
    recordFailedAttempt: jest.fn(),
    clearFailedAttempts: jest.fn(),
  },
}))

jest.mock('@/core/constants/tenants', () => ({
  getTenantIdFromHeader: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
}))

jest.mock('@/core/infra/logging/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// error-sanitizer imports app-config → env.server.ts which requires env vars.
// Mock it to prevent the import chain from blowing up in test environments.
jest.mock('@/core/http/error-sanitizer', () => ({
  sanitizeZodError: jest.fn().mockReturnValue({ message: 'Validation failed', errors: [] }),
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/auth/login/route'

// ─── Retrieve mock references (safe — after jest.mock hoisting) ───────────────

const { rateLimiter: mockRateLimiter } = jest.requireMock('@/core/infra/rate-limiting/simple-rate-limiter') as {
  rateLimiter: { checkLimit: jest.Mock }
}

const { accountLockoutService: mockAccountLockoutService } = jest.requireMock(
  '@/core/infra/security/account-lockout-service'
) as {
  accountLockoutService: {
    isLocked: jest.Mock
    getLockoutRemainingSeconds: jest.Mock
    recordFailedAttempt: jest.Mock
    clearFailedAttempts: jest.Mock
  }
}

const {
  getAuthService: mockGetAuthService,
  getIdempotencyService: mockGetIdempotencyService,
  getAuditLogger: mockGetAuditLogger,
} = jest.requireMock('@/core/registry/service-registry') as {
  getAuthService: jest.Mock
  getIdempotencyService: jest.Mock
  getAuditLogger: jest.Mock
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const VALID_EMAIL = 'legal@nxtwave.co.in'
const VALID_PASSWORD = 'Password@123'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const mockUser = {
  id: 'emp-1',
  email: VALID_EMAIL,
  fullName: 'Legal User',
  role: 'LEGAL_TEAM',
  tenantId: TENANT_ID,
}

const mockAuthService = {
  loginWithPassword: jest.fn(),
}

const mockIdempotencyService = {
  getIfExists: jest.fn(),
  store: jest.fn(),
}

const mockAuditLogger = {
  logLogin: jest.fn(),
  logAction: jest.fn(),
}

type PostRequestArg = Parameters<typeof POST>[0]

const makeRequest = (body: unknown, headers: Record<string, string> = {}): PostRequestArg => {
  // Normalize all header keys to lowercase for consistent get() lookups
  const allHeaders: Record<string, string> = {
    'x-forwarded-for': '127.0.0.1',
    'content-type': 'application/json',
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  }

  return {
    json: jest.fn().mockResolvedValue(body),
    headers: {
      get: jest.fn((key: string) => allHeaders[key.toLowerCase()] ?? null),
    },
  } as unknown as PostRequestArg
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Wire service-registry getters to return per-test stubs
    mockGetAuthService.mockReturnValue(mockAuthService)
    mockGetIdempotencyService.mockReturnValue(mockIdempotencyService)
    mockGetAuditLogger.mockReturnValue(mockAuditLogger)

    // Default happy-path stubs
    mockAccountLockoutService.isLocked.mockReturnValue(false)
    mockRateLimiter.checkLimit.mockReturnValue({ allowed: true, resetAfterSeconds: 0 })
    mockIdempotencyService.getIfExists.mockResolvedValue(null)
    mockIdempotencyService.store.mockResolvedValue(undefined)
    mockAuditLogger.logLogin.mockResolvedValue(undefined)
    mockAuditLogger.logAction.mockResolvedValue(undefined)
    mockAccountLockoutService.clearFailedAttempts.mockReturnValue(undefined)
    mockAccountLockoutService.recordFailedAttempt.mockReturnValue({
      shouldLock: false,
      attemptsRemaining: 3,
      lockedUntilSeconds: 0,
    })
    mockAuthService.loginWithPassword.mockResolvedValue({ user: mockUser })
  })

  // ──────────────────────── Happy-path ────────────────────────────────────────

  it('returns 200 with user data on successful login', async () => {
    const response = await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.user.email).toBe(VALID_EMAIL)
  })

  it('logs a successful login audit event', async () => {
    await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))

    expect(mockAuditLogger.logLogin).toHaveBeenCalledWith(TENANT_ID, VALID_EMAIL, 'password')
  })

  it('clears account lockout on successful login', async () => {
    await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))

    expect(mockAccountLockoutService.clearFailedAttempts).toHaveBeenCalledWith(TENANT_ID, VALID_EMAIL)
  })

  // ──────────────────────── Input validation ───────────────────────────────────

  it('returns 400 when email is missing', async () => {
    const response = await POST(makeRequest({ password: VALID_PASSWORD }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  it('returns 400 when password is missing', async () => {
    const response = await POST(makeRequest({ email: VALID_EMAIL }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  it('returns 400 when email format is invalid', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email', password: VALID_PASSWORD }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  it('returns 400 when body is empty', async () => {
    const response = await POST(makeRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
  })

  // ──────────────────────── Account lockout ────────────────────────────────────

  it('returns 403 with Retry-After header when account is locked', async () => {
    mockAccountLockoutService.isLocked.mockReturnValue(true)
    mockAccountLockoutService.getLockoutRemainingSeconds.mockReturnValue(120)

    const response = await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(response.headers.get('Retry-After')).toBe('120')
  })

  it('does not call authService when account is locked', async () => {
    mockAccountLockoutService.isLocked.mockReturnValue(true)
    mockAccountLockoutService.getLockoutRemainingSeconds.mockReturnValue(60)

    await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))

    expect(mockAuthService.loginWithPassword).not.toHaveBeenCalled()
  })

  // ──────────────────────── Rate limiting ─────────────────────────────────────

  it('returns 429 with Retry-After header when rate limited', async () => {
    mockRateLimiter.checkLimit.mockReturnValue({ allowed: false, resetAfterSeconds: 45 })

    const response = await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.ok).toBe(false)
    expect(response.headers.get('Retry-After')).toBe('45')
  })

  // ──────────────────────── Auth failures ─────────────────────────────────────

  it('returns 401 when credentials are invalid', async () => {
    const { AuthenticationError } = jest.requireActual('@/core/http/errors') as typeof import('@/core/http/errors')
    mockAuthService.loginWithPassword.mockRejectedValue(
      new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password')
    )

    const response = await POST(makeRequest({ email: VALID_EMAIL, password: 'WrongPass@1' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
  })

  it('records failed attempt for account lockout on 401', async () => {
    const { AuthenticationError } = jest.requireActual('@/core/http/errors') as typeof import('@/core/http/errors')
    mockAuthService.loginWithPassword.mockRejectedValue(
      new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password')
    )

    await POST(makeRequest({ email: VALID_EMAIL, password: 'WrongPass@1' }))

    expect(mockAccountLockoutService.recordFailedAttempt).toHaveBeenCalledWith(TENANT_ID, VALID_EMAIL)
  })

  it('logs an audit event for 401 auth failures', async () => {
    const { AuthenticationError } = jest.requireActual('@/core/http/errors') as typeof import('@/core/http/errors')
    mockAuthService.loginWithPassword.mockRejectedValue(
      new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password')
    )

    await POST(makeRequest({ email: VALID_EMAIL, password: 'WrongPass@1' }))

    expect(mockAuditLogger.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login' }))
  })

  // ──────────────────────── Idempotency ────────────────────────────────────────

  it('returns cached response when idempotency key matches an existing request', async () => {
    mockIdempotencyService.getIfExists.mockResolvedValue({
      responseData: { ok: true, data: { user: mockUser } },
      statusCode: 200,
    })

    const response = await POST(
      makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }, { 'idempotency-key': 'idem-key-123' })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.user.email).toBe(VALID_EMAIL)
    expect(mockAuthService.loginWithPassword).not.toHaveBeenCalled()
  })

  it('stores the response for idempotency when key is provided and login succeeds', async () => {
    await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }, { 'idempotency-key': 'store-key-456' }))

    expect(mockIdempotencyService.store).toHaveBeenCalledWith(
      'store-key-456',
      TENANT_ID,
      expect.objectContaining({ ok: true }),
      200
    )
  })

  it('does NOT store idempotency when no key is provided', async () => {
    await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))

    expect(mockIdempotencyService.store).not.toHaveBeenCalled()
  })

  // ──────────────────────── Server errors ─────────────────────────────────────

  it('returns 500 for unexpected service errors', async () => {
    mockAuthService.loginWithPassword.mockRejectedValue(new Error('DB connection lost'))

    const response = await POST(makeRequest({ email: VALID_EMAIL, password: VALID_PASSWORD }))

    expect(response.status).toBe(500)
  })
})
