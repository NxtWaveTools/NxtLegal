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
import { ContractSignatoryService } from '@/core/domain/contracts/contract-signatory-service'
import { ContractApprovalNotificationService } from '@/core/domain/contracts/contract-approval-notification-service'
import { RoleGovernanceService } from '@/core/domain/admin/role-governance-service'
import { AdminQueryService } from '@/core/domain/admin/admin-query-service'
import { TeamGovernanceService } from '@/core/domain/admin/team-governance-service'
import { SystemConfigurationService } from '@/core/domain/admin/system-configuration-service'
import { AuditViewerService } from '@/core/domain/admin/audit-viewer-service'
import { supabaseEmployeeRepository } from '@/core/infra/repositories/supabase-employee-repository'
import { supabaseAuditRepository } from '@/core/infra/repositories/supabase-audit-repository'
import { supabaseIdempotencyRepository } from '@/core/infra/repositories/supabase-idempotency-repository'
import { supabaseContractRepository } from '@/core/infra/repositories/supabase-contract-repository'
import { supabaseContractStorageRepository } from '@/core/infra/repositories/supabase-contract-storage-repository'
import { supabaseContractQueryRepository } from '@/core/infra/repositories/supabase-contract-query-repository'
import { supabaseRoleGovernanceRepository } from '@/core/infra/repositories/supabase-role-governance-repository'
import { supabaseAdminQueryRepository } from '../infra/repositories/supabase-admin-query-repository'
import { supabaseTeamGovernanceRepository } from '@/core/infra/repositories/supabase-team-governance-repository'
import { supabaseSystemConfigurationRepository } from '@/core/infra/repositories/supabase-system-configuration-repository'
import { supabaseAdminAuditViewerRepository } from '@/core/infra/repositories/supabase-admin-audit-viewer-repository'
import { logger } from '@/core/infra/logging/logger'
import { ZohoSignClient } from '@/core/infra/integrations/zoho-sign/zoho-sign-client'
import { BrevoSmtpSender } from '@/core/infra/integrations/email/brevo-smtp-sender'
import { appConfig } from '@/core/config/app-config'
import type { EmployeeRepository } from '@/core/domain/users/employee-repository'
import { ExternalServiceError } from '@/core/http/errors'

// Private instances - don't export directly
let authService: AuthService | null = null
let auditLogger: AuditLogger | null = null
let idempotencyService: IdempotencyService | null = null
let contractUploadService: ContractUploadService | null = null
let contractQueryService: ContractQueryService | null = null
let contractSignatoryService: ContractSignatoryService | null = null
let contractApprovalNotificationService: ContractApprovalNotificationService | null = null
let roleGovernanceService: RoleGovernanceService | null = null
let adminQueryService: AdminQueryService | null = null
let teamGovernanceService: TeamGovernanceService | null = null
let systemConfigurationService: SystemConfigurationService | null = null
let auditViewerService: AuditViewerService | null = null

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

export function getContractSignatoryService(): ContractSignatoryService {
  const shouldRefreshInDev = process.env.NODE_ENV !== 'production'

  if (!contractSignatoryService || shouldRefreshInDev) {
    const zohoSignConfig = appConfig.zohoSign
    const mailConfig = appConfig.mail

    if (!zohoSignConfig.apiBaseUrl || !zohoSignConfig.accessToken || !zohoSignConfig.webhookSecret) {
      throw new Error('Zoho Sign config is incomplete. Please set required ZOHO_SIGN_* environment variables.')
    }

    const apiKey = typeof mailConfig.brevoApiKey === 'string' ? mailConfig.brevoApiKey.trim() : ''
    const apiKeyLooksLikeRestKey = typeof apiKey === 'string' && apiKey.startsWith('xkeysib-')
    logger.warn('TEMP_DIAG Brevo API key validation', {
      apiKey: apiKey.length > 0 ? `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}` : null,
      apiKeyLooksLikeRestKey,
    })

    const hasBrevoConfig = Boolean(
      mailConfig.brevoApiBaseUrl &&
      apiKey &&
      apiKeyLooksLikeRestKey &&
      mailConfig.brevoTemplateSignatoryLinkId &&
      mailConfig.brevoTemplateSigningCompletedId &&
      mailConfig.fromName &&
      mailConfig.fromEmail
    )

    const zohoSignClient = new ZohoSignClient({
      apiBaseUrl: zohoSignConfig.apiBaseUrl,
      accessToken: zohoSignConfig.accessToken,
    })

    const isProduction = process.env.NODE_ENV === 'production'
    if (!hasBrevoConfig && isProduction) {
      throw new ExternalServiceError(
        'BREVO',
        'Brevo config is incomplete. Please set required BREVO_* and MAIL_FROM_* variables.'
      )
    }

    const brevoSmtpSender = hasBrevoConfig
      ? new BrevoSmtpSender({
          apiBaseUrl: mailConfig.brevoApiBaseUrl,
          apiKey,
          fromName: mailConfig.fromName as string,
          fromEmail: mailConfig.fromEmail as string,
        })
      : {
          sendTemplateEmail: async (input: { recipientEmail: string; templateId: number }) => {
            logger.warn('Brevo config missing; using dev no-op signatory mail sender', {
              recipientEmail: input.recipientEmail,
              templateId: input.templateId,
            })

            return {
              providerMessageId: `dev-noop-${Date.now()}`,
            }
          },
        }

    const signatoryLinkTemplateId = mailConfig.brevoTemplateSignatoryLinkId ?? 0
    const signingCompletedTemplateId = mailConfig.brevoTemplateSigningCompletedId ?? 0

    if (!hasBrevoConfig) {
      logger.warn('Brevo config is incomplete. Dev no-op email sender is active.', {
        signatoryLinkTemplateId,
        signingCompletedTemplateId,
        hasApiKey: Boolean(apiKey),
        apiKeyLooksLikeRestKey,
      })
    }

    contractSignatoryService = new ContractSignatoryService(
      getContractQueryService(),
      getContractUploadService(),
      supabaseContractRepository,
      supabaseContractStorageRepository,
      zohoSignClient,
      brevoSmtpSender,
      {
        signatoryLinkTemplateId,
        signingCompletedTemplateId,
      },
      appConfig.auth.siteUrl,
      logger
    )
  }

  return contractSignatoryService
}

