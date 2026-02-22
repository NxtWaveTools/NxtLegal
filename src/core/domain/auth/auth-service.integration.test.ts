/**
 * Integration tests for AuthService
 * Tests authentication flows with real database interactions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { AuthService } from './auth-service'
import { createClient } from '@supabase/supabase-js'
import { envServer } from '@/core/config/env.server'
import { hashPassword } from '@/lib/auth/password'
import { authErrorCodes } from '@/core/constants/auth-errors'
import { DEFAULT_TENANT_ID } from '@/core/constants/tenants'
import { AuthorizationError } from '@/core/http/errors'
import type { Logger } from '@/core/infra/logging/types'
import type { EmployeeRecord } from '@/core/domain/users/employee-repository'

// Mock logger for tests
const mockLogger: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

describe('AuthService Integration Tests', () => {
  let authService: AuthService
  let supabaseClient: ReturnType<typeof createClient>
  let testUserId: string
  let testEmail: string

  beforeEach(async () => {
    // Initialize Supabase client with service role key
    supabaseClient = createClient(envServer.supabaseUrl, envServer.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Create mock employee repository
    const employeeRepository = {
      findByEmployeeId: async ({ employeeId, tenantId }: { employeeId: string; tenantId: string }) => {
        const { data, error } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', employeeId)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .single()

        if (error || !data) return null
        const record = (data || {}) as Record<string, unknown>
        return {
          id: record.id as string,
          employeeId: record.id as string,
          email: record.email as string,
          fullName: record.full_name as string,
          passwordHash: (record.password_hash as string) || null,
          isActive: record.is_active as boolean,
          role: record.role as string,
          tokenVersion: (record.token_version as number) ?? 0,
          tenantId: record.tenant_id as string,
          createdAt: (record.created_at as string) || new Date().toISOString(),
          updatedAt: (record.updated_at as string) || new Date().toISOString(),
          deletedAt: (record.deleted_at as string | null) || null,
        }
      },

      findByEmail: async ({ email, tenantId }: { email: string; tenantId: string }) => {
        const { data, error } = await supabaseClient
          .from('users')
          .select('*')
          .eq('email', email)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .single()

        if (error || !data) return null
        const record = (data || {}) as Record<string, unknown>
        return {
          id: record.id as string,
          employeeId: record.id as string,
          email: record.email as string,
          fullName: record.full_name as string,
          passwordHash: (record.password_hash as string) || null,
          isActive: record.is_active as boolean,
          role: record.role as string,
          tokenVersion: (record.token_version as number) ?? 0,
          tenantId: record.tenant_id as string,
          createdAt: (record.created_at as string) || new Date().toISOString(),
          updatedAt: (record.updated_at as string) || new Date().toISOString(),
          deletedAt: (record.deleted_at as string | null) || null,
        }
      },

      create: async (
        employee: Omit<EmployeeRecord, 'createdAt' | 'updatedAt' | 'deletedAt'>
      ): Promise<EmployeeRecord> => {
        const { data, error } = await supabaseClient
          .from('users')
          .insert({
            id: employee.id,
            email: employee.email,
            tenant_id: employee.tenantId,
            full_name: employee.fullName,
            is_active: employee.isActive,
            role: employee.role,
            token_version: employee.tokenVersion,
            password_hash: employee.passwordHash,
            team_id: employee.teamId,
          })
          .select()
          .single()
        if (error) throw error
        // data is now properly typed as employees.Row | null
        return {
          id: data!.id as string,
          employeeId: data!.id as string,
          email: data!.email as string,
          fullName: data!.full_name as string,
          passwordHash: (data!.password_hash as string) || null,
          isActive: data!.is_active as boolean,
          role: data!.role as string,
          tokenVersion: (data!.token_version as number) ?? 0,
          tenantId: data!.tenant_id as string,
          createdAt: (data!.created_at as string) || new Date().toISOString(),
          updatedAt: (data!.updated_at as string) || new Date().toISOString(),
          deletedAt: null,
        }
      },
      // Mock methods not used in these tests
      softDelete: async () => {},
      restore: async () => {},
      listByTenant: async () => [],
    }

    authService = new AuthService(employeeRepository, mockLogger)

    // Generate unique test identifiers
    const timestamp = Date.now()
    testUserId = crypto.randomUUID()
    testEmail = `test${timestamp}@nxtwave.co.in`
  })

  afterEach(async () => {
    // Cleanup: Delete test employee if created
    if (testEmail) {
      await supabaseClient.from('users').delete().eq('email', testEmail)
    }
  })

  describe('loginWithPassword', () => {
    it('should successfully login with valid credentials', async () => {
      // Arrange: Create test employee
      const passwordHash = await hashPassword('TestPassword123!')
      await supabaseClient.from('users').insert({
        id: testUserId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: true,
        role: 'POC',
        token_version: 0,
        password_hash: passwordHash,
      })
      // Act: Attempt login
      const result = await authService.loginWithPassword(
        {
          email: testEmail.toUpperCase(),
          password: 'TestPassword123!',
        },
        DEFAULT_TENANT_ID
      )

      // Assert
      expect(result).toBeDefined()
      expect(result.user.email).toBe(testEmail)
      expect(result.user.role).toBe('POC')
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('should reject login with incorrect password', async () => {
      // Arrange: Create test employee
      const passwordHash = await hashPassword('CorrectPassword123!')
      await supabaseClient.from('users').insert({
        id: crypto.randomUUID(),
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: true,
        role: 'POC',
        token_version: 0,
        password_hash: passwordHash,
      })

      // Act & Assert: Should throw authentication error
      await expect(
        authService.loginWithPassword(
          {
            email: testEmail,
            password: 'WrongPassword123!',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)
    })

    it('should reject login for inactive account', async () => {
      // Arrange: Create inactive test employee
      const passwordHash = await hashPassword('TestPassword123!')
      await supabaseClient.from('users').insert({
        id: crypto.randomUUID(),
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: false, // Inactive account
        role: 'POC',
        token_version: 0,
        password_hash: passwordHash,
      })
      // Act & Assert: Should throw authorization error
      await expect(
        authService.loginWithPassword(
          {
            email: testEmail,
            password: 'TestPassword123!',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.accountInactive)
    })

    it('should reject login for OAuth-only account (no password)', async () => {
      // Arrange: Create OAuth-only employee (no password hash)
      await supabaseClient.from('users').insert({
        id: crypto.randomUUID(),
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: true,
        role: 'POC',
        token_version: 0,
        password_hash: null, // No password set (OAuth only)
      })

      // Act & Assert: Should throw authentication error
      await expect(
        authService.loginWithPassword(
          {
            email: testEmail,
            password: 'AnyPassword123!',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)
    })

    it('should prevent cross-tenant access', async () => {
      // Arrange: Create employee in different tenant
      const otherTenantId = '11111111-1111-1111-1111-111111111111'
      const passwordHash = await hashPassword('TestPassword123!')

      // Create test tenant first
      await supabaseClient.from('tenants').upsert({
        id: otherTenantId,
        name: 'Test Tenant',
      })

      await supabaseClient.from('users').insert({
        id: crypto.randomUUID(),
        email: testEmail,
        tenant_id: otherTenantId, // Different tenant
        full_name: 'Test Employee',
        is_active: true,
        role: 'POC',
        token_version: 0,
        password_hash: passwordHash,
      })

      // Act & Assert: Should fail when trying to login with default tenant
      await expect(
        authService.loginWithPassword(
          {
            email: testEmail,
            password: 'TestPassword123!',
          },
          DEFAULT_TENANT_ID // Wrong tenant
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)

      // Cleanup
      await supabaseClient.from('tenants').delete().eq('id', otherTenantId)
    })

    it('should reject empty credentials', async () => {
      await expect(
        authService.loginWithPassword(
          {
            email: '',
            password: 'password',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)

      await expect(
        authService.loginWithPassword(
          {
            email: testEmail,
            password: '',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)
    })
  })

  describe('loginWithOAuth', () => {
    it('should create new employee on first OAuth login', async () => {
      // Arrange: OAuth profile for new user
      const oauthProfile = {
        email: testEmail,
        name: 'Test OAuth User',
      }

      // Act: First login (auto-create)
      const result = await authService.loginWithOAuth(oauthProfile, DEFAULT_TENANT_ID)

      // Assert
      expect(result).toBeDefined()
      expect(result.user.email).toBe(testEmail)
      expect(result.user.fullName).toBe('Test OAuth User')

      // Verify employee was created in database
      const { data } = await supabaseClient
        .from('users')
        .select('*')
        .eq('email', testEmail)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .single()

      expect(data).toBeDefined()
      const record = (data || {}) as Record<string, unknown>
      expect(record?.password_hash).toBeNull() // OAuth users don't have passwords
      expect(record?.is_active).toBe(true)
    })

    it('should login existing OAuth user', async () => {
      // Arrange: Create existing OAuth employee
      await supabaseClient.from('users').insert({
        id: testUserId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Existing OAuth User',
        is_active: true,
        role: 'POC',
        token_version: 0,
        password_hash: null, // OAuth user
      })

      const oauthProfile = {
        email: testEmail,
        name: 'Existing OAuth User',
      }

      // Act: Login existing user
      const result = await authService.loginWithOAuth(oauthProfile, DEFAULT_TENANT_ID)

      // Assert
      expect(result).toBeDefined()
      expect(result.user.email).toBe(testEmail)
      expect(result.user.employeeId).toBe(testUserId)
    })

    it('should reject OAuth login for inactive account', async () => {
      // Arrange: Create inactive OAuth employee
      await supabaseClient.from('users').insert({
        id: crypto.randomUUID(),
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Inactive OAuth User',
        is_active: false, // Inactive
        role: 'POC',
        token_version: 0,
        password_hash: null,
      })

      const oauthProfile = {
        email: testEmail,
        name: 'Inactive OAuth User',
      }

      // Act & Assert: Should throw authorization error
      await expect(authService.loginWithOAuth(oauthProfile, DEFAULT_TENANT_ID)).rejects.toThrow(AuthorizationError)
    })
  })
})
