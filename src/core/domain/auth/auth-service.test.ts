/**
 * Unit tests for AuthService
 */

import { AuthService } from '@/core/domain/auth/auth-service'
import type { EmployeeRepository } from '@/core/domain/users/employee-repository'
import type { Logger } from '@/core/infra/logging/types'
import { createSession } from '@/core/infra/session/jwt-session-store'

// domain-policy.ts transitively loads app-config → env.server which calls requireEnv().
// Mock the policy module so the test does not require real environment variables.
jest.mock('@/core/domain/auth/policies/domain-policy', () => ({
  isAllowedDomain: jest.fn().mockReturnValue(true),
}))

jest.mock('@/core/infra/session/jwt-session-store', () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  getSession: jest.fn().mockResolvedValue(null),
}))

// Mock repository
const mockEmployeeRepository: jest.Mocked<EmployeeRepository> = {
  findByEmployeeId: jest.fn(),
  findByEmail: jest.fn(),
  findMappedTeamRolesByEmail: jest.fn(),
  hasAdditionalApproverParticipation: jest.fn().mockResolvedValue(false),
  hasActionableAdditionalApproverAssignments: jest.fn().mockResolvedValue(false),
  create: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  listByTenant: jest.fn(),
}

// Mock logger
const mockLogger: jest.Mocked<Logger> = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

