import { AuthorizationError, BusinessRuleError, ExternalServiceError } from '@/core/http/errors'
import { createSignatoryLinkToken } from '@/core/infra/security/signatory-link-token'
import {
  contractDocumentKinds,
  contractNotificationChannels,
  contractNotificationPolicy,
  contractNotificationStatuses,
  contractNotificationTemplates,
  contractNotificationTypes,
  contractAuditActions,
  contractAuditEvents,
  contractSignatoryRecipientTypes,
  contractStatuses,
  contractWorkflowRoles,
} from '@/core/constants/contracts'
import { buildMasterTemplate } from '@/lib/email/master-template'
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
  downloadEnvelopePdf?: (params: { envelopeId: string }) => Promise<Uint8Array>
  downloadCompletionCertificate?: (params: { envelopeId: string }) => Promise<Uint8Array>
  downloadCompletedEnvelopeDocuments?: (params: { envelopeId: string }) => Promise<{
    executedPdf: Uint8Array
    certificatePdf: Uint8Array
  }>
}

type SignatoryMailer = {
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

type SignatureCanonicalStatus =
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
    private readonly _legacyNotificationTemplates:
      | {
          signatoryLinkTemplateId: number
          signingCompletedTemplateId: number
        }
      | undefined,
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

    if (contractView.contract.status !== contractStatuses.completed) {
      throw new BusinessRuleError('SIGNATORY_ASSIGN_INVALID_STATUS', 'Signatories can only be assigned in COMPLETED')
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
      throw new ExternalServiceError('ZOHO_SIGN', 'Failed to create Zoho Sign request', error as Error)
    }

    if (!envelope?.envelopeId) {
      throw new BusinessRuleError('SIGNING_PREPARATION_ENVELOPE_MISSING', 'Envelope ID missing after signing send')
    }

    const envelopeRecipientByEmail = new Map(
      (envelope.recipients ?? []).map((recipient) => [recipient.email, recipient])
    )

    let updatedView: ContractDetailView | null = null
    for (const recipient of normalizedRecipients) {
      const envelopeRecipient = envelopeRecipientByEmail.get(recipient.signatoryEmail)
      if (!envelopeRecipient) {
        throw new ExternalServiceError(
          'ZOHO_SIGN',
          `Zoho Sign response missing recipient mapping for ${recipient.signatoryEmail}`
        )
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
        zohoSignEnvelopeId: envelope.envelopeId,
        zohoSignRecipientId: envelopeRecipient.recipientId,
        envelopeSourceDocumentId: contractView.contract.currentDocumentId,
      })
    }

    if (!updatedView) {
      throw new BusinessRuleError('SIGNATORY_ASSIGNMENT_FAILED', 'No signatory recipient was persisted')
    }

    for (const recipient of normalizedRecipients) {
      if (recipient.recipientType !== contractSignatoryRecipientTypes.internal) {
        continue
      }
      const envelopeRecipient = envelopeRecipientByEmail.get(recipient.signatoryEmail)
      if (!envelopeRecipient) {
        throw new ExternalServiceError('ZOHO_SIGN', `Missing recipient view URL for ${recipient.signatoryEmail}`)
      }

      const signingUrl = await this.buildSignatoryRedirectLink({
        envelopeId: envelope.envelopeId,
        recipientEmail: recipient.signatoryEmail,
        recipientId: envelopeRecipient.recipientId,
      })

      const subject = `Signature Requested: ${contractView.contract.title}`
      const htmlContent = buildMasterTemplate({
        title: 'Signature Requested',
        greeting: 'Hello,',
        messageText: `A signature has been requested for ${contractView.contract.title} by ${params.actorEmail}.`,
        buttonText: 'Review & Sign Contract',
        buttonLink: signingUrl,
        footerText: 'Please complete signing at your earliest convenience.',
      })

      await this.dispatchTemplateNotificationWithRetry({
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: envelope.envelopeId,
        recipientEmail: recipient.signatoryEmail,
        subject,
        htmlContent,
        notificationType: contractNotificationTypes.signatoryLink,
        strictFailure: true,
      })
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
        .map((signatory) => signatory.zohoSignEnvelopeId)
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

  async downloadFinalSigningArtifact(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    artifact: 'signed_document' | 'completion_certificate'
  }): Promise<{ fileName: string; contentType: string; fileBytes: Uint8Array }> {
    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for final artifact download')
    }

    if (params.actorRole !== contractWorkflowRoles.legalTeam && params.actorRole !== contractWorkflowRoles.admin) {
      throw new AuthorizationError(
        'CONTRACT_SIGNATORY_FORBIDDEN',
        'Only LEGAL_TEAM or ADMIN can download final signing artifacts'
      )
    }

    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })

    const envelopeId = contractView.signatories[0]?.zohoSignEnvelopeId
    if (!envelopeId?.trim()) {
      throw new BusinessRuleError('SIGNATORY_DOCUMENT_NOT_AVAILABLE', 'Envelope is not available for this contract')
    }

    const isCompletionCertificate = params.artifact === 'completion_certificate'
    const targetDocumentKind = isCompletionCertificate
      ? contractDocumentKinds.auditCertificate
      : contractDocumentKinds.executedContract
    const targetDisplayName = isCompletionCertificate ? 'Zoho Sign Completion Certificate' : 'Executed Contract'
    const targetFileName = isCompletionCertificate
      ? `audit-certificate-${envelopeId}.pdf`
      : `executed-${envelopeId}.pdf`
    const targetFilePath = isCompletionCertificate
      ? `${params.tenantId}/${params.contractId}/executed/${envelopeId}/audit-certificate.pdf`
      : `${params.tenantId}/${params.contractId}/executed/${envelopeId}/executed-contract.pdf`

    const localDocument = contractView.documents
      .filter((document) => document.documentKind === targetDocumentKind)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]

    if (localDocument) {
      try {
        const localDownload = await this.contractDocumentDownloadService.createSignedDownloadUrl({
          contractId: params.contractId,
          tenantId: params.tenantId,
          requestorEmployeeId: params.actorEmployeeId,
          requestorRole: params.actorRole,
          documentId: localDocument.id,
        })

        const localDocumentResponse = await fetch(localDownload.signedUrl)
        if (localDocumentResponse.ok) {
          return {
            fileName: localDownload.fileName,
            contentType: localDocumentResponse.headers.get('content-type') ?? 'application/pdf',
            fileBytes: new Uint8Array(await localDocumentResponse.arrayBuffer()),
          }
        }
      } catch {
        // If local fetch fails, fallback to Zoho and repersist.
      }
    }

    try {
      let fileBytes: Uint8Array

      if (isCompletionCertificate) {
        if (this.signatureProvider.downloadCompletionCertificate) {
          fileBytes = await this.signatureProvider.downloadCompletionCertificate({ envelopeId })
        } else if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
          const legacyArtifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({ envelopeId })
          fileBytes = legacyArtifacts.certificatePdf
        } else {
          throw new Error('Completion certificate download is not supported by configured signature provider')
        }
      } else if (this.signatureProvider.downloadEnvelopePdf) {
        fileBytes = await this.signatureProvider.downloadEnvelopePdf({ envelopeId })
      } else if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
        const legacyArtifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({ envelopeId })
        fileBytes = legacyArtifacts.executedPdf
      } else {
        throw new Error('Executed envelope download is not supported by configured signature provider')
      }

      await this.uploadCompletionArtifactSafely({
        path: targetFilePath,
        fileBody: fileBytes,
        contentType: 'application/pdf',
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId,
        artifactKind: targetDocumentKind,
      })

      await this.insertCompletionDocumentSafely({
        tenantId: params.tenantId,
        contractId: params.contractId,
        documentKind: targetDocumentKind,
        displayName: targetDisplayName,
        fileName: targetFileName,
        filePath: targetFilePath,
        fileSizeBytes: fileBytes.byteLength,
        fileMimeType: 'application/pdf',
        envelopeId,
      })

      return {
        fileName: targetFileName,
        contentType: 'application/pdf',
        fileBytes,
      }
    } catch (error) {
      throw new ExternalServiceError(
        'ZOHO_SIGN',
        'Final signing artifact is still being prepared. Please try again shortly.',
        error as Error
      )
    }
  }

  async handleZohoSignWebhook(params: {
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
      this.logger.warn('Zoho Sign webhook ignored: envelope context not found', {
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
      })
      return
    }

    const eventKey = `${params.envelopeId}:${params.recipientEmail ?? 'ALL'}:${normalizedStatus}:${params.eventId ?? 'NO_EVENT_ID'}`

    const webhookInsert = await this.contractQueryService.recordZohoSignWebhookEvent({
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
      this.logger.info('Zoho Sign webhook deduped', {
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
      this.logger.info('ZOHO_SIGN_COMPLETION_EVALUATION', {
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
        insertedWebhookEvent: webhookInsert.inserted,
      })

      if (webhookInsert.inserted) {
        await this.sendCompletionNotifications({
          tenantId: envelopeContext.tenantId,
          contractId: envelopeContext.contractId,
          envelopeId: params.envelopeId,
        })
      }
    }
  }

  async handleZohoSignSignedWebhook(params: {
    envelopeId: string
    recipientEmail?: string
    status: string
    signedAt?: string
    eventId?: string
    signerIp?: string
    payload: Record<string, unknown>
  }): Promise<void> {
    await this.handleZohoSignWebhook(params)
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
      const contractLink = `${this.appSiteUrl}/contracts/${params.contractId}`
      const subject = `Signing Completed: ${profile.contractTitle}`
      const htmlContent = buildMasterTemplate({
        title: 'Signing Completed',
        greeting: 'Hello,',
        messageText: `The signing workflow for ${profile.contractTitle} has been completed.`,
        buttonText: 'View Contract',
        buttonLink: contractLink,
        footerText: 'The executed contract and certificate are now available in NXT Legal.',
      })

      await this.dispatchTemplateNotificationWithRetry({
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
        recipientEmail,
        subject,
        htmlContent,
        notificationType: contractNotificationTypes.signingCompleted,
        strictFailure: false,
      })
    }
  }

  private async dispatchTemplateNotificationWithRetry(params: {
    tenantId: string
    contractId: string
    envelopeId?: string
    recipientEmail: string
    subject: string
    htmlContent: string
    notificationType: 'SIGNATORY_LINK' | 'SIGNING_COMPLETED'
    strictFailure: boolean
  }): Promise<void> {
    const maxRetries = contractNotificationPolicy.maxRetries

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const retryCount = attempt
      try {
        const response = await this.signatoryMailer.sendTemplateEmail({
          recipientEmail: params.recipientEmail,
          subject: params.subject,
          htmlContent: params.htmlContent,
          tags: ['contract-workflow'],
        })

        await this.contractQueryService.recordContractNotificationDelivery({
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          recipientEmail: params.recipientEmail,
          channel: contractNotificationChannels.email,
          notificationType: params.notificationType,
          templateId: contractNotificationTemplates.masterHtmlInline,
          providerName: 'BREVO',
          providerMessageId: response.providerMessageId,
          status: contractNotificationStatuses.sent,
          retryCount,
          maxRetries,
          metadata: {
            template_mode: 'MASTER_HTML',
            subject: params.subject,
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
          templateId: contractNotificationTemplates.masterHtmlInline,
          providerName: 'BREVO',
          status: contractNotificationStatuses.failed,
          retryCount,
          maxRetries,
          nextRetryAt,
          lastError: error instanceof Error ? error.message : String(error),
          metadata: {
            template_mode: 'MASTER_HTML',
            subject: params.subject,
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

  private mapWebhookStatusToAudit(status: SignatureCanonicalStatus): {
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

  private normalizeWebhookStatus(status: string): SignatureCanonicalStatus {
    const normalizedToken = status
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (
      normalizedToken === 'COMPLETED' ||
      normalizedToken === 'ENVELOPE_COMPLETED' ||
      normalizedToken === 'RECIPIENT_COMPLETED' ||
      normalizedToken === 'DOCUMENT_COMPLETED' ||
      normalizedToken === 'REQUEST_COMPLETED'
    ) {
      return 'COMPLETED'
    }

    if (
      normalizedToken === 'SIGNED' ||
      normalizedToken === 'RECIPIENT_SIGNED' ||
      normalizedToken === 'REQUEST_SIGNING_SUCCESS' ||
      normalizedToken === 'REQUEST_APPROVED'
    ) {
      return 'SIGNED'
    }

    if (normalizedToken === 'SENT' || normalizedToken === 'REQUEST_SUBMITTED') {
      return 'SENT'
    }

    if (normalizedToken === 'DELIVERED') {
      return 'DELIVERED'
    }

    if (normalizedToken === 'VIEWED' || normalizedToken === 'REQUEST_VIEWED') {
      return 'VIEWED'
    }

    if (normalizedToken === 'DECLINED' || normalizedToken === 'REQUEST_REJECTED') {
      return 'DECLINED'
    }

    if (normalizedToken === 'EXPIRED' || normalizedToken === 'REQUEST_EXPIRED') {
      return 'EXPIRED'
    }

    return 'UNKNOWN'
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

  private async uploadCompletionArtifactSafely(params: {
    path: string
    fileBody: Blob | Uint8Array
    contentType: string
    tenantId: string
    contractId: string
    envelopeId: string
    artifactKind: 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
  }): Promise<void> {
    try {
      await this.contractStorageRepository.upload({
        path: params.path,
        fileBody: params.fileBody,
        contentType: params.contentType,
      })
    } catch (error) {
      if (this.isStorageAlreadyExistsError(error)) {
        this.logger.info('ZOHO_SIGN_ARTIFACT_ALREADY_EXISTS', {
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
        this.logger.info('ZOHO_SIGN_ARTIFACT_ALREADY_EXISTS', {
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

  private async buildSignatoryRedirectLink(params: {
    envelopeId: string
    recipientEmail: string
    recipientId: string
  }): Promise<string> {
    const token = await createSignatoryLinkToken({
      envelopeId: params.envelopeId,
      recipientEmail: params.recipientEmail,
      recipientId: params.recipientId,
    })

    return `${this.appSiteUrl}/api/contracts/signatories/zoho-sign/redirect?token=${encodeURIComponent(token)}`
  }
}
