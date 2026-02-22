/**
 * Central registry for service instantiation with proper dependency injection.
 * Wires all dependencies and exports singleton instances to be used by API routes.
 *
 * This prevents infrastructure coupling in domain services.
 */

import { AuthService } from '@/core/domain/auth/auth-service'
import { AuditLogger } from '@/core/domain/audit/audit-logger'
import { IdempotencyService } from '@/core/domain/idempotency/idempotency-service'
import { ContractUploadService } from '@/core/domain/contracts/contract-upload-service'
import { ContractQueryService } from '@/core/domain/contracts/contract-query-service'
import { RoleGovernanceService } from '@/core/domain/admin/role-governance-service'
import { AdminQueryService } from '@/core/domain/admin/admin-query-service'
import { TeamGovernanceService } from '@/core/domain/admin/team-governance-service'
import { supabaseEmployeeRepository } from '@/core/infra/repositories/supabase-employee-repository'
import { supabaseAuditRepository } from '@/core/infra/repositories/supabase-audit-repository'
import { supabaseIdempotencyRepository } from '@/core/infra/repositories/supabase-idempotency-repository'
import { supabaseContractRepository } from '@/core/infra/repositories/supabase-contract-repository'
import { supabaseContractStorageRepository } from '@/core/infra/repositories/supabase-contract-storage-repository'
import { supabaseContractQueryRepository } from '@/core/infra/repositories/supabase-contract-query-repository'
import { supabaseRoleGovernanceRepository } from '@/core/infra/repositories/supabase-role-governance-repository'
import { supabaseAdminQueryRepository } from '@/core/infra/repositories/supabase-admin-query-repository'
import { supabaseTeamGovernanceRepository } from '@/core/infra/repositories/supabase-team-governance-repository'
import { logger } from '@/core/infra/logging/logger'
import type { EmployeeRepository } from '@/core/domain/users/employee-repository'

// Private instances - don't export directly
let authService: AuthService | null = null
let auditLogger: AuditLogger | null = null
let idempotencyService: IdempotencyService | null = null
let contractUploadService: ContractUploadService | null = null
let contractQueryService: ContractQueryService | null = null
let roleGovernanceService: RoleGovernanceService | null = null
let adminQueryService: AdminQueryService | null = null
let teamGovernanceService: TeamGovernanceService | null = null

/**
 * Get or create AuthService singleton with dependencies injected
 */
export function getAuthService(): AuthService {
  if (!authService) {
    // Wire dependencies: AuthService requires EmployeeRepository and Logger
    const employeeRepository: EmployeeRepository = supabaseEmployeeRepository
    authService = new AuthService(employeeRepository, logger)
  }
  return authService
}

/**
 * Get or create AuditLogger singleton with dependencies injected
 */
export function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger(supabaseAuditRepository)
  }
  return auditLogger
}

/**
 * Get or create IdempotencyService singleton with dependencies injected
 */
export function getIdempotencyService(): IdempotencyService {
  if (!idempotencyService) {
    idempotencyService = new IdempotencyService(supabaseIdempotencyRepository)
  }
  return idempotencyService
}

/**
 * Get or create ContractUploadService singleton with dependencies injected
 */
export function getContractUploadService(): ContractUploadService {
  if (!contractUploadService) {
    contractUploadService = new ContractUploadService(
      supabaseContractRepository,
      supabaseContractStorageRepository,
      logger
    )
  }

  return contractUploadService
}

export function getContractQueryService(): ContractQueryService {
  if (!contractQueryService) {
    contractQueryService = new ContractQueryService(supabaseContractQueryRepository)
  }

  return contractQueryService
}

export function getRoleGovernanceService(): RoleGovernanceService {
  if (!roleGovernanceService) {
    roleGovernanceService = new RoleGovernanceService(supabaseRoleGovernanceRepository)
  }

  return roleGovernanceService
}

export function getAdminQueryService(): AdminQueryService {
  if (!adminQueryService) {
    adminQueryService = new AdminQueryService(supabaseAdminQueryRepository)
  }

  return adminQueryService
}

export function getTeamGovernanceService(): TeamGovernanceService {
  if (!teamGovernanceService) {
    teamGovernanceService = new TeamGovernanceService(supabaseTeamGovernanceRepository)
  }

  return teamGovernanceService
}

/**
 * Reset services (for testing)
 */
export function resetServices(): void {
  authService = null
  auditLogger = null
  idempotencyService = null
  contractUploadService = null
  contractQueryService = null
  roleGovernanceService = null
  adminQueryService = null
  teamGovernanceService = null
}

// Export types for use in other files
export type { EmployeeRepository } from '@/core/domain/users/employee-repository'
