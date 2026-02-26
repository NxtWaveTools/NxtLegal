import {
  contractNotificationChannels,
  contractNotificationPolicy,
  contractNotificationStatuses,
  contractNotificationTypes,
  contractStatuses,
} from '@/core/constants/contracts'
import { BusinessRuleError } from '@/core/http/errors'
import type { ContractQueryService } from '@/core/domain/contracts/contract-query-service'

type MailSender = {
  sendTemplateEmail(input: {
    recipientEmail: string
    templateId: number
    templateParams: Record<string, unknown>
  }): Promise<{ providerMessageId?: string }>
}

type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
}

type NotificationTemplates = {
  hodApprovalRequestedTemplateId: number
  approvalReminderTemplateId: number
  additionalApproverAddedTemplateId: number
  legalInternalAssignmentTemplateId: number
  legalApprovalReceivedHodTemplateId: number
  legalApprovalReceivedAdditionalTemplateId: number
  legalReturnedToHodTemplateId: number
  legalContractRejectedTemplateId: number
}

const LEGAL_TEAM_ALIAS_EMAIL = 'legalteam@nxtwave.co.in'

export class ContractApprovalNotificationService {
  constructor(
    private readonly contractQueryService: ContractQueryService,
    private readonly mailSender: MailSender,
    private readonly templates: NotificationTemplates,
    private readonly logger: Logger
  ) {}

  private getContractLink(contractId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `${baseUrl}/contracts/${contractId}`
  }

  private isLegalTeamAlias(email: string): boolean {
    return email.trim().toLowerCase() === LEGAL_TEAM_ALIAS_EMAIL
  }

