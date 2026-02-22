import { createSession, deleteSession, getSession } from '@/core/infra/session/jwt-session-store'
import { verifyPassword } from '@/lib/auth/password'
import { limits } from '@/core/constants/limits'
import { authErrorCodes } from '@/core/constants/auth-errors'
import { isAllowedDomain } from '@/core/domain/auth/policies/domain-policy'
import type { AuthResult, LoginRequest, OAuthProfile } from '@/core/domain/auth/types'
import type { EmployeeRepository } from '@/core/domain/users/employee-repository'
import type { Logger } from '@/core/infra/logging/types'
import { AuthenticationError, AuthorizationError, ValidationError } from '@/core/http/errors'

/**
 * Pure domain service - dependencies injected via constructor
 * Logger injected for debugging (abstraction, not direct import)
 * NOTE: tenantId must be passed to all repository methods for multi-tenant isolation
 */
export class AuthService {
  constructor(
    private employeeRepository: EmployeeRepository,
    private logger: Logger
  ) {}

  async loginWithPassword({ email, password }: LoginRequest, tenantId: string): Promise<AuthResult> {
    const normalizedEmail = email?.trim().toLowerCase() ?? ''
    if (!normalizedEmail || !password) {
      throw new ValidationError('Email and password are required')
    }

    if (normalizedEmail.length === 0 || password.length === 0 || password.length > limits.passwordMaxLength) {
      throw new ValidationError('Invalid credentials format')
    }

    if (!isAllowedDomain(normalizedEmail)) {
      throw new AuthorizationError(authErrorCodes.unauthorized, 'Domain not allowed for this organization')
    }

    const employee = await this.employeeRepository.findByEmail({ email: normalizedEmail, tenantId })

    if (!employee) {
      this.logger.debug('User not found for login', { email: normalizedEmail, tenantId })
      throw new AuthenticationError(authErrorCodes.invalidCredentials, 'Invalid credentials')
    }

    if (!employee.passwordHash) {
      this.logger.debug('User has no password hash', { email: normalizedEmail, tenantId })
      throw new AuthenticationError(authErrorCodes.invalidCredentials, 'Invalid credentials')
    }

    if (!employee.isActive) {
      this.logger.debug('User account inactive', { email: normalizedEmail, tenantId })
      throw new AuthorizationError(authErrorCodes.accountInactive, 'Account is inactive')
    }

    const isValidPassword = await verifyPassword(password, employee.passwordHash)

    if (!isValidPassword) {
      throw new AuthenticationError(authErrorCodes.invalidCredentials, 'Invalid credentials')
    }

    await createSession({
      employeeId: employee.id,
      email: employee.email,
      fullName: employee.fullName ?? undefined,
      role: employee.role,
      tenantId,
      tokenVersion: employee.tokenVersion,
    })

    return {
      user: {
        id: employee.id,
        employeeId: employee.id,
        email: employee.email,
        fullName: employee.fullName ?? undefined,
        role: employee.role,
        team: employee.teamName ?? null,
      },
    }
  }

  async loginWithOAuth(profile: OAuthProfile, tenantId: string): Promise<AuthResult> {
    if (!profile.email || !isAllowedDomain(profile.email)) {
      throw new AuthorizationError(authErrorCodes.unauthorized, 'Domain not allowed for this organization')
    }

    let employee = await this.employeeRepository.findByEmail({
      email: profile.email,
      tenantId,
    })

    // If employee doesn't exist, auto-create on first OAuth login
    if (!employee) {
      // Generate employee ID from email (e.g., user@example.com → USER001)
      const emailPrefix = profile.email.split('@')[0].toUpperCase()
      const employeeId = `${emailPrefix.substring(0, 4)}${Math.random().toString(36).substring(7).toUpperCase()}`

      // Generate a valid UUID for the id field
      const newId = crypto.randomUUID()

      employee = await this.employeeRepository.create({
        id: newId,
        employeeId,
        email: profile.email,
        tenantId,
        fullName: profile.name || undefined,
        isActive: true,
        role: 'POC',
        tokenVersion: 0,
        passwordHash: null, // OAuth users don't need password hash
        teamId: null,
        teamName: null,
      })
    }

    if (!employee.isActive) {
      throw new AuthorizationError(authErrorCodes.accountInactive, 'Account is inactive')
    }

    await createSession({
      employeeId: employee.id,
      email: employee.email,
      fullName: employee.fullName ?? undefined,
      role: employee.role,
      tenantId,
      tokenVersion: employee.tokenVersion,
    })

    return {
      user: {
        id: employee.id,
        employeeId: employee.id,
        email: employee.email,
        fullName: employee.fullName ?? undefined,
        role: employee.role,
        team: employee.teamName ?? null,
      },
    }
  }

  async logout() {
    await deleteSession()
  }

  async getSession() {
    return getSession()
  }
}