export function getContractApprovalNotificationService(): ContractApprovalNotificationService {
  const shouldRefreshInDev = process.env.NODE_ENV !== 'production'

  if (!contractApprovalNotificationService || shouldRefreshInDev) {
    const mailConfig = appConfig.mail
    const apiKey = typeof mailConfig.brevoApiKey === 'string' ? mailConfig.brevoApiKey.trim() : ''
    const apiKeyLooksLikeRestKey = typeof apiKey === 'string' && apiKey.startsWith('xkeysib-')

    const hasBrevoConfig = Boolean(
      mailConfig.brevoApiBaseUrl && apiKey && apiKeyLooksLikeRestKey && mailConfig.fromName && mailConfig.fromEmail
    )

    const isProduction = process.env.NODE_ENV === 'production'
    if (!hasBrevoConfig && isProduction) {
      throw new ExternalServiceError(
        'BREVO',
        'Brevo config is incomplete. Please set required BREVO_* and MAIL_FROM_* variables.'
      )
    }

    const sender = hasBrevoConfig
      ? new BrevoSmtpSender({
          apiBaseUrl: mailConfig.brevoApiBaseUrl,
          apiKey,
          fromName: mailConfig.fromName as string,
          fromEmail: mailConfig.fromEmail as string,
        })
      : {
          sendTemplateEmail: async (input: { recipientEmail: string; templateId: number }) => {
            logger.warn('Brevo config missing; using dev no-op approval mail sender', {
              recipientEmail: input.recipientEmail,
              templateId: input.templateId,
            })

            return {
              providerMessageId: `dev-noop-${Date.now()}`,
            }
          },
        }

    contractApprovalNotificationService = new ContractApprovalNotificationService(
      getContractQueryService(),
      sender,
      {
        hodApprovalRequestedTemplateId: mailConfig.brevoTemplateHodApprovalRequestedId ?? 0,
        approvalReminderTemplateId: mailConfig.brevoTemplateApprovalReminderId ?? 0,
        additionalApproverAddedTemplateId: mailConfig.brevoTemplateAdditionalApproverAddedId ?? 0,
        legalInternalAssignmentTemplateId: mailConfig.brevoTemplateLegalInternalAssignmentId ?? 0,
        legalApprovalReceivedHodTemplateId: mailConfig.brevoTemplateLegalApprovalReceivedHodId ?? 0,
        legalApprovalReceivedAdditionalTemplateId: mailConfig.brevoTemplateLegalApprovalReceivedAdditionalId ?? 0,
        legalReturnedToHodTemplateId: mailConfig.brevoTemplateLegalReturnedToHodId ?? 0,
        legalContractRejectedTemplateId: mailConfig.brevoTemplateLegalContractRejectedId ?? 0,
      },
      logger
    )
  }

  return contractApprovalNotificationService
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

export function getSystemConfigurationService(): SystemConfigurationService {
  if (!systemConfigurationService) {
    systemConfigurationService = new SystemConfigurationService(supabaseSystemConfigurationRepository)
  }

  return systemConfigurationService
}

export function getAuditViewerService(): AuditViewerService {
  if (!auditViewerService) {
    auditViewerService = new AuditViewerService(supabaseAdminAuditViewerRepository)
  }

  return auditViewerService
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
  contractSignatoryService = null
  contractApprovalNotificationService = null
  roleGovernanceService = null
  adminQueryService = null
  teamGovernanceService = null
  systemConfigurationService = null
  auditViewerService = null
}

// Export types for use in other files
export type { EmployeeRepository } from '@/core/domain/users/employee-repository'