  async notifyHodOnContractUpload(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
  }): Promise<void> {
    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const recipientEmail = contractView.contract.departmentHodEmail?.trim().toLowerCase()
    if (!recipientEmail) {
      this.logger.warn('Skipping HOD notification; department HOD email is missing', {
        tenantId: params.tenantId,
        contractId: params.contractId,
      })
      return
    }

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      templateId: this.templates.hodApprovalRequestedTemplateId,
      notificationType: contractNotificationTypes.hodApprovalRequested,
      templateParams: {
        'contact.CONTRACT_TITLE': contractView.contract.title,
        'contact.APPROVER_ROLE': 'HOD',
        'contact.LINK': this.getContractLink(params.contractId),
      },
      metadata: {
        trigger: 'CONTRACT_UPLOAD',
      },
    })
  }

  async notifyAdditionalApproverAdded(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    approverEmail: string
  }): Promise<void> {
    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const recipientEmail = params.approverEmail.trim().toLowerCase()

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      templateId: this.templates.additionalApproverAddedTemplateId,
      notificationType: contractNotificationTypes.additionalApproverAdded,
      templateParams: {
        'contact.CONTRACT_TITLE': contractView.contract.title,
        'contact.APPROVER_ROLE': 'ADDITIONAL_APPROVER',
        'contact.LINK': this.getContractLink(params.contractId),
      },
      metadata: {
        trigger: 'ADD_APPROVER',
      },
    })
  }

  async remindPendingApprover(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    requestedApproverEmail?: string
  }): Promise<{ recipientEmail: string; recipientRole: 'HOD' | 'ADDITIONAL'; blockedByCooldown: boolean }> {
    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const normalizedRequestedEmail = params.requestedApproverEmail?.trim().toLowerCase()
    const pendingAdditionalApprover = [...contractView.additionalApprovers]
      .sort((first, second) => first.sequenceOrder - second.sequenceOrder)
      .find((approver) => approver.status === 'PENDING')

    let recipientEmail = ''
    let recipientRole: 'HOD' | 'ADDITIONAL' = 'HOD'

    if (contractView.contract.status === contractStatuses.hodPending) {
      const hodEmail = contractView.contract.departmentHodEmail?.trim().toLowerCase() ?? ''
      if (!hodEmail) {
        throw new BusinessRuleError('HOD_EMAIL_MISSING', 'Department HOD email is missing for this contract')
      }

      if (normalizedRequestedEmail && normalizedRequestedEmail !== hodEmail) {
        throw new BusinessRuleError('APPROVER_MISMATCH', 'Requested approver is not currently blocking this contract')
      }

      recipientEmail = hodEmail
      recipientRole = 'HOD'
    } else {
      if (!pendingAdditionalApprover) {
        throw new BusinessRuleError('NO_PENDING_APPROVER', 'There is no pending additional approver for this contract')
      }

      if (
        normalizedRequestedEmail &&
        normalizedRequestedEmail !== pendingAdditionalApprover.approverEmail.trim().toLowerCase()
      ) {
        throw new BusinessRuleError('APPROVER_MISMATCH', 'Requested approver is not currently blocking this contract')
      }

      recipientEmail = pendingAdditionalApprover.approverEmail.trim().toLowerCase()
      recipientRole = 'ADDITIONAL'
    }

    const latestReminder = await this.contractQueryService.getLatestNotificationDelivery({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      notificationType: contractNotificationTypes.approvalReminder,
    })

    if (latestReminder) {
      const lastSentAt = new Date(latestReminder.createdAt).getTime()
      const cooldownMs = contractNotificationPolicy.approvalReminderCooldownHours * 60 * 60 * 1000
      if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < cooldownMs) {
        return {
          recipientEmail,
          recipientRole,
          blockedByCooldown: true,
        }
      }
    }

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      templateId: this.templates.approvalReminderTemplateId,
      notificationType: contractNotificationTypes.approvalReminder,
      templateParams: {
        'contact.CONTRACT_TITLE': contractView.contract.title,
        'contact.APPROVER_ROLE': recipientRole,
        'contact.LINK': this.getContractLink(params.contractId),
      },
      metadata: {
        trigger: 'MANUAL_REMIND',
      },
    })

    return {
      recipientEmail,
      recipientRole,
      blockedByCooldown: false,
    }
  }

  async notifyInternalAssignment(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    assignedEmail: string
  }): Promise<void> {
    const recipientEmail = params.assignedEmail.trim().toLowerCase()
    if (!recipientEmail || this.isLegalTeamAlias(recipientEmail)) {
      return
    }

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      templateId: this.templates.legalInternalAssignmentTemplateId,
      notificationType: contractNotificationTypes.legalInternalAssignment,
      templateParams: {
        'contact.CONTRACT_TITLE': contractView.contract.title,
        'contact.LINK': this.getContractLink(params.contractId),
      },
      metadata: {
        trigger: 'LEGAL_INTERNAL_ASSIGNMENT',
      },
    })
  }

  async notifyApprovalReceived(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    event: 'HOD_APPROVED' | 'ADDITIONAL_APPROVED'
    legalOwnerEmail?: string | null
  }): Promise<void> {
    const recipientEmail = params.legalOwnerEmail?.trim().toLowerCase() ?? ''
    if (!recipientEmail || this.isLegalTeamAlias(recipientEmail)) {
      return
    }

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const templateId =
      params.event === 'HOD_APPROVED'
        ? this.templates.legalApprovalReceivedHodTemplateId
        : this.templates.legalApprovalReceivedAdditionalTemplateId
    const notificationType =
      params.event === 'HOD_APPROVED'
        ? contractNotificationTypes.legalApprovalReceivedHod
        : contractNotificationTypes.legalApprovalReceivedAdditional

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      templateId,
      notificationType,
      templateParams: {
        'contact.CONTRACT_TITLE': contractView.contract.title,
        'contact.LINK': this.getContractLink(params.contractId),
      },
      metadata: {
        trigger: params.event,
      },
    })
  }

  async notifyReturnedToHod(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    hodEmail?: string | null
  }): Promise<void> {
    const recipientEmail = params.hodEmail?.trim().toLowerCase() ?? ''
    if (!recipientEmail) {
      return
    }

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      templateId: this.templates.legalReturnedToHodTemplateId,
      notificationType: contractNotificationTypes.legalReturnedToHod,
      templateParams: {
        'contact.CONTRACT_TITLE': contractView.contract.title,
        'contact.LINK': this.getContractLink(params.contractId),
      },
      metadata: {
        trigger: 'REROUTE_TO_HOD',
      },
    })
  }

  async notifyContractRejected(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    recipientEmails: string[]
    trigger: 'LEGAL_REJECTION' | 'HOD_REJECTED'
  }): Promise<void> {
    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const recipients = Array.from(
      new Set(params.recipientEmails.map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0))
    )

    for (const recipientEmail of recipients) {
      await this.dispatchNotification({
        tenantId: params.tenantId,
        contractId: params.contractId,
        recipientEmail,
        templateId: this.templates.legalContractRejectedTemplateId,
        notificationType: contractNotificationTypes.legalContractRejected,
        templateParams: {
          'contact.CONTRACT_TITLE': contractView.contract.title,
          'contact.LINK': this.getContractLink(params.contractId),
        },
        metadata: {
          trigger: params.trigger,
        },
      })
    }
  }

  private async dispatchNotification(params: {
    tenantId: string
    contractId: string
    recipientEmail: string
    templateId: number
    notificationType:
      | 'HOD_APPROVAL_REQUESTED'
      | 'APPROVAL_REMINDER'
      | 'ADDITIONAL_APPROVER_ADDED'
      | 'LEGAL_INTERNAL_ASSIGNMENT'
      | 'LEGAL_APPROVAL_RECEIVED_HOD'
      | 'LEGAL_APPROVAL_RECEIVED_ADDITIONAL'
      | 'LEGAL_RETURNED_TO_HOD'
      | 'LEGAL_CONTRACT_REJECTED'
    templateParams: Record<string, unknown>
    metadata?: Record<string, unknown>
  }): Promise<void> {
    if (!params.templateId || params.templateId <= 0) {
      this.logger.warn('Skipping contract approval notification; template id is missing', {
        tenantId: params.tenantId,
        contractId: params.contractId,
        notificationType: params.notificationType,
      })
      return
    }

    try {
      const delivery = await this.mailSender.sendTemplateEmail({
        recipientEmail: params.recipientEmail,
        templateId: params.templateId,
        templateParams: params.templateParams,
      })

      await this.contractQueryService.recordContractNotificationDelivery({
        tenantId: params.tenantId,
        contractId: params.contractId,
        recipientEmail: params.recipientEmail,
        channel: contractNotificationChannels.email,
        notificationType: params.notificationType,
        templateId: params.templateId,
        providerName: 'BREVO',
        providerMessageId: delivery.providerMessageId,
        status: contractNotificationStatuses.sent,
        retryCount: 0,
        maxRetries: contractNotificationPolicy.maxRetries,
        metadata: params.metadata,
      })
    } catch (error) {
      this.logger.error('Contract approval notification delivery failed', {
        tenantId: params.tenantId,
        contractId: params.contractId,
        notificationType: params.notificationType,
        recipientEmail: params.recipientEmail,
        error: String(error),
      })

      await this.contractQueryService.recordContractNotificationDelivery({
        tenantId: params.tenantId,
        contractId: params.contractId,
        recipientEmail: params.recipientEmail,
        channel: contractNotificationChannels.email,
        notificationType: params.notificationType,
        templateId: params.templateId,
        providerName: 'BREVO',
        status: contractNotificationStatuses.failed,
        retryCount: 0,
        maxRetries: contractNotificationPolicy.maxRetries,
        lastError: String(error),
        metadata: params.metadata,
      })

      throw error
    }
  }
}
