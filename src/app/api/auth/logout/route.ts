import { NextResponse, type NextRequest } from 'next/server'
import { getAuthService, getAuditLogger } from '@/core/registry/service-registry'
import { withCorrelationId } from '@/core/http/with-correlation-id'
import { errorResponse, okResponse } from '@/core/http/response'
import { authErrorCodes, authErrorMessages } from '@/core/constants/auth-errors'
import { logger } from '@/core/infra/logging/logger'
import { getSession } from '@/core/infra/session/jwt-session-store'

const handleLogout = async (request: NextRequest, correlationId: string) => {
  try {
    const session = await getSession()
    const authService = getAuthService()
    await authService.logout()

    if (session?.tenantId && session.employeeId) {
      const auditLogger = getAuditLogger()
      await auditLogger.logAction({
        tenantId: session.tenantId,
        userId: session.employeeId,
        action: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: session.employeeId,
        metadata: {
          event: 'auth.session.logout',
          correlationId,
        },
      })
    }

    logger.info('User logged out successfully', { correlationId })
    return NextResponse.json(okResponse({ success: true }))
  } catch (error) {
    logger.error('Logout failed', { correlationId, error: String(error) })
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

export const POST = withCorrelationId(handleLogout)
