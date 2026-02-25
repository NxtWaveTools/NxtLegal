import { AuthorizationError, BusinessRuleError, ExternalServiceError } from '@/core/http/errors'
import {
  contractNotificationChannels,
  contractNotificationPolicy,
  contractNotificationStatuses,
  contractNotificationTypes,
  contractAuditActions,
  contractAuditEvents,
  contractSignatoryRecipientTypes,
  contractStatuses,
} from '@/core/constants/contracts'
import type { ContractDetailView } from '@/core/domain/contracts/contract-query-repository'
import type { ContractRepository } from '@/core/domain/contracts/contract-repository'
import type { ContractStorageRepository } from '@/core/domain/contracts/contract-storage-repository'
import type { ContractQueryService } from '@/core/domain/contracts/contract-query-service'

type ContractDocumentDownloadService = {
  createSignedDownloadUrl(params: {
    contractId: string
    tenantId: string
    requestorEmployeeId: string
    requestorRole: string
    documentId?: string
  }): Promise<{ signedUrl: string; fileName: string }>
}

type SignatureProvider = {
  createSigningEnvelope(input: {
    recipients: Array<{
      email: string
      name: string
      recipientType: 'INTERNAL' | 'EXTERNAL'
      routingOrder: number
      fields: Array<{
        fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
        pageNumber: number | null
        xPosition: number | null
        yPosition: number | null
        anchorString: string | null
        assignedSignerEmail: string
      }>
    }>
    documentName: string
    documentMimeType: string
    documentBytes: Uint8Array
    emailSubject: string
    returnUrl: string
  }): Promise<{
    envelopeId: string
    recipients: Array<{
      email: string
      recipientId: string
      clientUserId: string
      signingUrl: string
    }>
  }>
  downloadCompletedEnvelopeDocuments(params: {
    envelopeId: string
  }): Promise<{ executedPdf: Uint8Array; certificatePdf: Uint8Array }>
}

