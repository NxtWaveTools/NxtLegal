import 'server-only'

import { v4 as uuidv4 } from 'uuid'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { appConfig } from '@/core/config/app-config'
import { cookieNames } from '@/core/constants/cookies'
import { limits } from '@/core/constants/limits'
import { logger } from '@/core/infra/logging/logger'
import { revokedTokensCache } from '@/core/infra/cache/revoked-tokens-cache'
import { isValidTenantId } from '@/core/constants/tenants'
import { createServiceSupabase } from '@/lib/supabase/service'

export type SessionData = {
  employeeId: string
  email?: string
  fullName?: string
  role?: string
  tenantId?: string
  tokenVersion?: number
}

export type JWTPayload = SessionData & {
  jti: string
  type: TokenType
  iat: number
  exp: number
}

type TokenType = 'access' | 'refresh'

const secretKey = new TextEncoder().encode(appConfig.security.jwtSecretKey)

const getNormalizedTokenVersion = (tokenVersion: number | undefined): number => {
  if (typeof tokenVersion !== 'number' || Number.isNaN(tokenVersion) || tokenVersion < 0) {
    return 0
  }

  return Math.trunc(tokenVersion)
}

const getCurrentTokenVersion = async (employeeId: string, tenantId: string): Promise<number | null> => {
  const supabase = createServiceSupabase()

  const { data, error } = await supabase
    .from('users')
    .select('token_version, is_active, deleted_at')
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) {
    const errorMessage = `${error.message ?? ''}`.toLowerCase()
    if (errorMessage.includes('token_version') && errorMessage.includes('does not exist')) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('users')
        .select('is_active, deleted_at')
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)
        .single()

      if (legacyError) {
        logger.error('Failed to fetch legacy session validation state', {
          employeeId,
          tenantId,
          error: legacyError.message,
          errorCode: legacyError.code,
        })
        return null
      }

      if (!legacyData || legacyData.is_active !== true || legacyData.deleted_at) {
        return null
      }

      logger.warn('Using legacy token version fallback (token_version column missing)', {
        employeeId,
        tenantId,
      })
      return 0
    }

    logger.error('Failed to fetch token version for session validation', {
      employeeId,
      tenantId,
      error: error.message,
      errorCode: error.code,
    })
    return null
  }

  if (!data || data.is_active !== true || data.deleted_at) {
    return null
  }

  if (typeof data.token_version !== 'number' || Number.isNaN(data.token_version) || data.token_version < 0) {
    return 0
  }

  return Math.trunc(data.token_version)
}

const signToken = async (data: SessionData, type: TokenType): Promise<{ token: string; expiresAtMs: number }> => {
  const jti = uuidv4() // Unique token ID for revocation tracking

  let expirationDuration: string // Duration string for setExpirationTime()

  if (type === 'access') {
    expirationDuration = `${limits.sessionDays}d` // 2 days
  } else {
    expirationDuration = `${Math.round(limits.sessionDays * 3.5)}d` // 7 days
  }

  const now = Math.floor(Date.now() / 1000)
  const expiresInSeconds =
    type === 'access' ? limits.sessionDays * 24 * 60 * 60 : Math.round(limits.sessionDays * 3.5 * 24 * 60 * 60)
  const exp = now + expiresInSeconds
  const expiresAtMs = exp * 1000

  const token = await new SignJWT({
    ...data,
    tokenVersion: getNormalizedTokenVersion(data.tokenVersion),
    jti,
    type,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expirationDuration)
    .sign(secretKey)

  return { token, expiresAtMs }
}

export const createSession = async (data: SessionData) => {
  if (!data.employeeId || data.employeeId.trim().length === 0) {
    throw new Error('Invalid session data: employeeId is required')
  }

  // ✅ SECURITY: Enforce tenant ID validation for multi-tenant isolation
  if (!data.tenantId || !isValidTenantId(data.tenantId)) {
    logger.error('Session creation blocked: invalid tenant ID', {
      employeeId: data.employeeId,
      tenantId: data.tenantId,
    })
    throw new Error('Invalid session data: valid tenantId is required')
  }

  try {
    const tokenVersion = getNormalizedTokenVersion(data.tokenVersion)
    const { token: accessToken } = await signToken(data, 'access')
    const { token: refreshToken } = await signToken(data, 'refresh')

    const cookieStore = await cookies()
    const cookieOptions = {
      httpOnly: true,
      secure: appConfig.environment === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }

    cookieStore.set(cookieNames.employeeSession, accessToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * limits.sessionDays, // 2 days
    })

    cookieStore.set(cookieNames.refreshToken, refreshToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * limits.sessionDays * 3.5, // 7 days
    })

    logger.info('Session created', {
      employeeId: data.employeeId,
      tenantId: data.tenantId,
      role: data.role,
      tokenVersion,
    })
  } catch (error) {
    logger.error('Failed to set session cookie', { error: String(error) })
    throw error
  }
}