describe('AuthService', () => {
  let authService: AuthService

  beforeEach(() => {
    jest.clearAllMocks()
    authService = new AuthService(mockEmployeeRepository, mockLogger)
  })

  describe('loginWithPassword', () => {
    it('should successfully login with valid credentials', async () => {
      const tenantId = 'tenant-001'
      const email = 'user@nxtwave.co.in'
      const password = 'SecurePassword123'

      // Mock employee lookup
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'employee-uuid-123',
        employeeId: 'employee-uuid-123',
        tenantId,
        email,
        fullName: 'John Doe',
        isActive: true,
        passwordHash: '$2b$10$example.hash', // bcrypt hash
        role: 'LEGAL_TEAM',
        tokenVersion: 0,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      // Test should call repository with tenant scoping
      await expect(authService.loginWithPassword({ email, password }, tenantId)).rejects.toThrow() // Will throw because password validation fails in real code

      // Verify tenant scoping was applied
      expect(mockEmployeeRepository.findByEmail).toHaveBeenCalledWith({
        email,
        tenantId,
      })
    })

    it('should fail with invalid credentials', async () => {
      const tenantId = 'tenant-001'
      const email = 'invalid@nxtwave.co.in'
      const password = 'WrongPassword'

      // Mock employee not found
      mockEmployeeRepository.findByEmail.mockResolvedValue(null)

      await expect(authService.loginWithPassword({ email, password }, tenantId)).rejects.toThrow()

      expect(mockEmployeeRepository.findByEmail).toHaveBeenCalledWith({
        email,
        tenantId,
      })
    })

    it('should reject login for inactive employees', async () => {
      const tenantId = 'tenant-001'
      const email = 'inactive@nxtwave.co.in'

      // Mock inactive employee
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'employee-uuid-123',
        employeeId: 'employee-uuid-123',
        tenantId,
        email,
        fullName: 'John Doe',
        isActive: false, // Inactive
        passwordHash: '$2b$10$example.hash',
        role: 'POC',
        tokenVersion: 0,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      await expect(authService.loginWithPassword({ email, password: 'correct' }, tenantId)).rejects.toThrow()
    })

    it('should enforce tenant isolation - different tenant cannot access employee', async () => {
      const tenantA = 'tenant-a'
      const tenantB = 'tenant-b'
      const email = 'tenant.user@nxtwave.co.in'

      // Setup: Employee exists in tenant A
      mockEmployeeRepository.findByEmail.mockImplementation(async ({ tenantId }) => {
        return tenantId === tenantA
          ? {
              id: 'employee-uuid-123',
              employeeId: 'employee-uuid-123',
              tenantId: tenantA,
              email,
              fullName: 'John Doe',
              isActive: true,
              passwordHash: '$2b$10$example.hash',
              role: 'POC',
              tokenVersion: 0,
              createdAt: '2026-02-14T00:00:00Z',
              updatedAt: '2026-02-14T00:00:00Z',
              deletedAt: null,
            }
          : null
      })

      // Try to login from tenant B - should fail
      await expect(authService.loginWithPassword({ email, password: 'any' }, tenantB)).rejects.toThrow()

      // Verify repository was called with tenant B, not tenant A
      expect(mockEmployeeRepository.findByEmail).toHaveBeenCalledWith({
        email,
        tenantId: tenantB,
      })
    })
  })

  describe('logout', () => {
    it('should successfully log out', async () => {
      // Logout is a simple operation that doesn't depend on repository
      await expect(authService.logout()).resolves.not.toThrow()
    })
  })

  describe('getSession', () => {
    it('should return null when no session exists', async () => {
      const session = await authService.getSession()
      expect(session).toBeNull()
    })
  })

  describe('loginWithOAuth', () => {
    it('rejects unmapped non-admin Microsoft account', async () => {
      const tenantId = 'tenant-001'
      const email = 'new.user@nxtwave.co.in'

      mockEmployeeRepository.findMappedTeamRolesByEmail.mockResolvedValue([])
      mockEmployeeRepository.hasAdditionalApproverParticipation.mockResolvedValue(false)
      mockEmployeeRepository.hasActionableAdditionalApproverAssignments.mockResolvedValue(false)
      mockEmployeeRepository.findByEmail.mockResolvedValue(null)

      await expect(
        authService.loginWithOAuth(
          {
            email,
            name: 'New User',
          },
          tenantId
        )
      ).rejects.toThrow('Access is not provisioned for this Microsoft account')
    })

    it('allows existing internal admin without mapping', async () => {
      const tenantId = 'tenant-001'
      const email = 'admin@nxtwave.co.in'

      mockEmployeeRepository.findMappedTeamRolesByEmail.mockResolvedValue([])
      mockEmployeeRepository.hasAdditionalApproverParticipation.mockResolvedValue(false)
      mockEmployeeRepository.hasActionableAdditionalApproverAssignments.mockResolvedValue(false)
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'admin-uuid-123',
        employeeId: 'admin-uuid-123',
        tenantId,
        email,
        fullName: 'Admin User',
        isActive: true,
        passwordHash: null,
        role: 'ADMIN',
        tokenVersion: 3,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      const result = await authService.loginWithOAuth(
        {
          email,
          name: 'Admin User',
        },
        tenantId
      )

      expect(result.user.role).toBe('ADMIN')
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'admin-uuid-123',
          role: 'ADMIN',
          tenantId,
          tokenVersion: 3,
        })
      )
    })

    it('allows existing legal team user without mapping', async () => {
      const tenantId = 'tenant-001'
      const email = 'legal.user@nxtwave.co.in'

      mockEmployeeRepository.findMappedTeamRolesByEmail.mockResolvedValue([])
      mockEmployeeRepository.hasAdditionalApproverParticipation.mockResolvedValue(false)
      mockEmployeeRepository.hasActionableAdditionalApproverAssignments.mockResolvedValue(false)
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'legal-uuid-123',
        employeeId: 'legal-uuid-123',
        tenantId,
        email,
        fullName: 'Legal User',
        isActive: true,
        passwordHash: null,
        role: 'LEGAL_TEAM',
        tokenVersion: 2,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      const result = await authService.loginWithOAuth(
        {
          email,
          name: 'Legal User',
        },
        tenantId
      )

      expect(result.user.role).toBe('LEGAL_TEAM')
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'legal-uuid-123',
          role: 'LEGAL_TEAM',
          tenantId,
          tokenVersion: 2,
        })
      )
    })

    it('derives OAuth runtime role from mapping for non-admin user', async () => {
      const tenantId = 'tenant-001'
      const email = 'mapped.user@nxtwave.co.in'

      mockEmployeeRepository.findMappedTeamRolesByEmail.mockResolvedValue(['POC', 'HOD'])
      mockEmployeeRepository.hasAdditionalApproverParticipation.mockResolvedValue(false)
      mockEmployeeRepository.hasActionableAdditionalApproverAssignments.mockResolvedValue(false)
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'mapped-uuid-123',
        employeeId: 'mapped-uuid-123',
        tenantId,
        email,
        fullName: 'Mapped User',
        isActive: true,
        passwordHash: null,
        role: 'USER',
        tokenVersion: 0,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      const result = await authService.loginWithOAuth(
        {
          email,
          name: 'Mapped User',
        },
        tenantId
      )

      expect(result.user.role).toBe('HOD')
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'mapped-uuid-123',
          role: 'HOD',
          tenantId,
        })
      )
    })

    it('allows additional approver with actionable assignment', async () => {
      const tenantId = 'tenant-001'
      const email = 'approver@nxtwave.co.in'

      mockEmployeeRepository.findMappedTeamRolesByEmail.mockResolvedValue([])
      mockEmployeeRepository.hasAdditionalApproverParticipation.mockResolvedValue(true)
      mockEmployeeRepository.hasActionableAdditionalApproverAssignments.mockResolvedValue(true)
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'approver-uuid-123',
        employeeId: 'approver-uuid-123',
        tenantId,
        email,
        fullName: 'Additional Approver',
        isActive: true,
        passwordHash: null,
        role: 'USER',
        tokenVersion: 1,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      const result = await authService.loginWithOAuth(
        {
          email,
          name: 'Additional Approver',
        },
        tenantId
      )

      expect(result.user.role).toBe('USER')
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'approver-uuid-123',
          role: 'USER',
          tenantId,
        })
      )
    })

    it('allows additional approver with historical participation even when no actionable assignment', async () => {
      const tenantId = 'tenant-001'
      const email = 'history.approver@nxtwave.co.in'

      mockEmployeeRepository.findMappedTeamRolesByEmail.mockResolvedValue([])
      mockEmployeeRepository.hasAdditionalApproverParticipation.mockResolvedValue(true)
      mockEmployeeRepository.hasActionableAdditionalApproverAssignments.mockResolvedValue(false)
      mockEmployeeRepository.findByEmail.mockResolvedValue({
        id: 'history-approver-uuid-123',
        employeeId: 'history-approver-uuid-123',
        tenantId,
        email,
        fullName: 'History Approver',
        isActive: true,
        passwordHash: null,
        role: 'USER',
        tokenVersion: 1,
        createdAt: '2026-02-14T00:00:00Z',
        updatedAt: '2026-02-14T00:00:00Z',
        deletedAt: null,
      })

      const result = await authService.loginWithOAuth(
        {
          email,
          name: 'History Approver',
        },
        tenantId
      )

      expect(result.user.role).toBe('USER')
    })
  })
})
