import { BusinessRuleError } from '@/core/http/errors'

const mockContractSignatoryService = {
  handleDocusignSignedWebhook: jest.fn(),
}

jest.mock('@/core/registry/service-registry', () => ({
  getContractSignatoryService: () => mockContractSignatoryService,
}))

jest.mock('@/core/config/app-config', () => ({
  appConfig: {
    docusign: {
      webhookSecret: 'test-webhook-secret',
    },
  },
}))

import { appConfig } from '@/core/config/app-config'
import { POST } from '@/app/api/contracts/signatories/docusign/webhook/route'

type PostRequestArg = Parameters<typeof POST>[0]

describe('DocuSign signatory webhook route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(appConfig.docusign as { webhookSecret?: string }).webhookSecret = 'test-webhook-secret'
  })

  it('returns disabled when webhook secret is not configured', async () => {
    ;(appConfig.docusign as { webhookSecret?: string }).webhookSecret = undefined

    const response = await POST({
      headers: new Headers(),
      json: async () => ({}),
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('DOCUSIGN_WEBHOOK_DISABLED')
  })

  it('returns forbidden for invalid webhook signature', async () => {
    const response = await POST({
      headers: new Headers({ 'x-docusign-webhook-secret': 'wrong-secret' }),
      json: async () => ({}),
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('DOCUSIGN_WEBHOOK_FORBIDDEN')
  })

  it('returns validation error for invalid payload', async () => {
    const response = await POST({
      headers: new Headers({ 'x-docusign-webhook-secret': 'test-webhook-secret' }),
      json: async () => ({ envelopeId: '' }),
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('processes valid webhook payload', async () => {
    const payload = {
      envelopeId: 'env-1',
      recipientEmail: 'signer@nxtwave.co.in',
      status: 'completed',
      eventId: 'event-1',
    }

    const response = await POST({
      headers: new Headers({ 'x-docusign-webhook-secret': 'test-webhook-secret' }),
      json: async () => payload,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.processed).toBe(true)
    expect(mockContractSignatoryService.handleDocusignSignedWebhook).toHaveBeenCalledWith({
      envelopeId: 'env-1',
      recipientEmail: 'signer@nxtwave.co.in',
      status: 'completed',
      signedAt: undefined,
      eventId: 'event-1',
      signerIp: undefined,
      payload,
    })
  })

  it('maps app errors with status and code', async () => {
    mockContractSignatoryService.handleDocusignSignedWebhook.mockRejectedValueOnce(
      new BusinessRuleError('WEBHOOK_PAYLOAD_REJECTED', 'Rejected')
    )

    const response = await POST({
      headers: new Headers({ 'x-docusign-webhook-secret': 'test-webhook-secret' }),
      json: async () => ({
        envelopeId: 'env-1',
        status: 'completed',
      }),
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('WEBHOOK_PAYLOAD_REJECTED')
  })
})
