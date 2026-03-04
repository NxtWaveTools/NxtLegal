import { ContractSignatoryService } from '@/core/domain/contracts/contract-signatory-service'
import { BusinessRuleError, ExternalServiceError } from '@/core/http/errors'

const mockContractView = {
  contract: {
    id: 'contract-1',
    title: 'Master Service Agreement',
    status: 'COMPLETED',
    currentDocumentId: 'document-primary-1',
  },
  documents: [],
  availableActions: [],
  additionalApprovers: [],
  signatories: [],
}

const createContractView = () => structuredClone(mockContractView)
const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
})

describe('ContractSignatoryService', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('sends Brevo email with embedded link for internal recipient', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue(createContractView()),
      addSignatory: jest.fn().mockResolvedValue({
        ...createContractView(),
        signatories: [{ id: 'sig-1' }],
      }),
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue(null),
      getContractDocumentsBySystem: jest.fn().mockResolvedValue([]),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      addSignatoryWebhookAuditEvent: jest.fn().mockResolvedValue(undefined),
      markSignatoryAsSigned: jest.fn().mockResolvedValue(undefined),
      moveContractToInSignature: jest.fn().mockResolvedValue(undefined),
      deleteSigningPreparationDraft: jest.fn().mockResolvedValue(undefined),
      resolveEnvelopeContext: jest.fn(),
      getEnvelopeNotificationProfile: jest
        .fn()
        .mockResolvedValue({ contractTitle: 'Master Service Agreement', recipientEmails: [] }),
    } as never

    const contractDocumentDownloadService = {
      createSignedDownloadUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://signed-url',
        fileName: 'msa.pdf',
      }),
    } as never

    const contractRepository = {
      createDocument: jest.fn(),
    } as never

    const contractStorageRepository = {
      upload: jest.fn(),
    } as never

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('pdf'),
      headers: {
        get: () => 'application/pdf',
      },
    })
    const originalFetch = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch

    const signatureProvider = {
      createSigningEnvelope: jest.fn().mockResolvedValue({
        envelopeId: 'env-1',
        recipients: [
          {
            email: 'founder@nxtwave.co.in',
            recipientId: '1',
            clientUserId: '1',
            signingUrl: '',
          },
        ],
      }),
      downloadCompletedEnvelopeDocuments: jest.fn(),
    } as never

    const signatoryMailer = {
      sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    }

    const service = new ContractSignatoryService(
      contractQueryService,
      contractDocumentDownloadService,
      contractRepository,
      contractStorageRepository,
      signatureProvider,
      signatoryMailer as unknown as ContractSignatoryService['signatoryMailer'],
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      createLogger()
    )

    await service.assignSignatory({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
      recipients: [
        {
          signatoryEmail: 'founder@nxtwave.co.in',
          recipientType: 'INTERNAL',
          routingOrder: 1,
          fields: [],
        },
      ],
    })

    global.fetch = originalFetch

    expect(signatoryMailer.sendTemplateEmail).toHaveBeenCalledTimes(1)
    expect(signatoryMailer.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'founder@nxtwave.co.in',
        templateId: 101,
        templateParams: expect.objectContaining({
          signing_url: expect.stringContaining('/api/contracts/signatories/zoho-sign/redirect?token='),
        }),
      })
    )
  })

  it('assigns signatory by creating envelope, sending email, and persisting signatory', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue(mockContractView),
      addSignatory: jest.fn().mockResolvedValue({ ...mockContractView, signatories: [{ id: 'sig-1' }] }),
      markSignatoryAsSigned: jest.fn(),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn().mockResolvedValue({
        contractTitle: 'Master Service Agreement',
        recipientEmails: ['signatory@nxtwave.co.in'],
      }),
    }

    const contractDocumentDownloadService = {
      createSignedDownloadUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://example.com/signed-url',
        fileName: 'contract.pdf',
      }),
    }

    const signatureProvider = {
      createSigningEnvelope: jest.fn().mockResolvedValue({
        envelopeId: 'env-1',
        recipients: [
          {
            email: 'signatory@nxtwave.co.in',
            recipientId: '1',
            clientUserId: 'client-1',
            signingUrl: 'https://sign.zoho.in/sign/signer-link-1',
          },
        ],
      }),
      downloadCompletedEnvelopeDocuments: jest.fn(),
    }

    const signatoryMailer = {
      sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    }

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: {
        get: () => 'application/pdf',
      },
    } as unknown as Response)

    const service = new ContractSignatoryService(
      contractQueryService as never,
      contractDocumentDownloadService,
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      signatureProvider,
      signatoryMailer,
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      logger
    )

    const result = await service.assignSignatory({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
      recipients: [
        {
          signatoryEmail: 'signatory@nxtwave.co.in',
          recipientType: 'EXTERNAL',
          routingOrder: 1,
          fields: [],
        },
      ],
    })

    expect(contractDocumentDownloadService.createSignedDownloadUrl).toHaveBeenCalledWith({
      contractId: 'contract-1',
      tenantId: 'tenant-1',
      requestorEmployeeId: 'legal-1',
      requestorRole: 'LEGAL_TEAM',
      documentId: 'document-primary-1',
    })
    expect(signatureProvider.createSigningEnvelope).toHaveBeenCalled()
    expect(signatoryMailer.sendTemplateEmail).not.toHaveBeenCalled()
    expect(contractQueryService.recordContractNotificationDelivery).not.toHaveBeenCalled()
    expect(contractQueryService.addSignatory).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
      signatoryEmail: 'signatory@nxtwave.co.in',
      recipientType: 'EXTERNAL',
      routingOrder: 1,
      fieldConfig: [],
      zohoSignEnvelopeId: 'env-1',
      zohoSignRecipientId: '1',
      envelopeSourceDocumentId: 'document-primary-1',
    })
    expect(result.signatories).toEqual([{ id: 'sig-1' }])
  })

  it('marks signatory as signed only for completed status', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn(),
      addSignatory: jest.fn(),
      markSignatoryAsSigned: jest.fn().mockResolvedValue(undefined),
      getContractDocumentsBySystem: jest.fn().mockResolvedValue([]),
      resolveEnvelopeContext: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        signatoryEmail: 'signatory@nxtwave.co.in',
        recipientType: 'EXTERNAL',
        routingOrder: 1,
      }),
      recordZohoSignWebhookEvent: jest.fn().mockResolvedValue({ inserted: true }),
      addSignatoryWebhookAuditEvent: jest.fn().mockResolvedValue(undefined),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn().mockResolvedValue({
        contractTitle: 'Master Service Agreement',
        recipientEmails: ['signatory@nxtwave.co.in'],
      }),
    }

    const contractRepository = {
      createDocument: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      contractRepository as never,
      contractStorageRepository as never,
      {
        createSigningEnvelope: jest.fn(),
        downloadCompletedEnvelopeDocuments: jest.fn().mockResolvedValue({
          executedPdf: new Uint8Array([1, 2]),
          certificatePdf: new Uint8Array([3, 4]),
        }),
      },
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-2' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await service.handleZohoSignSignedWebhook({
      envelopeId: 'env-1',
      recipientEmail: 'signatory@nxtwave.co.in',
      status: 'completed',
      payload: {
        envelopeId: 'env-1',
        status: 'completed',
      },
    })

    expect(contractQueryService.recordZohoSignWebhookEvent).toHaveBeenCalled()
    expect(contractQueryService.addSignatoryWebhookAuditEvent).toHaveBeenCalled()
    expect(contractQueryService.markSignatoryAsSigned).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      envelopeId: 'env-1',
      recipientEmail: 'signatory@nxtwave.co.in',
      signedAt: undefined,
    })
    expect(contractStorageRepository.upload).toHaveBeenCalledTimes(2)
    expect(contractRepository.createDocument).toHaveBeenCalledTimes(2)
    expect(contractQueryService.getEnvelopeNotificationProfile).toHaveBeenCalled()
    expect(contractQueryService.recordContractNotificationDelivery).toHaveBeenCalled()
  })

  it('processes completion artifacts for duplicate webhook when artifacts are still missing', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn(),
      addSignatory: jest.fn(),
      markSignatoryAsSigned: jest.fn().mockResolvedValue(undefined),
      getContractDocumentsBySystem: jest.fn().mockResolvedValue([]),
      resolveEnvelopeContext: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        signatoryEmail: 'signatory@nxtwave.co.in',
        recipientType: 'EXTERNAL',
        routingOrder: 1,
      }),
      recordZohoSignWebhookEvent: jest.fn().mockResolvedValue({ inserted: false }),
      addSignatoryWebhookAuditEvent: jest.fn().mockResolvedValue(undefined),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn().mockResolvedValue({
        contractTitle: 'Master Service Agreement',
        recipientEmails: ['signatory@nxtwave.co.in'],
      }),
    }

    const contractRepository = {
      createDocument: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      contractRepository as never,
      contractStorageRepository as never,
      {
        createSigningEnvelope: jest.fn(),
        downloadCompletedEnvelopeDocuments: jest.fn().mockResolvedValue({
          executedPdf: new Uint8Array([1, 2]),
          certificatePdf: new Uint8Array([3, 4]),
        }),
      },
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-2' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await service.handleZohoSignSignedWebhook({
      envelopeId: 'env-1',
      recipientEmail: 'signatory@nxtwave.co.in',
      status: 'completed',
      payload: {
        envelopeId: 'env-1',
        status: 'completed',
      },
    })

    expect(contractStorageRepository.upload).toHaveBeenCalledTimes(2)
    expect(contractRepository.createDocument).toHaveBeenCalledTimes(2)
    expect(contractQueryService.getEnvelopeNotificationProfile).not.toHaveBeenCalled()
  })

  it('normalizes hyphenated completion status values', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn(),
      addSignatory: jest.fn(),
      markSignatoryAsSigned: jest.fn().mockResolvedValue(undefined),
      getContractDocumentsBySystem: jest.fn().mockResolvedValue([]),
      resolveEnvelopeContext: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        signatoryEmail: 'signatory@nxtwave.co.in',
        recipientType: 'EXTERNAL',
        routingOrder: 1,
      }),
      recordZohoSignWebhookEvent: jest.fn().mockResolvedValue({ inserted: true }),
      addSignatoryWebhookAuditEvent: jest.fn().mockResolvedValue(undefined),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn().mockResolvedValue({
        contractTitle: 'Master Service Agreement',
        recipientEmails: ['signatory@nxtwave.co.in'],
      }),
    }

    const contractRepository = {
      createDocument: jest.fn().mockResolvedValue(undefined),
    }

    const contractStorageRepository = {
      upload: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      contractRepository as never,
      contractStorageRepository as never,
      {
        createSigningEnvelope: jest.fn(),
        downloadCompletedEnvelopeDocuments: jest.fn().mockResolvedValue({
          executedPdf: new Uint8Array([1, 2]),
          certificatePdf: new Uint8Array([3, 4]),
        }),
      },
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-2' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await service.handleZohoSignSignedWebhook({
      envelopeId: 'env-1',
      recipientEmail: 'signatory@nxtwave.co.in',
      status: 'envelope-completed',
      payload: {
        envelopeId: 'env-1',
        status: 'envelope-completed',
      },
    })

    expect(contractQueryService.markSignatoryAsSigned).toHaveBeenCalledTimes(1)
    expect(contractStorageRepository.upload).toHaveBeenCalledTimes(2)
    expect(contractRepository.createDocument).toHaveBeenCalledTimes(2)
  })

  it('raises external service error when zoho sign request creation fails', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue(mockContractView),
      addSignatory: jest.fn(),
      markSignatoryAsSigned: jest.fn(),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      {
        createSignedDownloadUrl: jest.fn().mockResolvedValue({
          signedUrl: 'https://example.com/signed-url',
          fileName: 'contract.pdf',
        }),
      },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      {
        createSigningEnvelope: jest.fn().mockRejectedValue(new Error('Zoho Sign down')),
        downloadCompletedEnvelopeDocuments: jest.fn(),
      },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'application/pdf' },
    } as unknown as Response)

    await expect(
      service.assignSignatory({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
        recipients: [
          {
            signatoryEmail: 'signatory@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
            fields: [],
          },
        ],
      })
    ).rejects.toBeInstanceOf(ExternalServiceError)
  })

  it('rejects signatory assignment outside COMPLETED', async () => {
    const contractQueryService = {
      getContractDetail: jest.fn().mockResolvedValue({
        ...mockContractView,
        contract: {
          ...mockContractView.contract,
          status: 'LEGAL_PENDING',
        },
      }),
      addSignatory: jest.fn(),
      markSignatoryAsSigned: jest.fn(),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      { createSigningEnvelope: jest.fn(), downloadCompletedEnvelopeDocuments: jest.fn() },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.assignSignatory({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
        recipients: [
          {
            signatoryEmail: 'signatory@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
            fields: [],
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'SIGNATORY_ASSIGN_INVALID_STATUS' })
  })

  it('enforces signature-per-recipient validation before send', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          {
            name: 'Internal User',
            email: 'internal@nxtwave.co.in',
            recipientType: 'INTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [
          {
            fieldType: 'TEXT',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'internal@nxtwave.co.in',
          },
        ],
      }),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      { createSigningEnvelope: jest.fn(), downloadCompletedEnvelopeDocuments: jest.fn() },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'SIGNING_PREPARATION_SIGNATURE_REQUIRED',
    })
  })

  it('enforces routing order validation before send', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          {
            name: 'Internal User',
            email: 'internal@nxtwave.co.in',
            recipientType: 'INTERNAL',
            routingOrder: 0,
          },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'internal@nxtwave.co.in',
          },
        ],
      }),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      { createSigningEnvelope: jest.fn(), downloadCompletedEnvelopeDocuments: jest.fn() },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'SIGNING_PREPARATION_ROUTING_ORDER_INVALID',
    })
  })

  it('rejects mixed routing order mode before send', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          { name: 'Signer One', email: 'one@nxtwave.co.in', recipientType: 'EXTERNAL', routingOrder: 1 },
          { name: 'Signer Two', email: 'two@nxtwave.co.in', recipientType: 'EXTERNAL', routingOrder: 1 },
          { name: 'Signer Three', email: 'three@nxtwave.co.in', recipientType: 'EXTERNAL', routingOrder: 2 },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'one@nxtwave.co.in',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 20,
            yPosition: 30,
            anchorString: null,
            assignedSignerEmail: 'two@nxtwave.co.in',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 30,
            yPosition: 40,
            anchorString: null,
            assignedSignerEmail: 'three@nxtwave.co.in',
          },
        ],
      }),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      { createSigningEnvelope: jest.fn(), downloadCompletedEnvelopeDocuments: jest.fn() },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'SIGNING_PREPARATION_ROUTING_ORDER_INVALID',
    })
  })

  it('allows parallel send when all routing orders are identical', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          { name: 'Signer One', email: 'one@nxtwave.co.in', recipientType: 'EXTERNAL', routingOrder: 1 },
          { name: 'Signer Two', email: 'two@nxtwave.co.in', recipientType: 'EXTERNAL', routingOrder: 1 },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'one@nxtwave.co.in',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 20,
            yPosition: 30,
            anchorString: null,
            assignedSignerEmail: 'two@nxtwave.co.in',
          },
        ],
      }),
      getContractDetail: jest.fn().mockResolvedValue({
        ...mockContractView,
        contract: { ...mockContractView.contract, currentDocumentId: 'doc-1' },
      }),
      addSignatory: jest.fn().mockResolvedValue({
        ...mockContractView,
        signatories: [
          {
            id: 'sig-1',
            signatoryEmail: 'one@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
            fieldConfig: [],
            status: 'PENDING',
            signedAt: null,
            zohoSignEnvelopeId: 'env-123',
            zohoSignRecipientId: 'a1',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'sig-2',
            signatoryEmail: 'two@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
            fieldConfig: [],
            status: 'PENDING',
            signedAt: null,
            zohoSignEnvelopeId: 'env-123',
            zohoSignRecipientId: 'a2',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
      moveContractToInSignature: jest.fn().mockResolvedValue(undefined),
      deleteSigningPreparationDraft: jest.fn().mockResolvedValue(undefined),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'application/pdf' },
    } as unknown as Response)

    const signatureProvider = {
      createSigningEnvelope: jest.fn().mockResolvedValue({
        envelopeId: 'env-123',
        recipients: [
          { email: 'one@nxtwave.co.in', recipientId: 'a1', clientUserId: 'c1', signingUrl: '' },
          { email: 'two@nxtwave.co.in', recipientId: 'a2', clientUserId: 'c2', signingUrl: '' },
        ],
      }),
      downloadCompletedEnvelopeDocuments: jest.fn(),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      {
        createSignedDownloadUrl: jest.fn().mockResolvedValue({
          signedUrl: 'https://example.com/signed-url',
          fileName: 'contract.pdf',
        }),
      },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      signatureProvider,
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    const result = await service.sendSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
    })

    expect(result.envelopeId).toBe('env-123')
    expect(signatureProvider.createSigningEnvelope).toHaveBeenCalledTimes(1)
    expect(contractQueryService.addSignatory).toHaveBeenCalledTimes(2)
  })

  it('requires draft to exist before send', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue(null),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      { createSigningEnvelope: jest.fn(), downloadCompletedEnvelopeDocuments: jest.fn() },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'SIGNING_PREPARATION_DRAFT_NOT_FOUND',
    })
  })

  it('sends draft and locks contract only after envelope creation success', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest
        .fn()
        .mockResolvedValueOnce({
          contractId: 'contract-1',
          recipients: [
            {
              name: 'Internal User',
              email: 'internal@nxtwave.co.in',
              recipientType: 'INTERNAL',
              routingOrder: 1,
            },
            {
              name: 'External User',
              email: 'external@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 2,
            },
          ],
          fields: [
            {
              fieldType: 'SIGNATURE',
              pageNumber: 1,
              xPosition: 10,
              yPosition: 20,
              anchorString: null,
              assignedSignerEmail: 'internal@nxtwave.co.in',
            },
            {
              fieldType: 'SIGNATURE',
              pageNumber: 1,
              xPosition: 20,
              yPosition: 30,
              anchorString: null,
              assignedSignerEmail: 'external@nxtwave.co.in',
            },
          ],
        })
        .mockResolvedValueOnce(null),
      getContractDetail: jest
        .fn()
        .mockResolvedValueOnce(mockContractView)
        .mockResolvedValueOnce({
          ...mockContractView,
          contract: {
            ...mockContractView.contract,
            status: 'IN_SIGNATURE',
          },
          signatories: [
            {
              id: 'sig-1',
              signatoryEmail: 'internal@nxtwave.co.in',
              recipientType: 'INTERNAL',
              routingOrder: 1,
              fieldConfig: [],
              status: 'PENDING',
              signedAt: null,
              zohoSignEnvelopeId: 'env-1',
              zohoSignRecipientId: '1',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'sig-2',
              signatoryEmail: 'external@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 2,
              fieldConfig: [],
              status: 'PENDING',
              signedAt: null,
              zohoSignEnvelopeId: 'env-1',
              zohoSignRecipientId: '2',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      addSignatory: jest
        .fn()
        .mockResolvedValueOnce({
          ...mockContractView,
          signatories: [
            {
              id: 'sig-1',
              signatoryEmail: 'internal@nxtwave.co.in',
              recipientType: 'INTERNAL',
              routingOrder: 1,
              fieldConfig: [],
              status: 'PENDING',
              signedAt: null,
              zohoSignEnvelopeId: 'env-1',
              zohoSignRecipientId: '1',
              createdAt: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          ...mockContractView,
          signatories: [
            {
              id: 'sig-1',
              signatoryEmail: 'internal@nxtwave.co.in',
              recipientType: 'INTERNAL',
              routingOrder: 1,
              fieldConfig: [],
              status: 'PENDING',
              signedAt: null,
              zohoSignEnvelopeId: 'env-1',
              zohoSignRecipientId: '1',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'sig-2',
              signatoryEmail: 'external@nxtwave.co.in',
              recipientType: 'EXTERNAL',
              routingOrder: 2,
              fieldConfig: [],
              status: 'PENDING',
              signedAt: null,
              zohoSignEnvelopeId: 'env-1',
              zohoSignRecipientId: '2',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      moveContractToInSignature: jest.fn().mockResolvedValue(undefined),
      deleteSigningPreparationDraft: jest.fn().mockResolvedValue(undefined),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    const signatureProvider = {
      createSigningEnvelope: jest.fn().mockResolvedValue({
        envelopeId: 'env-1',
        recipients: [
          {
            email: 'internal@nxtwave.co.in',
            recipientId: '1',
            clientUserId: 'c1',
            signingUrl: 'https://zoho-sign.example/internal',
          },
          {
            email: 'external@nxtwave.co.in',
            recipientId: '2',
            clientUserId: 'c2',
            signingUrl: 'https://zoho-sign.example/external',
          },
        ],
      }),
      downloadCompletedEnvelopeDocuments: jest.fn(),
    }

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'application/pdf' },
    } as unknown as Response)

    const service = new ContractSignatoryService(
      contractQueryService as never,
      {
        createSignedDownloadUrl: jest.fn().mockResolvedValue({
          signedUrl: 'https://example.com/signed-url',
          fileName: 'contract.pdf',
        }),
      },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      signatureProvider,
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    const result = await service.sendSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
    })

    expect(result.envelopeId).toBe('env-1')
    expect(signatureProvider.createSigningEnvelope).toHaveBeenCalledTimes(1)
    expect(contractQueryService.moveContractToInSignature).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
      envelopeId: 'env-1',
    })
    expect(contractQueryService.deleteSigningPreparationDraft).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
    })
  })

  it('persists all recipients for mixed embedded and external envelopes', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          { name: 'Ext One', email: 'ext1@example.com', recipientType: 'EXTERNAL', routingOrder: 1 },
          { name: 'Int One', email: 'int@example.com', recipientType: 'INTERNAL', routingOrder: 2 },
          { name: 'Ext Two', email: 'ext2@example.com', recipientType: 'EXTERNAL', routingOrder: 3 },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'ext1@example.com',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 15,
            yPosition: 25,
            anchorString: null,
            assignedSignerEmail: 'int@example.com',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 20,
            yPosition: 30,
            anchorString: null,
            assignedSignerEmail: 'ext2@example.com',
          },
        ],
      }),
      getContractDetail: jest.fn().mockResolvedValue({
        ...mockContractView,
        contract: { ...mockContractView.contract, currentDocumentId: 'doc-1' },
      }),
      addSignatory: jest.fn().mockResolvedValue({
        ...mockContractView,
        signatories: [
          {
            id: 'sig-1',
            signatoryEmail: 'ext1@example.com',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
            fieldConfig: [],
            status: 'PENDING',
            signedAt: null,
            zohoSignEnvelopeId: 'env-123',
            zohoSignRecipientId: 'a1',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'sig-2',
            signatoryEmail: 'int@example.com',
            recipientType: 'INTERNAL',
            routingOrder: 2,
            fieldConfig: [],
            status: 'PENDING',
            signedAt: null,
            zohoSignEnvelopeId: 'env-123',
            zohoSignRecipientId: 'a2',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'sig-3',
            signatoryEmail: 'ext2@example.com',
            recipientType: 'EXTERNAL',
            routingOrder: 3,
            fieldConfig: [],
            status: 'PENDING',
            signedAt: null,
            zohoSignEnvelopeId: 'env-123',
            zohoSignRecipientId: 'a3',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
      moveContractToInSignature: jest.fn().mockResolvedValue(undefined),
      deleteSigningPreparationDraft: jest.fn().mockResolvedValue(undefined),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'application/pdf' },
    } as unknown as Response)

    const signatureProvider = {
      createSigningEnvelope: jest.fn().mockResolvedValue({
        envelopeId: 'env-123',
        recipients: [
          { email: 'ext1@example.com', recipientId: 'a1', clientUserId: 'c1', signingUrl: '' },
          { email: 'int@example.com', recipientId: 'a2', clientUserId: 'c2', signingUrl: '' },
          { email: 'ext2@example.com', recipientId: 'a3', clientUserId: 'c3', signingUrl: '' },
        ],
      }),
      downloadCompletedEnvelopeDocuments: jest.fn(),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      {
        createSignedDownloadUrl: jest.fn().mockResolvedValue({
          signedUrl: 'https://example.com/signed-url',
          fileName: 'contract.pdf',
        }),
      },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      signatureProvider,
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await service.sendSigningPreparationDraft({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      actorEmployeeId: 'legal-1',
      actorRole: 'LEGAL_TEAM',
      actorEmail: 'legal@nxtwave.co.in',
    })

    expect(signatureProvider.createSigningEnvelope).toHaveBeenCalledTimes(1)
    expect(contractQueryService.addSignatory).toHaveBeenCalledTimes(3)
    expect(contractQueryService.addSignatory).toHaveBeenCalledWith(
      expect.objectContaining({
        signatoryEmail: 'ext1@example.com',
        zohoSignRecipientId: 'a1',
      })
    )
    expect(contractQueryService.addSignatory).toHaveBeenCalledWith(
      expect.objectContaining({
        signatoryEmail: 'int@example.com',
        zohoSignRecipientId: 'a2',
      })
    )
    expect(contractQueryService.addSignatory).toHaveBeenCalledWith(
      expect.objectContaining({
        signatoryEmail: 'ext2@example.com',
        zohoSignRecipientId: 'a3',
      })
    )
  })

  it('fails when Zoho response omits a recipient mapping', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          { name: 'Ext One', email: 'ext1@example.com', recipientType: 'EXTERNAL', routingOrder: 1 },
          { name: 'Int One', email: 'int@example.com', recipientType: 'INTERNAL', routingOrder: 2 },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'ext1@example.com',
          },
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 15,
            yPosition: 25,
            anchorString: null,
            assignedSignerEmail: 'int@example.com',
          },
        ],
      }),
      getContractDetail: jest.fn().mockResolvedValue({
        ...mockContractView,
        contract: { ...mockContractView.contract, currentDocumentId: 'doc-1' },
      }),
      addSignatory: jest.fn().mockResolvedValue(mockContractView),
      moveContractToInSignature: jest.fn().mockResolvedValue(undefined),
      deleteSigningPreparationDraft: jest.fn().mockResolvedValue(undefined),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'application/pdf' },
    } as unknown as Response)

    const signatureProvider = {
      createSigningEnvelope: jest.fn().mockResolvedValue({
        envelopeId: 'env-123',
        recipients: [
          { email: 'ext1@example.com', recipientId: 'a1', clientUserId: 'c1', signingUrl: '' },
          // Missing int@example.com mapping
        ],
      }),
      downloadCompletedEnvelopeDocuments: jest.fn(),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      {
        createSignedDownloadUrl: jest.fn().mockResolvedValue({
          signedUrl: 'https://example.com/signed-url',
          fileName: 'contract.pdf',
        }),
      },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      signatureProvider,
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toBeInstanceOf(ExternalServiceError)

    expect(contractQueryService.moveContractToInSignature).not.toHaveBeenCalled()
    expect(contractQueryService.deleteSigningPreparationDraft).not.toHaveBeenCalled()
  })

  it('rejects duplicate send attempts when pending signatories already exist', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(1),
      getSigningPreparationDraft: jest.fn(),
    }

    const service = new ContractSignatoryService(
      contractQueryService as never,
      { createSignedDownloadUrl: jest.fn() },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      { createSigningEnvelope: jest.fn(), downloadCompletedEnvelopeDocuments: jest.fn() },
      { sendTemplateEmail: jest.fn() },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toMatchObject<Partial<BusinessRuleError>>({
      code: 'SIGNING_PREPARATION_ALREADY_SENT',
    })

    expect(contractQueryService.getSigningPreparationDraft).not.toHaveBeenCalled()
  })

  it('keeps contract editable when envelope creation fails during send', async () => {
    const contractQueryService = {
      countPendingSignatoriesByContract: jest.fn().mockResolvedValue(0),
      getSigningPreparationDraft: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        recipients: [
          {
            name: 'External User',
            email: 'external@nxtwave.co.in',
            recipientType: 'EXTERNAL',
            routingOrder: 1,
          },
        ],
        fields: [
          {
            fieldType: 'SIGNATURE',
            pageNumber: 1,
            xPosition: 10,
            yPosition: 20,
            anchorString: null,
            assignedSignerEmail: 'external@nxtwave.co.in',
          },
        ],
      }),
      getContractDetail: jest.fn().mockResolvedValue(mockContractView),
      addSignatory: jest.fn(),
      moveContractToInSignature: jest.fn(),
      deleteSigningPreparationDraft: jest.fn(),
      resolveEnvelopeContext: jest.fn(),
      recordZohoSignWebhookEvent: jest.fn(),
      addSignatoryWebhookAuditEvent: jest.fn(),
      recordContractNotificationDelivery: jest.fn().mockResolvedValue(undefined),
      getEnvelopeNotificationProfile: jest.fn(),
    }

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'application/pdf' },
    } as unknown as Response)

    const service = new ContractSignatoryService(
      contractQueryService as never,
      {
        createSignedDownloadUrl: jest.fn().mockResolvedValue({
          signedUrl: 'https://example.com/signed-url',
          fileName: 'contract.pdf',
        }),
      },
      { createDocument: jest.fn() } as never,
      { upload: jest.fn() } as never,
      {
        createSigningEnvelope: jest.fn().mockRejectedValue(new Error('Zoho Sign unavailable')),
        downloadCompletedEnvelopeDocuments: jest.fn(),
      },
      { sendTemplateEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) },
      {
        signatoryLinkTemplateId: 101,
        signingCompletedTemplateId: 102,
      },
      'https://app.example.com',
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    )

    await expect(
      service.sendSigningPreparationDraft({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        actorEmployeeId: 'legal-1',
        actorRole: 'LEGAL_TEAM',
        actorEmail: 'legal@nxtwave.co.in',
      })
    ).rejects.toBeInstanceOf(ExternalServiceError)

    expect(contractQueryService.moveContractToInSignature).not.toHaveBeenCalled()
    expect(contractQueryService.deleteSigningPreparationDraft).not.toHaveBeenCalled()
  })
})
