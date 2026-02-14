/**
 * Integration tests for AuthService
 * Tests authentication flows with real database interactions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { AuthService } from './auth-service'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
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
  let supabaseClient: ReturnType<typeof createClient<Database>>
  let testEmployeeId: string
  let testEmail: string

  beforeEach(async () => {
    // Initialize Supabase client with service role key
    supabaseClient = createClient<Database>(envServer.supabaseUrl, envServer.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Create mock employee repository
    const employeeRepository = {
      findByEmployeeId: async ({ employeeId, tenantId }: { employeeId: string; tenantId: string }) => {
        const { data, error } = await supabaseClient
          .from('employees')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .single()

        if (error || !data) return null
        const record = (data || {}) as Record<string, unknown>
        return {
          id: record.id as string,
          employeeId: record.employee_id as string,
          email: record.email as string,
          fullName: record.full_name as string,
          passwordHash: (record.password_hash as string) || null,
          isActive: record.is_active as boolean,
          role: record.role as string,
          tenantId: record.tenant_id as string,
          createdAt: (record.created_at as string) || new Date().toISOString(),
          updatedAt: (record.updated_at as string) || new Date().toISOString(),
          deletedAt: (record.deleted_at as string | null) || null,
        }
      },

      findByEmail: async ({ email, tenantId }: { email: string; tenantId: string }) => {
        const { data, error } = await supabaseClient
          .from('employees')
          .select('*')
          .eq('email', email)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .single()

        if (error || !data) return null
        const record = (data || {}) as Record<string, unknown>
        return {
          id: record.id as string,
          employeeId: record.employee_id as string,
          email: record.email as string,
          fullName: record.full_name as string,
          passwordHash: (record.password_hash as string) || null,
          isActive: record.is_active as boolean,
          role: record.role as string,
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
          .from('employees')
          .insert({
            id: employee.id,
            employee_id: employee.employeeId,
            email: employee.email,
            tenant_id: employee.tenantId,
            full_name: employee.fullName,
            is_active: employee.isActive,
            role: employee.role,
            password_hash: employee.passwordHash,
          })
          .select()
          .single()
        if (error) throw error
        // data is now properly typed as employees.Row | null
        return {
          id: data!.id as string,
          employeeId: data!.employee_id as string,
          email: data!.email as string,
          fullName: data!.full_name as string,
          passwordHash: (data!.password_hash as string) || null,
          isActive: data!.is_active as boolean,
          role: data!.role as string,
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
    testEmployeeId = `TEST${timestamp}`
    testEmail = `test${timestamp}@example.com`
  })

  afterEach(async () => {
    // Cleanup: Delete test employee if created
    if (testEmployeeId) {
      await supabaseClient.from('employees').delete().eq('employee_id', testEmployeeId)
    }
  })

  describe('loginWithPassword', () => {
    it('should successfully login with valid credentials', async () => {
      // Arrange: Create test employee
      const passwordHash = await hashPassword('TestPassword123!')
      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: true,
        role: 'viewer',
        password_hash: passwordHash,
      })
      // Act: Attempt login
      const result = await authService.loginWithPassword(
        {
          employeeId: testEmployeeId.toLowerCase(), // Test case-insensitive
          password: 'TestPassword123!',
        },
        DEFAULT_TENANT_ID
      )

      // Assert
      expect(result).toBeDefined()
      expect(result.employee.employeeId).toBe(testEmployeeId)
      expect(result.employee.email).toBe(testEmail)
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('should reject login with incorrect password', async () => {
      // Arrange: Create test employee
      const passwordHash = await hashPassword('CorrectPassword123!')
      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: true,
        role: 'viewer',
        password_hash: passwordHash,
      })

      // Act & Assert: Should throw authentication error
      await expect(
        authService.loginWithPassword(
          {
            employeeId: testEmployeeId,
            password: 'WrongPassword123!',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)
    })

    it('should reject login for inactive account', async () => {
      // Arrange: Create inactive test employee
      const passwordHash = await hashPassword('TestPassword123!')
      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: false, // Inactive account
        role: 'viewer',
        password_hash: passwordHash,
      })
      // Act & Assert: Should throw authorization error
      await expect(
        authService.loginWithPassword(
          {
            employeeId: testEmployeeId,
            password: 'TestPassword123!',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.accountInactive)
    })

    it('should reject login for OAuth-only account (no password)', async () => {
      // Arrange: Create OAuth-only employee (no password hash)
      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Test Employee',
        is_active: true,
        role: 'viewer',
        password_hash: null, // No password set (OAuth only)
      })

      // Act & Assert: Should throw authentication error
      await expect(
        authService.loginWithPassword(
          {
            employeeId: testEmployeeId,
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

      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: otherTenantId, // Different tenant
        full_name: 'Test Employee',
        is_active: true,
        role: 'viewer',
        password_hash: passwordHash,
      })

      // Act & Assert: Should fail when trying to login with default tenant
      await expect(
        authService.loginWithPassword(
          {
            employeeId: testEmployeeId,
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
            employeeId: '',
            password: 'password',
          },
          DEFAULT_TENANT_ID
        )
      ).rejects.toThrow(authErrorCodes.invalidCredentials)

      await expect(
        authService.loginWithPassword(
          {
            employeeId: 'TEST123',
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
      expect(result.employee.email).toBe(testEmail)
      expect(result.employee.fullName).toBe('Test OAuth User')

      // Verify employee was created in database
      const { data } = await supabaseClient
        .from('employees')
        .select('*')
        .eq('email', testEmail)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .single()

      expect(data).toBeDefined()
      const record = (data || {}) as Record<string, unknown>
      expect(record?.password_hash).toBeNull() // OAuth users don't have passwords
      expect(record?.is_active).toBe(true)

      // Set testEmployeeId for cleanup
      testEmployeeId = (record?.employee_id as string) || testEmployeeId
    })

    it('should login existing OAuth user', async () => {
      // Arrange: Create existing OAuth employee
      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Existing OAuth User',
        is_active: true,
        role: 'https://nxt-legal.example.com',
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
      expect(result.employee.email).toBe(testEmail)
      expect(result.employee.employeeId).toBe(testEmployeeId)
    })

    it('should reject OAuth login for inactive account', async () => {
      // Arrange: Create inactive OAuth employee
      await supabaseClient.from('employees').insert({
        id: crypto.randomUUID(),
        employee_id: testEmployeeId,
        email: testEmail,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: 'Inactive OAuth User',
        is_active: false, // Inactive
        role: 'viewer',
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
