import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { getAuthService, getIdempotencyService, getAuditLogger } from '@/core/registry/service-registry'
import { withCorrelationId } from '@/core/http/with-correlation-id'
import { LoginSchema } from '@/core/domain/auth/schemas/auth-schemas'
import { errorResponse, okResponse } from '@/core/http/response'
import { logger } from '@/core/infra/logging/logger'
import { rateLimiter } from '@/core/infra/rate-limiting/simple-rate-limiter'
import { limits } from '@/core/constants/limits'
import { getTenantIdFromHeader } from '@/core/constants/tenants'
import { authErrorCodes, authErrorMessages } from '@/core/constants/auth-errors'
import { sanitizeZodError } from '@/core/http/error-sanitizer'
import { accountLockoutService } from '@/core/infra/security/account-lockout-service'
import { sanitizeRateLimitKey, validateEmployeeId } from '@/core/http/input-validator'
import { isAppError } from '@/core/http/errors'
const handleLogin = async (request: NextRequest, correlationId: string) => {
  // Cache parsed body to avoid double-read issues
  let parsedBody: unknown
  let tenantId: string = ''
  let ip: string = 'unknown'

  try {
    // Get IP address for rate limiting
    ip = request.headers.get('x-forwarded-for') || 'unknown'

    parsedBody = await request.json()

    // Validate input with Zod
    const { employeeId: rawEmployeeId, password } = LoginSchema.parse(parsedBody)

    // ✅ SECURITY: Normalize and validate employee ID format
    const employeeId = validateEmployeeId(rawEmployeeId)

    // Extract and validate tenant ID from request header
    tenantId = getTenantIdFromHeader(request.headers.get('X-Tenant-ID'), { allowDefault: true })

    // SECURITY: Check account lockout status first
    if (accountLockoutService.isLocked(tenantId, employeeId)) {
      const remainingSeconds = accountLockoutService.getLockoutRemainingSeconds(tenantId, employeeId)
      logger.warn('Login attempt on locked account', {
        correlationId,
        tenantId,
        employeeId,
        remainingSeconds,
      })
      return NextResponse.json(
        errorResponse(
          authErrorCodes.accountInactive,
          `Account temporarily locked due to too many failed attempts. Try again in ${remainingSeconds} seconds.`
        ),
        {
          status: 403,
          headers: {
            'Retry-After': String(remainingSeconds),
            'X-Correlation-ID': correlationId,
          },
        }
      )
    }

    // Check for idempotency key - if provided, check for duplicate requests
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (idempotencyKey) {
      const idempotencyService = getIdempotencyService()
      const existingResponse = await idempotencyService.getIfExists(idempotencyKey, tenantId)
      if (existingResponse) {
        logger.info('Idempotent request detected - returning cached response', {
          correlationId,
          idempotencyKey,
          employeeId,
        })
        return NextResponse.json(existingResponse.responseData, { status: existingResponse.statusCode })
      }
    }

    // ✅ SECURITY: Sanitize rate limit key to prevent injection attacks
    const rateLimitKey = sanitizeRateLimitKey(`ratelimit:login:${ip}:${employeeId}`)
    const { allowed, resetAfterSeconds } = rateLimiter.checkLimit(rateLimitKey, limits.maxLoginAttempts, 60)

    if (!allowed) {
      logger.warn('Login rate limit exceeded', { correlationId, ip, employeeId })
      return NextResponse.json(
        errorResponse(
          authErrorCodes.rateLimitExceeded,
          authErrorMessages[authErrorCodes.rateLimitExceeded] ?? 'Too many login attempts. Please try again later.'
        ),
        {
          status: 429,
          headers: {
            'Retry-After': String(resetAfterSeconds),
            'X-Correlation-ID': correlationId,
          },
        }
      )
    }

    const authService = getAuthService()
    const result = await authService.loginWithPassword({ employeeId, password }, tenantId)

    // Clear account lockout on successful login
    accountLockoutService.clearFailedAttempts(tenantId, employeeId)

    // Log successful login for audit trail
    const auditLogger = getAuditLogger()
    await auditLogger.logLogin(tenantId, result.employee.employeeId, 'password')

    const responseData = okResponse({ employee: result.employee })
    logger.info('User logged in successfully', { correlationId, employeeId, ip })

    // Store successful response for idempotency if key was provided
    if (idempotencyKey) {
      const idempotencyService = getIdempotencyService()
      await idempotencyService.store(idempotencyKey, tenantId, responseData, 200)
    }

    return NextResponse.json(responseData)
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      // Log full details server-side
      logger.warn('Login validation failed', {
        correlationId,
        validationErrors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      })

      // Sanitize error response for client (hides internals in production)
      const sanitized = sanitizeZodError(error)
      return NextResponse.json(
        errorResponse(authErrorCodes.validationError, sanitized.message, {
          ...(sanitized.errors && { errors: sanitized.errors }),
          correlationId,
        }),
        { status: 400 }
      )
    }

    // Handle auth service errors
    const errorCode = isAppError(error) ? error.code : authErrorCodes.authFailed
    const message = isAppError(error) ? error.message : authErrorMessages[errorCode as keyof typeof authErrorMessages]
    const status = isAppError(error) ? error.statusCode : 500

    logger.warn('Login failed', {
      correlationId,
      errorCode,
      status,
      tenantId,
      ip,
      metadata: isAppError(error) ? error.metadata : undefined,
    })

    // Record failed attempt for account lockout (only for auth failures, not validation errors)
    let lockoutStatus: { shouldLock: boolean; attemptsRemaining: number; lockedUntilSeconds: number } | null = null
    if (status === 401 && typeof parsedBody === 'object' && parsedBody !== null && 'employeeId' in parsedBody) {
      const employeeIdValue = String(parsedBody.employeeId)
      lockoutStatus = accountLockoutService.recordFailedAttempt(tenantId, employeeIdValue)

      if (lockoutStatus.shouldLock) {
        logger.warn('Account locked after too many failed attempts', {
          correlationId,
          tenantId,
          employeeId: employeeIdValue,
          lockedUntilSeconds: lockoutStatus.lockedUntilSeconds,
        })
      }
    }

    if (status === 401 || status === 403) {
      try {
        const auditLogger = getAuditLogger()
        // Use cached parsed body to avoid double-read
        const employeeIdValue =
          typeof parsedBody === 'object' && parsedBody !== null && 'employeeId' in parsedBody
            ? String(parsedBody.employeeId)
            : 'unknown'
        await auditLogger.logAction({
          tenantId,
          userId: employeeIdValue,
          action: 'auth.login',
          resourceType: 'auth_session',
          resourceId: employeeIdValue,
          metadata: { status: 'failed', reason: errorCode },
        })
      } catch (auditError) {
        logger.warn('Failed to log auth failure to audit trail', { correlationId, auditError: String(auditError) })
      }
    }

    if (status === 500) {
      logger.error('Login failed with server error', { correlationId, error: String(error), errorCode })
    }

    return NextResponse.json(
      errorResponse(errorCode, message ?? authErrorMessages[authErrorCodes.authFailed], { correlationId }),
      {
        status,
      }
    )
  }
}

export const POST = withCorrelationId(handleLogin)
