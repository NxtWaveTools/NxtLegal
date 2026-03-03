import {
  contractNotificationChannels,
  contractNotificationPolicy,
  contractNotificationStatuses,
  contractNotificationTemplates,
  contractNotificationTypes,
  contractStatuses,
} from '@/core/constants/contracts'
import { BusinessRuleError } from '@/core/http/errors'
import type { ContractQueryService } from '@/core/domain/contracts/contract-query-service'
import { buildMasterTemplate } from '@/lib/email/master-template'

type MailSender = {
  sendTemplateEmail(input: {
    recipientEmail: string
    subject: string
    htmlContent: string
    tags?: string[]
  }): Promise<{ providerMessageId?: string }>
}

type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
}

export class ContractApprovalNotificationService {
  constructor(
    private readonly contractQueryService: ContractQueryService,
    private readonly mailSender: MailSender,
    private readonly _legacyTemplates: Record<string, number> | undefined,
    private readonly logger: Logger
  ) {}

  private getContractLink(contractId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `${baseUrl}/contracts/${contractId}`
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

    const recipientEmail =
      contractView.contract.currentAssigneeEmail?.trim().toLowerCase() ||
      contractView.contract.departmentHodEmail?.trim().toLowerCase()
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
      subject: `Action Required: Approve Contract for ${contractView.contract.title}`,
      htmlContent: buildMasterTemplate({
        title: 'Contract Approval Request',
        greeting: 'Hello HOD,',
        messageText: `${contractView.contract.uploadedByEmail} submitted ${contractView.contract.title} and it requires your approval.`,
        buttonText: 'Review Contract',
        buttonLink: this.getContractLink(params.contractId),
        footerText: 'Please review and approve or reject this contract request.',
      }),
      notificationType: contractNotificationTypes.hodApprovalRequested,
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
      subject: `Approval Assignment: ${contractView.contract.title}`,
      htmlContent: buildMasterTemplate({
        title: 'New Approval Assignment',
        greeting: 'Hello Approver,',
        messageText: `You have been added as an approver for ${contractView.contract.title}.`,
        buttonText: 'View Contract',
        buttonLink: this.getContractLink(params.contractId),
        footerText: 'Please review the contract and submit your decision.',
      }),
      notificationType: contractNotificationTypes.additionalApproverAdded,
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
      const hodEmail =
        contractView.contract.currentAssigneeEmail?.trim().toLowerCase() ||
        contractView.contract.departmentHodEmail?.trim().toLowerCase() ||
        ''
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
      subject: `Reminder: Pending Approval for ${contractView.contract.title}`,
      htmlContent: buildMasterTemplate({
        title: 'Approval Reminder',
        greeting: `Hello ${recipientRole === 'HOD' ? 'HOD' : 'Approver'},`,
        messageText: `${contractView.contract.title} is still pending your approval.`,
        buttonText: 'Review Now',
        buttonLink: this.getContractLink(params.contractId),
        footerText: 'This reminder was sent because the contract is awaiting your action.',
      }),
      notificationType: contractNotificationTypes.approvalReminder,
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
      subject: `Legal Assignment: ${contractView.contract.title}`,
      htmlContent: buildMasterTemplate({
        title: 'Contract Assignment',
        greeting: 'Hello Legal Team,',
        messageText: `You were assigned legal work for ${contractView.contract.title}.`,
        buttonText: 'Open Contract',
        buttonLink: this.getContractLink(params.contractId),
        footerText: 'Please proceed with the legal review workflow.',
      }),
      notificationType: contractNotificationTypes.legalInternalAssignment,
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
    if (!recipientEmail) {
      return
    }

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const notificationType =
      params.event === 'HOD_APPROVED'
        ? contractNotificationTypes.legalApprovalReceivedHod
        : contractNotificationTypes.legalApprovalReceivedAdditional

    const approvalEventLabel = params.event === 'HOD_APPROVED' ? 'HOD approval' : 'additional approval'

    await this.dispatchNotification({
      tenantId: params.tenantId,
      contractId: params.contractId,
      recipientEmail,
      subject: `Approval Received: ${contractView.contract.title}`,
      htmlContent: buildMasterTemplate({
        title: 'Approval Received',
        greeting: 'Hello Legal Team,',
        messageText: `${approvalEventLabel} was recorded for ${contractView.contract.title}.`,
        buttonText: 'Review Contract',
        buttonLink: this.getContractLink(params.contractId),
        footerText: 'Continue processing this contract based on the current workflow status.',
      }),
      notificationType,
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
      subject: `Returned to HOD: ${contractView.contract.title}`,
      htmlContent: buildMasterTemplate({
        title: 'Contract Returned to HOD',
        greeting: 'Hello HOD,',
        messageText: `${contractView.contract.title} has been rerouted to you for review.`,
        buttonText: 'Open Contract',
        buttonLink: this.getContractLink(params.contractId),
        footerText: 'Please review and submit your decision to continue workflow.',
      }),
      notificationType: contractNotificationTypes.legalReturnedToHod,
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
        subject: `Contract Rejected: ${contractView.contract.title}`,
        htmlContent: buildMasterTemplate({
          title: 'Contract Rejected',
          greeting: 'Hello,',
          messageText: `${contractView.contract.title} has been rejected in the approval workflow.`,
          buttonText: 'View Details',
          buttonLink: this.getContractLink(params.contractId),
          footerText: 'Open the contract for rejection context and required next steps.',
        }),
        notificationType: contractNotificationTypes.legalContractRejected,
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
    subject: string
    htmlContent: string
    notificationType:
      | 'HOD_APPROVAL_REQUESTED'
      | 'APPROVAL_REMINDER'
      | 'ADDITIONAL_APPROVER_ADDED'
      | 'LEGAL_INTERNAL_ASSIGNMENT'
      | 'LEGAL_APPROVAL_RECEIVED_HOD'
      | 'LEGAL_APPROVAL_RECEIVED_ADDITIONAL'
      | 'LEGAL_RETURNED_TO_HOD'
      | 'LEGAL_CONTRACT_REJECTED'
    metadata?: Record<string, unknown>
  }): Promise<void> {
    try {
      const delivery = await this.mailSender.sendTemplateEmail({
        recipientEmail: params.recipientEmail,
        subject: params.subject,
        htmlContent: params.htmlContent,
        tags: ['contract-workflow'],
      })

      await this.contractQueryService.recordContractNotificationDelivery({
        tenantId: params.tenantId,
        contractId: params.contractId,
        recipientEmail: params.recipientEmail,
        channel: contractNotificationChannels.email,
        notificationType: params.notificationType,
        templateId: contractNotificationTemplates.masterHtmlInline,
        providerName: 'BREVO',
        providerMessageId: delivery.providerMessageId,
        status: contractNotificationStatuses.sent,
        retryCount: 0,
        maxRetries: contractNotificationPolicy.maxRetries,
        metadata: {
          ...params.metadata,
          template_mode: 'MASTER_HTML',
          subject: params.subject,
        },
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
        templateId: contractNotificationTemplates.masterHtmlInline,
        providerName: 'BREVO',
        status: contractNotificationStatuses.failed,
        retryCount: 0,
        maxRetries: contractNotificationPolicy.maxRetries,
        lastError: String(error),
        metadata: {
          ...params.metadata,
          template_mode: 'MASTER_HTML',
          subject: params.subject,
        },
      })

      throw error
    }
  }
}
