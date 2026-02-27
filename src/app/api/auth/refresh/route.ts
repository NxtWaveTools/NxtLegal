import { NextResponse, type NextRequest } from 'next/server'
import { refreshSession } from '@/core/infra/session/jwt-session-store'
import { getAuditLogger } from '@/core/registry/service-registry'
import { withCorrelationId } from '@/core/http/with-correlation-id'
import { errorResponse, okResponse } from '@/core/http/response'
import { authErrorCodes, authErrorMessages } from '@/core/constants/auth-errors'
import { rateLimiter } from '@/core/infra/rate-limiting/simple-rate-limiter'
import { logger } from '@/core/infra/logging/logger'
import { getTenantIdFromHeader } from '@/core/constants/tenants'
import { sanitizeRateLimitKey } from '@/core/http/input-validator'
import { isAppError } from '@/core/http/errors'

const handleRefresh = async (request: NextRequest, correlationId: string) => {
  try {
    // Get IP address for rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

    const tenantHeader = request.headers.get('X-Tenant-ID')
    let requestTenantId: string | null = null

    if (tenantHeader) {
      try {
        requestTenantId = getTenantIdFromHeader(tenantHeader, { allowDefault: false })
      } catch {
        return NextResponse.json(
          errorResponse(authErrorCodes.validationError, 'Invalid tenant header', { correlationId }),
          {
            status: 400,
            headers: {
              'X-Correlation-ID': correlationId,
            },
          }
        )
      }
    }

    // ✅ SECURITY: Sanitize rate limit key to prevent injection attacks
    const rateLimitKey = sanitizeRateLimitKey(`ratelimit:refresh:${ip}`)
    const { allowed, resetAfterSeconds } = rateLimiter.checkLimit(rateLimitKey, 10, 60)

    if (!allowed) {
      logger.warn('Refresh rate limit exceeded', { correlationId, ip })
      return NextResponse.json(
        errorResponse(
          authErrorCodes.rateLimitExceeded,
          authErrorMessages[authErrorCodes.rateLimitExceeded] ?? 'Too many refresh attempts. Please try again later.',
          { correlationId }
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

    const session = await refreshSession()

    if (!session) {
      logger.warn('Session refresh failed - no valid session', { correlationId })
      return NextResponse.json(
        errorResponse(authErrorCodes.unauthorized, 'Session expired. Please login again.', { correlationId }),
        {
          status: 401,
          headers: {
            'X-Correlation-ID': correlationId,
          },
        }
      )
    }

    // CRITICAL SECURITY: Validate tenant ID from JWT matches request header (when header is provided)
    if (requestTenantId && session.tenantId && session.tenantId !== requestTenantId) {
      logger.error('Tenant ID mismatch in refresh', {
        correlationId,
        requestTenantId,
        sessionTenantId: session.tenantId,
        employeeId: session.employeeId,
      })
      return NextResponse.json(
        errorResponse(authErrorCodes.unauthorized, 'Invalid tenant context', { correlationId }),
        {
          status: 403,
          headers: {
            'X-Correlation-ID': correlationId,
          },
        }
      )
    }

    logger.info('Session refreshed successfully', {
      correlationId,
      employeeId: session.employeeId,
      tenantId: session.tenantId,
    })

    if (session.tenantId && session.employeeId) {
      const auditLogger = getAuditLogger()
      await auditLogger.logAction({
        tenantId: session.tenantId,
        userId: session.employeeId,
        action: 'auth.token_refresh',
        resourceType: 'auth_session',
        resourceId: session.employeeId,
        metadata: {
          event: 'auth.session.refreshed',
          correlationId,
        },
      })
    }

    return NextResponse.json(okResponse({ session }))
  } catch (error) {
    logger.error('Refresh endpoint error', { correlationId, error: String(error) })

    if (isAppError(error)) {
      return NextResponse.json(
        errorResponse(error.code, error.message, {
          correlationId,
          ...(error.metadata ? { metadata: error.metadata } : {}),
        }),
        {
          status: error.statusCode,
          headers: {
            'X-Correlation-ID': correlationId,
          },
        }
      )
    }

    return NextResponse.json(
      errorResponse(authErrorCodes.authFailed, authErrorMessages[authErrorCodes.authFailed], { correlationId }),
      {
        status: 500,
        headers: {
          'X-Correlation-ID': correlationId,
        },
      }
    )
  }
}

export const POST = withCorrelationId(handleRefresh)
