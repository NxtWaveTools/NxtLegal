import { AuthorizationError, BusinessRuleError, ExternalServiceError } from '@/core/http/errors'
import { createSignatoryLinkToken } from '@/core/infra/security/signatory-link-token'
import { PDFDocument } from 'pdf-lib'
import {
  contractDocumentKinds,
  contractStorage,
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
        width: number | null
        height: number | null
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
  recallSigningEnvelope?: (params: { envelopeId: string }) => Promise<void>
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
        width?: number
        height?: number
        anchor_string?: string
        assigned_signer_email: string
      }>
    }>
  }): Promise<ContractDetailView> {
    const assignStartedAt = Date.now()
    const elapsedMs = () => Date.now() - assignStartedAt

    this.logger.info('SIGNING_PREPARATION_ASSIGN_TRACE', {
      phase: 'start',
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      recipientCount: params.recipients.length,
    })

    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signatory assignment')
    }

    const contractDetailStartedAt = Date.now()
    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })
    const contractDetailMs = Date.now() - contractDetailStartedAt

    const assignAllowedStatuses: string[] = [contractStatuses.underReview, contractStatuses.completed]
    if (!assignAllowedStatuses.includes(contractView.contract.status)) {
      throw new BusinessRuleError(
        'SIGNATORY_ASSIGN_INVALID_STATUS',
        'Signatories can only be assigned in UNDER_REVIEW or COMPLETED'
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
        width: field.width ?? null,
        height: field.height ?? null,
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

    this.logger.info('SIGNING_PREPARATION_ASSIGN_TRACE', {
      phase: 'contract_detail_loaded',
      tenantId: params.tenantId,
      contractId: params.contractId,
      contractDetailMs,
      contractStatus: contractView.contract.status,
      currentDocumentId: contractView.contract.currentDocumentId,
      normalizedRecipientCount: normalizedRecipients.length,
      normalizedFieldCount: normalizedRecipients.reduce((sum, recipient) => sum + recipient.fields.length, 0),
      elapsedMs: elapsedMs(),
    })

    const signedUrlStartedAt = Date.now()
    let download: { signedUrl: string; fileName: string }
    try {
      download = await this.contractDocumentDownloadService.createSignedDownloadUrl({
        contractId: params.contractId,
        tenantId: params.tenantId,
        requestorEmployeeId: params.actorEmployeeId,
        requestorRole: params.actorRole,
        documentId: contractView.contract.currentDocumentId,
      })
    } catch (error) {
      this.logger.error('SIGNING_PREPARATION_ASSIGN_TRACE', {
        phase: 'create_signed_url_failed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        elapsedMs: elapsedMs(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    const createSignedUrlMs = Date.now() - signedUrlStartedAt

    let documentBytes: Uint8Array
    let documentMimeType = 'application/octet-stream'

    const sourceDocumentFetchStartedAt = Date.now()
    try {
      const documentResponse = await fetch(download.signedUrl)
      if (!documentResponse.ok) {
        throw new BusinessRuleError('CONTRACT_DOCUMENT_FETCH_FAILED', 'Failed to fetch contract document for signing')
      }

      documentBytes = new Uint8Array(await documentResponse.arrayBuffer())
      documentMimeType = documentResponse.headers.get('content-type') ?? 'application/octet-stream'

      this.logger.info('SIGNING_PREPARATION_ASSIGN_TRACE', {
        phase: 'source_document_loaded',
        tenantId: params.tenantId,
        contractId: params.contractId,
        createSignedUrlMs,
        sourceDocumentFetchMs: Date.now() - sourceDocumentFetchStartedAt,
        sourceDocumentSizeBytes: documentBytes.byteLength,
        sourceDocumentMimeType: documentMimeType,
        elapsedMs: elapsedMs(),
      })
    } catch (error) {
      this.logger.error('SIGNING_PREPARATION_ASSIGN_TRACE', {
        phase: 'source_document_fetch_failed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        createSignedUrlMs,
        sourceDocumentFetchMs: Date.now() - sourceDocumentFetchStartedAt,
        elapsedMs: elapsedMs(),
        error: error instanceof Error ? error.message : String(error),
      })

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

    const envelopeCreateStartedAt = Date.now()
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
      this.logger.error('SIGNING_PREPARATION_ASSIGN_TRACE', {
        phase: 'zoho_envelope_create_failed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        createEnvelopeMs: Date.now() - envelopeCreateStartedAt,
        elapsedMs: elapsedMs(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw new ExternalServiceError('ZOHO_SIGN', 'Failed to create Zoho Sign request', error as Error)
    }

    const createEnvelopeMs = Date.now() - envelopeCreateStartedAt

    this.logger.info('SIGNING_PREPARATION_ASSIGN_TRACE', {
      phase: 'zoho_envelope_created',
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: envelope.envelopeId,
      zohoRecipientCount: envelope.recipients?.length ?? 0,
      createEnvelopeMs,
      elapsedMs: elapsedMs(),
    })

    if (!envelope?.envelopeId) {
      throw new BusinessRuleError('SIGNING_PREPARATION_ENVELOPE_MISSING', 'Envelope ID missing after signing send')
    }

    const envelopeRecipientByEmail = new Map(
      (envelope.recipients ?? []).map((recipient) => [recipient.email, recipient])
    )

    const persistSignatoriesStartedAt = Date.now()
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
    const persistSignatoriesMs = Date.now() - persistSignatoriesStartedAt

    if (!updatedView) {
      throw new BusinessRuleError('SIGNATORY_ASSIGNMENT_FAILED', 'No signatory recipient was persisted')
    }

    const internalNotificationsStartedAt = Date.now()
    let internalNotificationCount = 0
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
      internalNotificationCount += 1
    }
    const internalNotificationMs = Date.now() - internalNotificationsStartedAt

    this.logger.info('Contract signatory assigned', {
      tenantId: params.tenantId,
      contractId: params.contractId,
      signatoryEmails: normalizedRecipients.map((recipient) => recipient.signatoryEmail),
      envelopeId: envelope.envelopeId,
      createEnvelopeMs,
      persistSignatoriesMs,
      internalNotificationCount,
      internalNotificationMs,
      elapsedMs: elapsedMs(),
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
    const sendStartedAt = Date.now()
    const elapsedMs = () => Date.now() - sendStartedAt

    this.logger.info('SIGNING_PREPARATION_SEND_TRACE', {
      phase: 'start',
      tenantId: params.tenantId,
      contractId: params.contractId,
      actorEmployeeId: params.actorEmployeeId,
      actorRole: params.actorRole,
      elapsedMs: elapsedMs(),
    })

    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for signing preparation send')
    }

    let envelopeIdForTrace: string | undefined

    try {
      const pendingSignatoryCheckStartedAt = Date.now()
      const pendingSignatoryCount = await this.contractQueryService.countPendingSignatoriesByContract({
        tenantId: params.tenantId,
        contractId: params.contractId,
      })
      const pendingSignatoryCheckMs = Date.now() - pendingSignatoryCheckStartedAt

      if (pendingSignatoryCount > 0) {
        throw new BusinessRuleError(
          'SIGNING_PREPARATION_ALREADY_SENT',
          'Signing preparation draft already sent for this contract'
        )
      }

      const draftLoadStartedAt = Date.now()
      const draft = await this.contractQueryService.getSigningPreparationDraft({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
      })
      const draftLoadMs = Date.now() - draftLoadStartedAt

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
            width: field.width ?? undefined,
            height: field.height ?? undefined,
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

      this.logger.info('SIGNING_PREPARATION_SEND_TRACE', {
        phase: 'draft_loaded',
        tenantId: params.tenantId,
        contractId: params.contractId,
        pendingSignatoryCheckMs,
        draftLoadMs,
        draftRecipientCount: draft.recipients.length,
        draftFieldCount: draft.fields.length,
        elapsedMs: elapsedMs(),
      })

      const assignSignatoryStartedAt = Date.now()
      const updatedContractView = await this.assignSignatory({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
        recipients,
      })
      const assignSignatoryMs = Date.now() - assignSignatoryStartedAt

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
      envelopeIdForTrace = envelopeId

      const moveToSignatureStartedAt = Date.now()
      await this.contractQueryService.moveContractToInSignature({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        actorEmail: params.actorEmail,
        envelopeId,
      })
      const moveToInSignatureMs = Date.now() - moveToSignatureStartedAt

      const deleteDraftStartedAt = Date.now()
      await this.contractQueryService.deleteSigningPreparationDraft({
        tenantId: params.tenantId,
        contractId: params.contractId,
      })
      const deleteDraftMs = Date.now() - deleteDraftStartedAt

      const finalContractDetailStartedAt = Date.now()
      const contractView = await this.contractQueryService.getContractDetail({
        tenantId: params.tenantId,
        contractId: params.contractId,
        employeeId: params.actorEmployeeId,
        role: params.actorRole,
      })
      const finalContractDetailMs = Date.now() - finalContractDetailStartedAt

      this.logger.info('SIGNING_PREPARATION_SEND_TRACE', {
        phase: 'completed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId,
        pendingSignatoryCheckMs,
        draftLoadMs,
        assignSignatoryMs,
        moveToInSignatureMs,
        deleteDraftMs,
        finalContractDetailMs,
        elapsedMs: elapsedMs(),
      })

      return {
        envelopeId,
        contractView,
      }
    } catch (error) {
      this.logger.error('SIGNING_PREPARATION_SEND_TRACE', {
        phase: 'failed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        envelopeId: envelopeIdForTrace,
        elapsedMs: elapsedMs(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async downloadFinalSigningArtifact(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole?: string
    artifact: 'signed_document' | 'completion_certificate' | 'merged_pdf'
  }): Promise<
    | { fileName: string; contentType: string; signedUrl: string }
    | { fileName: string; contentType: string; fileBytes: Uint8Array }
  > {
    const downloadStartedAt = Date.now()
    const elapsedMs = () => Date.now() - downloadStartedAt

    this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
      phase: 'start',
      tenantId: params.tenantId,
      contractId: params.contractId,
      artifact: params.artifact,
    })

    if (!params.actorRole) {
      throw new AuthorizationError('CONTRACT_SIGNATORY_FORBIDDEN', 'User role is required for final artifact download')
    }

    if (params.actorRole !== contractWorkflowRoles.legalTeam && params.actorRole !== contractWorkflowRoles.admin) {
      throw new AuthorizationError(
        'CONTRACT_SIGNATORY_FORBIDDEN',
        'Only LEGAL_TEAM or ADMIN can download final signing artifacts'
      )
    }

    const contractDetailStartedAt = Date.now()
    const contractView = await this.contractQueryService.getContractDetail({
      tenantId: params.tenantId,
      contractId: params.contractId,
      employeeId: params.actorEmployeeId,
      role: params.actorRole,
    })
    const contractDetailMs = Date.now() - contractDetailStartedAt

    const envelopeId = contractView.signatories[0]?.zohoSignEnvelopeId
    if (!envelopeId?.trim()) {
      throw new BusinessRuleError('SIGNATORY_DOCUMENT_NOT_AVAILABLE', 'Envelope is not available for this contract')
    }

    if (params.artifact === 'merged_pdf') {
      return this.downloadMergedSigningArtifact({
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        envelopeId,
        contractView,
        elapsedMs,
      })
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

    this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
      phase: 'contract_detail_loaded',
      tenantId: params.tenantId,
      contractId: params.contractId,
      artifact: params.artifact,
      envelopeId,
      contractDetailMs,
      documentsCount: contractView.documents.length,
      signatoriesCount: contractView.signatories.length,
      hasLocalDocument: Boolean(localDocument),
      elapsedMs: elapsedMs(),
    })

    if (localDocument) {
      const storageAttemptStartedAt = Date.now()
      try {
        const createSignedUrlStartedAt = Date.now()
        const localDownload = await this.contractDocumentDownloadService.createSignedDownloadUrl({
          contractId: params.contractId,
          tenantId: params.tenantId,
          requestorEmployeeId: params.actorEmployeeId,
          requestorRole: params.actorRole,
          documentId: localDocument.id,
        })
        const createSignedUrlMs = Date.now() - createSignedUrlStartedAt
        this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
          phase: 'served_from_storage_signed_url',
          source: 'storage',
          tenantId: params.tenantId,
          contractId: params.contractId,
          artifact: params.artifact,
          envelopeId,
          localDocumentId: localDocument.id,
          createSignedUrlMs,
          storageAttemptMs: Date.now() - storageAttemptStartedAt,
          elapsedMs: elapsedMs(),
        })

        return {
          fileName: localDownload.fileName,
          contentType: 'application/pdf',
          signedUrl: localDownload.signedUrl,
        }
      } catch (error) {
        // If local fetch fails, fallback to Zoho and repersist.
        this.logger.warn('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
          phase: 'storage_signed_url_failed_fallback',
          source: 'storage',
          tenantId: params.tenantId,
          contractId: params.contractId,
          artifact: params.artifact,
          envelopeId,
          localDocumentId: localDocument.id,
          error: error instanceof Error ? error.message : String(error),
          storageAttemptMs: Date.now() - storageAttemptStartedAt,
          elapsedMs: elapsedMs(),
        })
      }
    } else {
      this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
        phase: 'storage_document_missing_fallback',
        source: 'storage',
        tenantId: params.tenantId,
        contractId: params.contractId,
        artifact: params.artifact,
        envelopeId,
        elapsedMs: elapsedMs(),
      })
    }

    try {
      let fileBytes: Uint8Array
      let zohoStrategy = 'unsupported'

      const zohoDownloadStartedAt = Date.now()

      if (isCompletionCertificate) {
        if (this.signatureProvider.downloadCompletionCertificate) {
          zohoStrategy = 'downloadCompletionCertificate'
          fileBytes = await this.signatureProvider.downloadCompletionCertificate({ envelopeId })
        } else if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
          zohoStrategy = 'downloadCompletedEnvelopeDocuments.certificatePdf'
          const legacyArtifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({ envelopeId })
          fileBytes = legacyArtifacts.certificatePdf
        } else {
          throw new Error('Completion certificate download is not supported by configured signature provider')
        }
      } else if (this.signatureProvider.downloadEnvelopePdf) {
        zohoStrategy = 'downloadEnvelopePdf'
        fileBytes = await this.signatureProvider.downloadEnvelopePdf({ envelopeId })
      } else if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
        zohoStrategy = 'downloadCompletedEnvelopeDocuments.executedPdf'
        const legacyArtifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({ envelopeId })
        fileBytes = legacyArtifacts.executedPdf
      } else {
        throw new Error('Executed envelope download is not supported by configured signature provider')
      }
      const zohoDownloadMs = Date.now() - zohoDownloadStartedAt

      const storageUploadStartedAt = Date.now()
      await this.uploadCompletionArtifactSafely({
        path: targetFilePath,
        fileBody: fileBytes,
        contentType: 'application/pdf',
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId,
        artifactKind: targetDocumentKind,
      })
      const storageUploadMs = Date.now() - storageUploadStartedAt

      const metadataInsertStartedAt = Date.now()
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
      const metadataInsertMs = Date.now() - metadataInsertStartedAt

      this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
        phase: 'served_from_zoho',
        source: 'zoho',
        tenantId: params.tenantId,
        contractId: params.contractId,
        artifact: params.artifact,
        envelopeId,
        zohoStrategy,
        zohoDownloadMs,
        storageUploadMs,
        metadataInsertMs,
        elapsedMs: elapsedMs(),
        fileSizeBytes: fileBytes.byteLength,
      })

      return {
        fileName: targetFileName,
        contentType: 'application/pdf',
        fileBytes,
      }
    } catch (error) {
      this.logger.error('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
        phase: 'zoho_fallback_failed',
        source: 'zoho',
        tenantId: params.tenantId,
        contractId: params.contractId,
        artifact: params.artifact,
        envelopeId,
        elapsedMs: elapsedMs(),
        error: error instanceof Error ? error.message : String(error),
      })

      throw new ExternalServiceError(
        'ZOHO_SIGN',
        'Final signing artifact is still being prepared. Please try again shortly.',
        error as Error
      )
    }
  }

  private async downloadMergedSigningArtifact(params: {
    tenantId: string
    contractId: string
    actorEmployeeId: string
    actorRole: string
    envelopeId: string
    contractView: ContractDetailView
    elapsedMs: () => number
  }): Promise<
    | { fileName: string; contentType: string; signedUrl: string }
    | { fileName: string; contentType: string; fileBytes: Uint8Array }
  > {
    const mergedFileName = `completion-certificate-and-signed-${params.envelopeId}.pdf`
    const mergedFilePath = this.resolveMergedArtifactPath({
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
    })
    const localExecutedDocument = this.findLatestDocumentByKind(
      params.contractView,
      contractDocumentKinds.executedContract
    )
    const localCertificateDocument = this.findLatestDocumentByKind(
      params.contractView,
      contractDocumentKinds.auditCertificate
    )

    try {
      const mergedSignedUrl = await this.contractStorageRepository.createSignedDownloadUrl(
        mergedFilePath,
        contractStorage.signedUrlExpirySeconds
      )
      this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
        phase: 'served_merged_from_storage_signed_url',
        source: 'storage',
        tenantId: params.tenantId,
        contractId: params.contractId,
        artifact: 'merged_pdf',
        envelopeId: params.envelopeId,
        elapsedMs: params.elapsedMs(),
      })

      return {
        fileName: mergedFileName,
        contentType: 'application/pdf',
        signedUrl: mergedSignedUrl,
      }
    } catch {
      // noop - merged artifact may not exist yet; continue with generation fallback.
    }

    this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
      phase: 'merged_contract_detail_loaded',
      source: 'storage',
      tenantId: params.tenantId,
      contractId: params.contractId,
      artifact: 'merged_pdf',
      envelopeId: params.envelopeId,
      hasLocalExecutedDocument: Boolean(localExecutedDocument),
      hasLocalCertificateDocument: Boolean(localCertificateDocument),
      elapsedMs: params.elapsedMs(),
    })

    if (localExecutedDocument && localCertificateDocument) {
      try {
        const [executedSignedUrl, certificateSignedUrl] = await Promise.all([
          this.contractDocumentDownloadService.createSignedDownloadUrl({
            contractId: params.contractId,
            tenantId: params.tenantId,
            requestorEmployeeId: params.actorEmployeeId,
            requestorRole: params.actorRole,
            documentId: localExecutedDocument.id,
          }),
          this.contractDocumentDownloadService.createSignedDownloadUrl({
            contractId: params.contractId,
            tenantId: params.tenantId,
            requestorEmployeeId: params.actorEmployeeId,
            requestorRole: params.actorRole,
            documentId: localCertificateDocument.id,
          }),
        ])

        const [certificatePdfBytes, executedPdfBytes] = await Promise.all([
          this.downloadPdfFromSignedUrl(certificateSignedUrl.signedUrl),
          this.downloadPdfFromSignedUrl(executedSignedUrl.signedUrl),
        ])

        const mergedPdfBytes = await this.mergePdfDocuments({
          leadingPdf: certificatePdfBytes,
          trailingPdf: executedPdfBytes,
        })
        await this.uploadCompletionArtifactSafely({
          path: mergedFilePath,
          fileBody: mergedPdfBytes,
          contentType: 'application/pdf',
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          artifactKind: 'MERGED_FINAL_ARTIFACT',
        })

        this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
          phase: 'served_merged_from_storage',
          source: 'storage',
          tenantId: params.tenantId,
          contractId: params.contractId,
          artifact: 'merged_pdf',
          envelopeId: params.envelopeId,
          executedDocumentId: localExecutedDocument.id,
          certificateDocumentId: localCertificateDocument.id,
          fileSizeBytes: mergedPdfBytes.byteLength,
          elapsedMs: params.elapsedMs(),
        })

        return {
          fileName: mergedFileName,
          contentType: 'application/pdf',
          ...(await this.resolveMergedDownloadResult({
            mergedFilePath,
            mergedFileName,
            mergedPdfBytes,
          })),
        }
      } catch (error) {
        this.logger.warn('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
          phase: 'merged_storage_failed_fallback',
          source: 'storage',
          tenantId: params.tenantId,
          contractId: params.contractId,
          artifact: 'merged_pdf',
          envelopeId: params.envelopeId,
          executedDocumentId: localExecutedDocument.id,
          certificateDocumentId: localCertificateDocument.id,
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: params.elapsedMs(),
        })
      }
    }

    try {
      const { executedPdfBytes, certificatePdfBytes, strategy } = await this.downloadCompletionArtifactsFromProvider({
        envelopeId: params.envelopeId,
      })

      const mergedPdfBytes = await this.mergePdfDocuments({
        leadingPdf: certificatePdfBytes,
        trailingPdf: executedPdfBytes,
      })
      await this.uploadCompletionArtifactSafely({
        path: mergedFilePath,
        fileBody: mergedPdfBytes,
        contentType: 'application/pdf',
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
        artifactKind: 'MERGED_FINAL_ARTIFACT',
      })

      this.logger.info('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
        phase: 'served_merged_from_zoho',
        source: 'zoho',
        tenantId: params.tenantId,
        contractId: params.contractId,
        artifact: 'merged_pdf',
        envelopeId: params.envelopeId,
        zohoStrategy: strategy,
        fileSizeBytes: mergedPdfBytes.byteLength,
        elapsedMs: params.elapsedMs(),
      })

      return {
        fileName: mergedFileName,
        contentType: 'application/pdf',
        ...(await this.resolveMergedDownloadResult({
          mergedFilePath,
          mergedFileName,
          mergedPdfBytes,
        })),
      }
    } catch (error) {
      this.logger.error('FINAL_ARTIFACT_DOWNLOAD_TRACE', {
        phase: 'merged_zoho_failed',
        source: 'zoho',
        tenantId: params.tenantId,
        contractId: params.contractId,
        artifact: 'merged_pdf',
        envelopeId: params.envelopeId,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: params.elapsedMs(),
      })
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

    if (
      webhookInsert.inserted &&
      normalizedStatus === 'SIGNED' &&
      params.recipientEmail &&
      envelopeContext.recipientType === contractSignatoryRecipientTypes.internal
    ) {
      await this.sendInternalSignerSignedConfirmation({
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
      })
    }

    if (normalizedStatus === 'COMPLETED') {
      this.logger.info('ZOHO_SIGN_COMPLETION_EVALUATION', {
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        envelopeId: params.envelopeId,
        recipientEmail: params.recipientEmail,
        insertedWebhookEvent: webhookInsert.inserted,
      })

      await this.syncCompletionArtifactsForCompletedEnvelope({
        tenantId: envelopeContext.tenantId,
        contractId: envelopeContext.contractId,
        envelopeId: params.envelopeId,
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

  async recallSigningEnvelopes(params: {
    tenantId: string
    contractId: string
    envelopeIds: string[]
    actorEmployeeId: string
    actorRole?: string
    actorEmail: string
    reason?: string
  }): Promise<void> {
    const uniqueEnvelopeIds = Array.from(new Set(params.envelopeIds.map((item) => item.trim()).filter(Boolean)))
    if (uniqueEnvelopeIds.length === 0) {
      return
    }

    if (!this.signatureProvider.recallSigningEnvelope) {
      this.logger.warn('Zoho recall is not supported by configured signature provider', {
        tenantId: params.tenantId,
        contractId: params.contractId,
        actorEmployeeId: params.actorEmployeeId,
        actorRole: params.actorRole,
        envelopeCount: uniqueEnvelopeIds.length,
      })
      return
    }

    for (const envelopeId of uniqueEnvelopeIds) {
      try {
        await this.signatureProvider.recallSigningEnvelope({ envelopeId })
        this.logger.info('Zoho signing envelope recalled after contract void', {
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId,
          actorEmployeeId: params.actorEmployeeId,
          actorRole: params.actorRole,
          actorEmail: params.actorEmail,
          reason: params.reason?.trim() || null,
        })
      } catch (error) {
        this.logger.warn('Failed to recall Zoho signing envelope after contract void', {
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId,
          actorEmployeeId: params.actorEmployeeId,
          actorRole: params.actorRole,
          actorEmail: params.actorEmail,
          reason: params.reason?.trim() || null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private async syncCompletionArtifactsForCompletedEnvelope(params: {
    tenantId: string
    contractId: string
    envelopeId: string
  }): Promise<void> {
    const syncStartedAt = Date.now()
    const elapsedMs = () => Date.now() - syncStartedAt

    try {
      const existingDocuments = await this.contractQueryService.getContractDocumentsBySystem({
        tenantId: params.tenantId,
        contractId: params.contractId,
      })

      const hasExecutedContract = existingDocuments.some(
        (document) => document.documentKind === contractDocumentKinds.executedContract
      )
      const hasAuditCertificate = existingDocuments.some(
        (document) => document.documentKind === contractDocumentKinds.auditCertificate
      )
      const mergedPath = this.resolveMergedArtifactPath({
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
      })
      const executedPath = `${params.tenantId}/${params.contractId}/executed/${params.envelopeId}/executed-contract.pdf`
      const certificatePath = `${params.tenantId}/${params.contractId}/executed/${params.envelopeId}/audit-certificate.pdf`

      if (hasExecutedContract && hasAuditCertificate) {
        try {
          await this.contractStorageRepository.createSignedDownloadUrl(mergedPath, 60)
          this.logger.info('ZOHO_SIGN_COMPLETION_ARTIFACT_SYNC_TRACE', {
            phase: 'already_present',
            tenantId: params.tenantId,
            contractId: params.contractId,
            envelopeId: params.envelopeId,
            mergedArtifactPresent: true,
            elapsedMs: elapsedMs(),
          })
          return
        } catch {
          this.logger.info('ZOHO_SIGN_COMPLETION_ARTIFACT_SYNC_TRACE', {
            phase: 'merged_missing_backfill',
            tenantId: params.tenantId,
            contractId: params.contractId,
            envelopeId: params.envelopeId,
            elapsedMs: elapsedMs(),
          })
        }
      }

      let executedPdfBytes: Uint8Array | undefined
      let certificatePdfBytes: Uint8Array | undefined
      let usedBatchProviderDownload = false

      // Prefer a single provider request when both artifacts are missing.
      if (!hasExecutedContract && !hasAuditCertificate && this.signatureProvider.downloadCompletedEnvelopeDocuments) {
        const artifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({
          envelopeId: params.envelopeId,
        })
        executedPdfBytes = artifacts.executedPdf
        certificatePdfBytes = artifacts.certificatePdf
        usedBatchProviderDownload = true
      }

      if (!hasExecutedContract && !executedPdfBytes) {
        if (this.signatureProvider.downloadEnvelopePdf) {
          executedPdfBytes = await this.signatureProvider.downloadEnvelopePdf({
            envelopeId: params.envelopeId,
          })
        } else if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
          const artifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({
            envelopeId: params.envelopeId,
          })
          executedPdfBytes = artifacts.executedPdf
        }
      }

      if (!hasAuditCertificate && !certificatePdfBytes) {
        if (this.signatureProvider.downloadCompletionCertificate) {
          certificatePdfBytes = await this.signatureProvider.downloadCompletionCertificate({
            envelopeId: params.envelopeId,
          })
        } else if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
          const artifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({
            envelopeId: params.envelopeId,
          })
          certificatePdfBytes = artifacts.certificatePdf
        }
      }

      if (executedPdfBytes && !hasExecutedContract) {
        const executedFileName = `executed-${params.envelopeId}.pdf`

        await this.uploadCompletionArtifactSafely({
          path: executedPath,
          fileBody: executedPdfBytes,
          contentType: 'application/pdf',
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          artifactKind: contractDocumentKinds.executedContract,
        })

        await this.insertCompletionDocumentSafely({
          tenantId: params.tenantId,
          contractId: params.contractId,
          documentKind: contractDocumentKinds.executedContract,
          displayName: 'Executed Contract',
          fileName: executedFileName,
          filePath: executedPath,
          fileSizeBytes: executedPdfBytes.byteLength,
          fileMimeType: 'application/pdf',
          envelopeId: params.envelopeId,
        })
      }

      if (certificatePdfBytes && !hasAuditCertificate) {
        const certificateFileName = `audit-certificate-${params.envelopeId}.pdf`

        await this.uploadCompletionArtifactSafely({
          path: certificatePath,
          fileBody: certificatePdfBytes,
          contentType: 'application/pdf',
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          artifactKind: contractDocumentKinds.auditCertificate,
        })

        await this.insertCompletionDocumentSafely({
          tenantId: params.tenantId,
          contractId: params.contractId,
          documentKind: contractDocumentKinds.auditCertificate,
          displayName: 'Zoho Sign Completion Certificate',
          fileName: certificateFileName,
          filePath: certificatePath,
          fileSizeBytes: certificatePdfBytes.byteLength,
          fileMimeType: 'application/pdf',
          envelopeId: params.envelopeId,
        })
      }

      const executedBytesForMerge = executedPdfBytes ?? (await this.downloadPdfFromStoragePath(executedPath))
      const certificateBytesForMerge = certificatePdfBytes ?? (await this.downloadPdfFromStoragePath(certificatePath))
      if (executedBytesForMerge && certificateBytesForMerge) {
        const mergedPdfBytes = await this.mergePdfDocuments({
          leadingPdf: certificateBytesForMerge,
          trailingPdf: executedBytesForMerge,
        })
        await this.uploadCompletionArtifactSafely({
          path: mergedPath,
          fileBody: mergedPdfBytes,
          contentType: 'application/pdf',
          tenantId: params.tenantId,
          contractId: params.contractId,
          envelopeId: params.envelopeId,
          artifactKind: 'MERGED_FINAL_ARTIFACT',
        })
      }

      this.logger.info('ZOHO_SIGN_COMPLETION_ARTIFACT_SYNC_TRACE', {
        phase: 'completed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
        usedBatchProviderDownload,
        persistedExecutedContract: Boolean(executedPdfBytes && !hasExecutedContract),
        persistedAuditCertificate: Boolean(certificatePdfBytes && !hasAuditCertificate),
        elapsedMs: elapsedMs(),
      })
    } catch (error) {
      this.logger.error('ZOHO_SIGN_COMPLETION_ARTIFACT_SYNC_TRACE', {
        phase: 'failed',
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
        elapsedMs: elapsedMs(),
        error: error instanceof Error ? error.message : String(error),
      })
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

  private async sendInternalSignerSignedConfirmation(params: {
    tenantId: string
    contractId: string
    envelopeId: string
    recipientEmail: string
  }): Promise<void> {
    const recipientEmail = params.recipientEmail.trim().toLowerCase()
    const existingDelivery = await this.contractQueryService.getLatestNotificationDelivery({
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
      recipientEmail,
      notificationType: contractNotificationTypes.signingCompleted,
    })

    if (existingDelivery?.status === contractNotificationStatuses.sent) {
      this.logger.info('Internal signer confirmation notification deduped', {
        tenantId: params.tenantId,
        contractId: params.contractId,
        envelopeId: params.envelopeId,
        recipientEmail,
        latestDeliveryId: existingDelivery.id,
      })
      return
    }

    const profile = await this.contractQueryService.getEnvelopeNotificationProfile({
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
    })

    const contractTitle = profile?.contractTitle ?? 'Contract'
    const contractLink = `${this.appSiteUrl}/contracts/${params.contractId}`
    const downloadLink = await this.resolveExecutedDownloadLink({
      tenantId: params.tenantId,
      contractId: params.contractId,
      envelopeId: params.envelopeId,
      fallbackUrl: contractLink,
    })

    const subject = `You Signed: ${contractTitle}`
    const htmlContent = buildMasterTemplate({
      title: 'Signature Recorded',
      greeting: 'Hello,',
      messageText: `Your signature has been recorded for ${contractTitle}.`,
      buttonText: 'Download Signed Document',
      buttonLink: downloadLink,
      footerText:
        'If the signed PDF is still processing, please open the contract page and retry download in a few moments.',
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

    const uniqueRoutingOrders = new Set(params.map((recipient) => recipient.routingOrder))
    const allRoutingOrdersSame = uniqueRoutingOrders.size === 1
    const allRoutingOrdersUnique = uniqueRoutingOrders.size === params.length

    if (!allRoutingOrdersSame && !allRoutingOrdersUnique) {
      throw new BusinessRuleError(
        'SIGNING_PREPARATION_ROUTING_ORDER_INVALID',
        'Routing order must be either identical for all recipients (parallel send) or unique per recipient (sequential send)'
      )
    }
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
    artifactKind: 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE' | 'MERGED_FINAL_ARTIFACT'
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

  private findLatestDocumentByKind(
    contractView: ContractDetailView,
    documentKind: 'EXECUTED_CONTRACT' | 'AUDIT_CERTIFICATE'
  ) {
    return contractView.documents
      .filter((document) => document.documentKind === documentKind)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]
  }

  private async downloadPdfFromSignedUrl(signedUrl: string): Promise<Uint8Array> {
    const response = await fetch(signedUrl)
    if (!response.ok) {
      throw new Error(`Failed to download signed PDF from storage: ${response.status}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  private async downloadPdfFromStoragePath(path: string): Promise<Uint8Array | undefined> {
    try {
      const signedUrl = await this.contractStorageRepository.createSignedDownloadUrl(path, 60)
      return await this.downloadPdfFromSignedUrl(signedUrl)
    } catch {
      return undefined
    }
  }

  private async resolveExecutedDownloadLink(params: {
    tenantId: string
    contractId: string
    envelopeId: string
    fallbackUrl: string
  }): Promise<string> {
    const path = `${params.tenantId}/${params.contractId}/executed/${params.envelopeId}/executed-contract.pdf`
    try {
      return await this.contractStorageRepository.createSignedDownloadUrl(path, contractStorage.signedUrlExpirySeconds)
    } catch {
      return params.fallbackUrl
    }
  }

  private resolveMergedArtifactPath(params: { tenantId: string; contractId: string; envelopeId: string }): string {
    return `${params.tenantId}/${params.contractId}/executed/${params.envelopeId}/completion-certificate-and-executed-merged.pdf`
  }

  private async resolveMergedDownloadResult(params: {
    mergedFilePath: string
    mergedFileName: string
    mergedPdfBytes: Uint8Array
  }): Promise<{ signedUrl: string } | { fileBytes: Uint8Array }> {
    try {
      const mergedSignedUrl = await this.contractStorageRepository.createSignedDownloadUrl(
        params.mergedFilePath,
        contractStorage.signedUrlExpirySeconds
      )
      return { signedUrl: mergedSignedUrl }
    } catch {
      return { fileBytes: params.mergedPdfBytes }
    }
  }

  private async downloadCompletionArtifactsFromProvider(params: {
    envelopeId: string
  }): Promise<{ executedPdfBytes: Uint8Array; certificatePdfBytes: Uint8Array; strategy: string }> {
    if (this.signatureProvider.downloadCompletedEnvelopeDocuments) {
      const artifacts = await this.signatureProvider.downloadCompletedEnvelopeDocuments({
        envelopeId: params.envelopeId,
      })
      return {
        executedPdfBytes: artifacts.executedPdf,
        certificatePdfBytes: artifacts.certificatePdf,
        strategy: 'downloadCompletedEnvelopeDocuments',
      }
    }

    if (!this.signatureProvider.downloadEnvelopePdf || !this.signatureProvider.downloadCompletionCertificate) {
      throw new Error('Merged final artifact download is not supported by configured signature provider')
    }

    const [executedPdfBytes, certificatePdfBytes] = await Promise.all([
      this.signatureProvider.downloadEnvelopePdf({ envelopeId: params.envelopeId }),
      this.signatureProvider.downloadCompletionCertificate({ envelopeId: params.envelopeId }),
    ])

    return {
      executedPdfBytes,
      certificatePdfBytes,
      strategy: 'downloadEnvelopePdf+downloadCompletionCertificate',
    }
  }

  private async mergePdfDocuments(params: { leadingPdf: Uint8Array; trailingPdf: Uint8Array }): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create()
    const leadingDoc = await PDFDocument.load(params.leadingPdf)
    const trailingDoc = await PDFDocument.load(params.trailingPdf)

    const leadingPages = await mergedPdf.copyPages(leadingDoc, leadingDoc.getPageIndices())
    for (const page of leadingPages) {
      mergedPdf.addPage(page)
    }

    const trailingPages = await mergedPdf.copyPages(trailingDoc, trailingDoc.getPageIndices())
    for (const page of trailingPages) {
      mergedPdf.addPage(page)
    }

    return await mergedPdf.save()
  }
}