export const getSession = async (): Promise<SessionData | null> => {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(cookieNames.employeeSession)

    if (!token?.value) {
      return null
    }

    const verified = await jwtVerify(token.value, secretKey)
    const payload = verified.payload as JWTPayload

    // Check if token has been revoked
    if (payload.jti && revokedTokensCache.isRevoked(payload.jti)) {
      logger.warn('Access token has been revoked', { jti: payload.jti })
      return null
    }

    if (typeof payload.employeeId !== 'string' || payload.employeeId.length === 0) {
      logger.warn('Invalid session payload: missing or empty employeeId')
      return null
    }

    if (payload.type !== 'access') {
      logger.warn('Invalid token type: expected access token')
      return null
    }

    // ✅ SECURITY: Ensure tenant ID is always present for multi-tenant isolation
    if (!payload.tenantId || !isValidTenantId(payload.tenantId)) {
      logger.error('Session validation failed: missing or invalid tenant ID', {
        employeeId: payload.employeeId,
        tenantId: payload.tenantId,
      })
      return null
    }

    const jwtTokenVersion = getNormalizedTokenVersion(payload.tokenVersion)
    const currentTokenVersion = await getCurrentTokenVersion(payload.employeeId, payload.tenantId)

    if (currentTokenVersion === null || currentTokenVersion !== jwtTokenVersion) {
      logger.warn('Session rejected due to token version mismatch', {
        employeeId: payload.employeeId,
        tenantId: payload.tenantId,
        jwtTokenVersion,
        currentTokenVersion,
      })
      return null
    }

    return {
      employeeId: payload.employeeId,
      email: typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : undefined,
      fullName: typeof payload.fullName === 'string' && payload.fullName.length > 0 ? payload.fullName : undefined,
      role: typeof payload.role === 'string' ? payload.role : 'viewer',
      tenantId: payload.tenantId, // Already validated above
      tokenVersion: jwtTokenVersion,
    }
  } catch (error) {
    logger.warn('Session verification failed', { error: String(error) })
    return null
  }
}

export const refreshSession = async (): Promise<SessionData | null> => {
  try {
    const cookieStore = await cookies()
    const refreshTokenCookie = cookieStore.get(cookieNames.refreshToken)

    if (!refreshTokenCookie?.value) {
      logger.warn('No refresh token found')
      return null
    }

    const verified = await jwtVerify(refreshTokenCookie.value, secretKey)
    const payload = verified.payload as JWTPayload

    // Check if refresh token has been revoked (prevents replay attacks)
    if (payload.jti && revokedTokensCache.isRevoked(payload.jti)) {
      logger.error('Refresh token reuse detected - possible replay attack', {
        employeeId: payload.employeeId,
        jti: payload.jti,
      })
      // Revoke all sessions for this user
      await deleteSession()
      return null
    }

    if (typeof payload.employeeId !== 'string' || payload.employeeId.length === 0) {
      logger.warn('Invalid refresh token payload')
      return null
    }

    if (payload.type !== 'refresh') {
      logger.warn('Invalid token type: expected refresh token')
      return null
    }

    // ✅ SECURITY: Ensure tenant ID is always present for multi-tenant isolation
    if (!payload.tenantId || !isValidTenantId(payload.tenantId)) {
      logger.error('Refresh token validation failed: missing or invalid tenant ID', {
        employeeId: payload.employeeId,
        tenantId: payload.tenantId,
      })
      return null
    }

    const jwtTokenVersion = getNormalizedTokenVersion(payload.tokenVersion)
    const currentTokenVersion = await getCurrentTokenVersion(payload.employeeId, payload.tenantId)
    if (currentTokenVersion === null || currentTokenVersion !== jwtTokenVersion) {
      logger.warn('Refresh rejected due to token version mismatch', {
        employeeId: payload.employeeId,
        tenantId: payload.tenantId,
        jwtTokenVersion,
        currentTokenVersion,
      })
      await deleteSession()
      return null
    }

    const sessionData: SessionData = {
      employeeId: payload.employeeId,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      fullName: typeof payload.fullName === 'string' ? payload.fullName : undefined,
      role: typeof payload.role === 'string' ? payload.role : 'viewer',
      tenantId: payload.tenantId, // Already validated above
      tokenVersion: currentTokenVersion,
    }

    // CRITICAL: Revoke old refresh token before issuing new one (token rotation)
    if (payload.jti && payload.exp) {
      revokedTokensCache.revoke(payload.jti, payload.exp * 1000)
    }

    // Issue new tokens
    await createSession(sessionData)
    logger.info('Session refreshed with token rotation', {
      employeeId: sessionData.employeeId,
    })

    return sessionData
  } catch (error) {
    logger.error('Session refresh failed', { error: String(error) })
    return null
  }
}

export const deleteSession = async () => {
  const cookieStore = await cookies()
  cookieStore.delete(cookieNames.employeeSession)
  cookieStore.delete(cookieNames.refreshToken)
}