type SignatoryMailer = {
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

type DocusignCanonicalStatus =
  | 'SENT'
  | 'DELIVERED'
  | 'VIEWED'
  | 'SIGNED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'UNKNOWN'

export class ContractSignatoryService {
  constructor(
    private readonly contractQueryService: ContractQueryService,
    private readonly contractDocumentDownloadService: ContractDocumentDownloadService,
    private readonly contractRepository: ContractRepository,
    private readonly contractStorageRepository: ContractStorageRepository,
    private readonly signatureProvider: SignatureProvider,
    private readonly signatoryMailer: SignatoryMailer,
    private readonly notificationTemplates: {
      signatoryLinkTemplateId: number
      signingCompletedTemplateId: number
    },
    private readonly appSiteUrl: string,
    private readonly logger: Logger
  ) {}

  async assignSignatory(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    recipients: Array<{
      signatoryEmail: string
      recipientType: 'INTERNAL' | 'EXTERNAL'
      routingOrder: number
      fields: Array<{
        field_type: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
        page_number?: number
        x_position?: number
        y_position?: number
        anchor_string?: string
        assigned_signer_email: string
      }>
    }>
  }): Promise<ContractDetailView> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signatory assignment')
    }

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    if (contractView.contract.status !== contractStatuses.finalApproved) {
      throw new BusinessRuleError(
        'SIGNATORY_ASSIGN_INVALID_STATUS',
        'Signatories can only be assigned in FINAL_APPROVED'
      )
    }

    const normalizedRecipients = params.recipients.map((recipient) => ({
      signatoryEmail: recipient.signatoryEmail.trim().toLowerCase(),
      recipientType: recipient.recipientType,
      routingOrder: recipient.routingOrder,
      fields: recipient.fields.map((field) => ({
        fieldType: field.field_type,
        pageNumber: field.page_number ?? null,
        xPosition: field.x_position ?? null,
        yPosition: field.y_position ?? null,
        anchorString: field.anchor_string ?? null,
        assignedSignerEmail: field.assigned_signer_email.trim().toLowerCase(),
      })),
    }))

    if (!contractView.contract.currentDocumentId) {
      throw new BusinessRuleError(
        'CONTRACT_CURRENT_DOCUMENT_MISSING',
        'Active contract document is missing for signing'
      )
    }

    const download = await this.contractDocumentDownloadService.createSignedDownloadUrl({
      contractId: params.contractId,
      tenantId: params.tenantId,
      requestorEmployeeId: params.actorEmployeeId,
      requestorRole: params.actorRole,
      documentId: contractView.contract.currentDocumentId,
    })

    let documentBytes: Uint8Array
    let documentMimeType = 'application/octet-stream'

    try {
      const documentResponse = await fetch(download.signedUrl)
      if (!documentResponse.ok) {
        throw new BusinessRuleError('CONTRACT_DOCUMENT_FETCH_FAILED', 'Failed to fetch contract document for signing')
      }

      documentBytes = new Uint8Array(await documentResponse.arrayBuffer())
      documentMimeType = documentResponse.headers.get('content-type') ?? 'application/octet-stream'
    } catch (error) {
      if (error instanceof BusinessRuleError) {
        throw error
      }

      throw new BusinessRuleError('CONTRACT_DOCUMENT_FETCH_FAILED', 'Failed to fetch contract document for signing')
    }

    let envelope: {
      envelopeId: string
      recipients: Array<{
        email: string
        recipientId: string
        clientUserId: string
        signingUrl: string
      }>
    }

    try {
      envelope = await this.signatureProvider.createSigningEnvelope({
        recipients: normalizedRecipients.map((recipient) => ({
          email: recipient.signatoryEmail,
          name: recipient.signatoryEmail,
          recipientType: recipient.recipientType,
          routingOrder: recipient.routingOrder,
          fields: recipient.fields,
        })),
        documentName: download.fileName,
        documentMimeType,
        documentBytes,
        emailSubject: `Signature requested for ${contractView.contract.title}`,
        returnUrl: `${this.appSiteUrl}/contracts/${params.contractId}`,
      })
    } catch (error) {
      throw new ExternalServiceError('DOCUSIGN', 'Failed to create DocuSign envelope', error as Error)
    }

    if (!envelope?.envelopeId) {
      throw new BusinessRuleError('SIGNING_PREPARATION_ENVELOPE_MISSING', 'Envelope ID missing after signing send')
    }

    const envelopeRecipientByEmail = new Map(
      (envelope.recipients ?? []).map((recipient) => [recipient.email, recipient])
    )

    for (const recipient of normalizedRecipients) {
      const envelopeRecipient = envelopeRecipientByEmail.get(recipient.signatoryEmail)
      if (!envelopeRecipient) {
        throw new ExternalServiceError('DOCUSIGN', `Missing recipient view URL for ${recipient.signatoryEmail}`)
      }

      if (recipient.recipientType === contractSignatoryRecipientTypes.external) {
        await this.dispatchTemplateNotificationWithRetry({
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: envelope.envelopeId,
          recipientEmail: recipient.signatoryEmail,
          templateId: this.notificationTemplates.signatoryLinkTemplateId,
          notificationType: contractNotificationTypes.signatoryLink,
          templateParams: {
            contract_title: contractView.contract.title,
            signing_url: envelopeRecipient.signingUrl,
          },
          strictFailure: true,
        })
      }
    }

    let updatedView: ContractDetailView | null = null
    for (const recipient of normalizedRecipients) {
      const envelopeRecipient = envelopeRecipientByEmail.get(recipient.signatoryEmail)
      if (!envelopeRecipient) {
        continue
      }

      updatedView = await this.contractQueryService.addSignatory({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
        signatoryEmail: recipient.signatoryEmail,
        recipientType: recipient.recipientType,
        routingOrder: recipient.routingOrder,
        fieldConfig: recipient.fields,
        docusignEnvelopeId: envelope.envelopeId,
        docusignRecipientId: envelopeRecipient.recipientId,
        envelopeSourceDocumentId: contractView.contract.currentDocumentId,
      })
    }

    if (!updatedView) {
      throw new BusinessRuleError('SIGNATORY_ASSIGNMENT_FAILED', 'No signatory recipient was persisted')
    }

    this.logger.info('Contract signatory assigned', {
      tenantId: params.tenantId,
      contractId: params.contractId,
      signatoryEmails: normalizedRecipients.map((recipient) => recipient.signatoryEmail),
      envelopeId: envelope.envelopeId,
    })

    return updatedView
  }

  async sendSigningPreparationDraft(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
  }): Promise<{ envelopeId: string; contractView: ContractDetailView }> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signing preparation send')
    }

    const pendingSignatoryCount = await this.contractQueryService.countPendingSignatoriesByContract({
      tenantId: params.tenantId,
      contractId: params.contractId,
    })

    if (pendingSignatoryCount > 0) {
      throw new BusinessRuleError(
        'SIGNING_PREPARATION_ALREADY_SENT',
        'Signing preparation draft already sent for this contract'
      )
    }

    const draft = await this.contractQueryService.getSigningPreparationDraft({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
    })

    if (!draft) {
      throw new BusinessRuleError('SIGNING_PREPARATION_DRAFT_NOT_FOUND', 'Signing preparation draft not found')
    }

    this.assertValidRoutingOrders(
      draft.recipients.map((recipient) => ({ email: recipient.email, routingOrder: recipient.routingOrder }))
    )

    this.assertSignatureFieldPerRecipient({
      recipients: draft.recipients.map((recipient) => recipient.email),
      fields: draft.fields.map((field) => ({
        fieldType: field.fieldType,
        assignedSignerEmail: field.assignedSignerEmail,
      })),
    })

    const recipients = draft.recipients.map((recipient) => {
      const recipientEmail = recipient.email.trim().toLowerCase()
      const recipientFields = draft.fields
        .filter((field) => field.assignedSignerEmail.trim().toLowerCase() === recipientEmail)
        .map((field) => ({
          field_type: field.fieldType,
          page_number: field.pageNumber ?? undefined,
          x_position: field.xPosition ?? undefined,
          y_position: field.yPosition ?? undefined,
          anchor_string: field.anchorString ?? undefined,
          assigned_signer_email: field.assignedSignerEmail,
        }))

      return {
        signatoryEmail: recipientEmail,
        recipientType: recipient.recipientType,
        routingOrder: recipient.routingOrder,
        fields: recipientFields,
      }
    })

    const updatedContractView = await this.assignSignatory({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      recipients,
    })

    const recipientEmailSet = new Set(recipients.map((recipient) => recipient.signatoryEmail))
    const envelopeIds = new Set(
      updatedContractView.signatories
        .filter((signatory) => recipientEmailSet.has(signatory.signatoryEmail))
        .map((signatory) => signatory.docusignEnvelopeId)
        .filter((envelopeId) => envelopeId.trim().length > 0)
    )

    const envelopeId = envelopeIds.values().next().value
    if (!envelopeId || typeof envelopeId !== 'string') {
      throw new BusinessRuleError('SIGNING_PREPARATION_ENVELOPE_MISSING', 'Envelope ID missing after signing send')
    }

    await this.contractQueryService.moveContractToInSignature({
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail,
      envelopeId,
    })

    await this.contractQueryService.deleteSigningPreparationDraft({
      tenantId: params.tenantId,
      contractId: params.contractId,
    })

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    return {
      envelopeId,
      contractView,
    }
  }

  async handleDocusignSignedWebhook(params: {
    envelopeId: string
    recipientEmail?: string
    status: string
    signedAt?: string
    eventId?: string
    signerIp?: string
    payload: Record<string, unknown>
  }): Promise<void> {
    const normalizedStatus = this.normalizeWebhookStatus(params.status)
    const envelopeContext = await this.contractQueryService.resolveEnvelopeContext({
      envelopeId: params.envelopeId,
      recipientEmail: params.recipientEmail,
    })

    if (!envelopeContext) {
      this.logger.warn('DocuSign webhook ignored: envelope context not found', {
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
      })
      return
    }

    const eventKey = `${params.envelopeId}:${params.recipientEmail ?? 'ALL'}:${normalizedStatus}:${params.eventId ?? 'NO_EVENT_ID'}`

    const webhookInsert = await this.contractQueryService.recordDocusignWebhookEvent({
      tenantId: envelopeContext.tenantId,
      contractId: envelopeContext.contractId,
      envelopeId: params.envelopeId,
      recipientEmail: params.recipientEmail,
      eventType: normalizedStatus,
      eventKey,
      payload: params.payload,
      signerIp: params.signerIp,
    })

    if (!webhookInsert.inserted) {
      this.logger.info('DocuSign webhook deduped', {
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
        status: normalizedStatus,
      })
    }

    const mappedAudit = this.mapWebhookStatusToAudit(normalizedStatus)
    if (mappedAudit && webhookInsert.inserted) {
      await this.contractQueryService.addSignatoryWebhookAuditEvent({
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        eventType: mappedAudit.eventType,
        action: mappedAudit.action,
        recipientEmail: params.recipientEmail ?? envelopeContext.signatoryEmail,
        metadata: {
          envelope_id: params.envelopeId,
          routing_order: envelopeContext.routingOrder,
          recipient_type: envelopeContext.recipientType,
          signer_ip: params.signerIp ?? null,
        },
      })
    }

    if (normalizedStatus !== 'COMPLETED' && normalizedStatus !== 'SIGNED') {
      return
    }

    await this.contractQueryService.markSignatoryAsSigned({
      tenantId: envelopeContext.tenantId,
      envelopeId: params.envelopeId,
      recipientEmail: params.recipientEmail,
      signedAt: params.signedAt,
    })

    if (normalizedStatus === 'COMPLETED') {
      this.logger.info('DOCUSIGN_COMPLETION_EVALUATION', {
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
        insertedWebhookEvent: webhookInsert.inserted,
      })

      const artifactsExist = await this.hasCompletionArtifacts(
        params.envelopeId,
        envelopeContext.tenantId,
        envelopeContext.contractId
      )

      this.logger.info('DOCUSIGN_COMPLETION_IDEMPOTENCY_CHECK', {
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        envelopeId: params.envelopeId,
        artifactsExist,
      })

      if (artifactsExist) {
        this.logger.info('DOCUSIGN_ARTIFACT_ALREADY_EXISTS', {
          tenantId: envelopeContext.tenantId,
          contractId: envelopeContext.contractId,
          envelopeId: params.envelopeId,
        })
      } else {
        await this.persistCompletionArtifacts({
          tenantId: envelopeContext.tenantId,
          contractId: envelopeContext.contractId,
          envelopeId: params.envelopeId,
        })
      }

      if (webhookInsert.inserted) {
        await this.sendCompletionNotifications({
          tenantId: envelopeContext.tenantId,
          contractId: envelopeContext.contractId,
          envelopeId: params.envelopeId,
        })
      }
    }
  }

  private async sendCompletionNotifications(params: {
    tenantId: string
    contractId: string
    envelopeId: string
  }): Promise<void> {
    const profile = await this.contractQueryService.getEnvelopeNotificationProfile({
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
    })

    if (!profile || profile.recipientEmails.length === 0) {
      this.logger.warn('Completion notification skipped: no recipients found', {
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
      })
      return
    }

    for (const recipientEmail of profile.recipientEmails) {
      await this.dispatchTemplateNotificationWithRetry({
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
        recipientEmail,
        templateId: this.notificationTemplates.signingCompletedTemplateId,
        notificationType: contractNotificationTypes.signingCompleted,
        templateParams: {
          contract_title: profile.contractTitle,
          contract_link: `${this.appSiteUrl}/contracts/${params.contractId}`,
        },
        strictFailure: false,
      })
    }
  }

  private async dispatchTemplateNotificationWithRetry(params: {
    tenantId: string
    contractId: string
    envelopeId?: string
    recipientEmail: string
    templateId: number
    notificationType: 'SIGNATORY_LINK' | 'SIGNING_COMPLETED'
    templateParams: Record<string, unknown>
    strictFailure: boolean
  }): Promise<void> {
    const maxRetries = contractNotificationPolicy.maxRetries

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const retryCount = attempt
      try {
        const response = await this.signatoryMailer.sendTemplateEmail({
          recipientEmail: params.recipientEmail,
          templateId: params.templateId,
          templateParams: params.templateParams,
        })

        await this.contractQueryService.recordContractNotificationDelivery({
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          recipientEmail: params.recipientEmail,
          channel: contractNotificationChannels.email,
          notificationType: params.notificationType,
          templateId: params.templateId,
          providerName: 'BREVO',
          providerMessageId: response.providerMessageId,
          status: contractNotificationStatuses.sent,
          retryCount,
          maxRetries,
          metadata: {
            template_params: params.templateParams,
          },
        })

        return
      } catch (error) {
        const willRetry = retryCount < maxRetries
        const nextRetryAt = willRetry
          ? new Date(
              Date.now() + contractNotificationPolicy.retryBaseDelayMinutes * 60_000 * Math.max(1, 2 ** retryCount)
            ).toISOString()
          : undefined

        await this.contractQueryService.recordContractNotificationDelivery({
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          recipientEmail: params.recipientEmail,
          channel: contractNotificationChannels.email,
          notificationType: params.notificationType,
          templateId: params.templateId,
          providerName: 'BREVO',
          status: contractNotificationStatuses.failed,
          retryCount,
          maxRetries,
          nextRetryAt,
          lastError: error instanceof Error ? error.message : String(error),
          metadata: {
            template_params: params.templateParams,
          },
        })

        if (willRetry) {
          continue
        }

        if (params.strictFailure) {
          throw new ExternalServiceError('BREVO', 'Failed to send signatory email', error as Error)
        }

        this.logger.error('Completion notification delivery failed after retries', {
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          recipientEmail: params.recipientEmail,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private mapWebhookStatusToAudit(status: DocusignCanonicalStatus): {
    eventType: string
    action: string
  } | null {
    switch (status) {
      case 'SENT':
        return { eventType: contractAuditEvents.signatorySent, action: contractAuditActions.signatorySent }
      case 'DELIVERED':
        return { eventType: contractAuditEvents.signatoryDelivered, action: contractAuditActions.signatoryDelivered }
      case 'VIEWED':
        return { eventType: contractAuditEvents.signatoryViewed, action: contractAuditActions.signatoryViewed }
      case 'SIGNED':
        return { eventType: contractAuditEvents.signatorySigned, action: contractAuditActions.signatorySigned }
      case 'COMPLETED':
        return { eventType: contractAuditEvents.signatoryCompleted, action: contractAuditActions.signatoryCompleted }
      case 'DECLINED':
        return { eventType: contractAuditEvents.signatoryDeclined, action: contractAuditActions.signatoryDeclined }
      case 'EXPIRED':
        return { eventType: contractAuditEvents.signatoryExpired, action: contractAuditActions.signatoryExpired }
      default:
        return null
    }
  }

  private normalizeWebhookStatus(status: string): DocusignCanonicalStatus {
    const normalizedToken = status
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (
      normalizedToken === 'COMPLETED' ||
      normalizedToken === 'ENVELOPE_COMPLETED' ||
      normalizedToken === 'RECIPIENT_COMPLETED' ||
      normalizedToken === 'DOCUMENT_COMPLETED'
    ) {
      return 'COMPLETED'
    }

    if (normalizedToken === 'SIGNED' || normalizedToken === 'RECIPIENT_SIGNED') {
      return 'SIGNED'
    }

    if (normalizedToken === 'SENT') {
      return 'SENT'
    }

    if (normalizedToken === 'DELIVERED') {
      return 'DELIVERED'
    }

    if (normalizedToken === 'VIEWED') {
      return 'VIEWED'
    }

    if (normalizedToken === 'DECLINED') {
      return 'DECLINED'
    }

    if (normalizedToken === 'EXPIRED') {
      return 'EXPIRED'
    }

    return 'UNKNOWN'
  }

  private async hasCompletionArtifacts(envelopeId: string, tenantId: string, contractId: string): Promise<boolean> {
    const documents = await this.contractQueryService.getContractDocumentsBySystem({
      tenantId,
      contractId,
    })

    const expectedExecutedFileName = `executed-${envelopeId}.pdf`
    const expectedCertificateFileName = `audit-certificate-${envelopeId}.pdf`

    const hasExecuted = documents.some(
      (document) => document.documentKind === 'EXECUTED_CONTRACT' && document.fileName === expectedExecutedFileName
    )
    const hasCertificate = documents.some(
      (document) => document.documentKind === 'AUDIT_CERTIFICATE' && document.fileName === expectedCertificateFileName
    )

    return hasExecuted && hasCertificate
  }

  private assertValidRoutingOrders(params: { email: string; routingOrder: number }[]): void {
    params.forEach((recipient) => {
      if (!Number.isInteger(recipient.routingOrder) || recipient.routingOrder < 1) {
        throw new BusinessRuleError(
          'SIGNING_PREPARATION_ROUTING_ORDER_INVALID',
          `Invalid routing_order for recipient ${recipient.email}`
        )
      }
    })
  }

  private assertSignatureFieldPerRecipient(params: {
    recipients: string[]
    fields: Array<{
      fieldType: 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'
      assignedSignerEmail: string
    }>
  }): void {
    const signaturesByRecipient = new Map<string, number>()

    params.fields.forEach((field) => {
      if (field.fieldType !== 'SIGNATURE') {
        return
      }

      const recipientEmail = field.assignedSignerEmail.trim().toLowerCase()
      signaturesByRecipient.set(recipientEmail, (signaturesByRecipient.get(recipientEmail) ?? 0) + 1)
    })

    params.recipients.forEach((recipientEmail) => {
      const normalized = recipientEmail.trim().toLowerCase()
      if ((signaturesByRecipient.get(normalized) ?? 0) < 1) {
        throw new BusinessRuleError(
          'SIGNING_PREPARATION_SIGNATURE_REQUIRED',
          `At least one SIGNATURE field is required for recipient ${normalized}`
        )
      }
    })
  }

  private async persistCompletionArtifacts(params: {
    tenantId: string
    contractId: string
    envelopeId: string
  }): Promise<void> {
    this.logger.info('DOCUSIGN_ARTIFACT_PERSIST_START', {
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
    })

    const artifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({
      envelopeId: params.envelopeId,
    })

    const documents = await this.contractQueryService.getContractDocumentsBySystem({
      tenantId: params.tenantId,
      contractId: params.contractId,
    })

    const expectedExecutedFileName = `executed-${params.envelopeId}.pdf`
    const expectedCertificateFileName = `audit-certificate-${params.envelopeId}.pdf`

    const hasExecuted = documents.some(
      (document) => document.documentKind === 'EXECUTED_CONTRACT' && document.fileName === expectedExecutedFileName
    )
    const hasCertificate = documents.some(
      (document) => document.documentKind === 'AUDIT_CERTIFICATE' && document.fileName === expectedCertificateFileName
    )

    const executedPath = `${params.tenantId}/${params.contractId}/executed/${params.envelopeId}/executed-contract.pdf`
    const certificatePath = `${params.tenantId}/${params.contractId}/executed/${params.envelopeId}/audit-certificate.pdf`

    await this.uploadCompletionArtifactSafely({
      path: executedPath,
      fileBytes: artifacts.executedPdf,
      contentType: 'application/pdf',
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
      artifactKind: 'EXECUTED_CONTRACT',
    })

    await this.uploadCompletionArtifactSafely({
      path: certificatePath,
      fileBytes: artifacts.certificatePdf,
      contentType: 'application/pdf',
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
      artifactKind: 'AUDIT_CERTIFICATE',
    })

    if (!hasExecuted) {
      await this.insertCompletionDocumentSafely({
        tenantId: params.tenantId,
        contractId: params.contractId,
        documentKind: 'EXECUTED_CONTRACT',
        displayName: 'Executed Contract',
        fileName: expectedExecutedFileName,
        filePath: executedPath,
        fileSizeBytes: artifacts.executedPdf.byteLength,
        fileMimeType: 'application/pdf',
        envelopeId: params.envelopeId,
      })
    }

    if (!hasCertificate) {
      await this.insertCompletionDocumentSafely({
        tenantId: params.tenantId,
        contractId: params.contractId,
        documentKind: 'AUDIT_CERTIFICATE',
        displayName: 'DocuSign Completion Certificate',
        fileName: expectedCertificateFileName,
        filePath: certificatePath,
        fileSizeBytes: artifacts.certificatePdf.byteLength,
        fileMimeType: 'application/pdf',
        envelopeId: params.envelopeId,
      })
    }

    this.logger.info('DOCUSIGN_ARTIFACT_PERSIST_SUCCESS', {
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
    })
  }

  private async uploadCompletionArtifactSafely(params: {
    path: string
    fileBytes: Uint8Array
    contentType: string
    tenantId: string
    contractId: string
    envelopeId: string
    artifactKind: 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
  }): Promise<void> {
    try {
      await this.contractStorageRepository.upload({
        path: params.path,
        fileBytes: params.fileBytes,
        contentType: params.contentType,
      })
    } catch (error) {
      if (this.isStorageAlreadyExistsError(error)) {
        this.logger.info('DOCUSIGN_ARTIFACT_ALREADY_EXISTS', {
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          artifactKind: params.artifactKind,
          layer: 'storage',
          path: params.path,
        })
        return
      }

      throw error
    }
  }

  private async insertCompletionDocumentSafely(params: {
    tenantId: string
    contractId: string
    documentKind: 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
    displayName: string
    fileName: string
    filePath: string
    fileSizeBytes: number
    fileMimeType: string
    envelopeId: string
  }): Promise<void> {
    try {
      await this.contractRepository.createDocument({
        tenantId: params.tenantId,
        contractId: params.contractId,
        documentKind: params.documentKind,
        displayName: params.displayName,
        fileName: params.fileName,
        filePath: params.filePath,
        fileSizeBytes: params.fileSizeBytes,
        fileMimeType: params.fileMimeType,
        uploadedByEmployeeId: 'SYSTEM',
        uploadedByEmail: 'system@internal',
      })
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.info('DOCUSIGN_ARTIFACT_ALREADY_EXISTS', {
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          artifactKind: params.documentKind,
          layer: 'database',
          fileName: params.fileName,
        })
        return
      }

      throw error
    }
  }

  private isStorageAlreadyExistsError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return message.includes('already exists') || message.includes('duplicate') || message.includes('conflict')
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const typed = error as { context?: { code?: string }; message?: string }
    if (typed?.context?.code === '23505') {
      return true
    }

    const message = typed?.message?.toLowerCase() ?? String(error).toLowerCase()
    return message.includes('duplicate key') || message.includes('unique constraint')
  }
}
