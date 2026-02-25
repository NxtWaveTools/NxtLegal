import { BusinessRuleError } from '@/core/http/errors'
import { createHmac } from 'crypto'

const mockContractSignatoryService = {
  handleDocusignSignedWebhook: jest.fn(),
}

jest.mock('@/core/registry/service-registry', () => ({
  getContractSignatoryService: () => mockContractSignatoryService,
}))

jest.mock('@/core/config/app-config', () => ({
  appConfig: {
    docusign: {
      connectKey: 'test-docusign-connect-key',
    },
  },
}))

import { appConfig } from '@/core/config/app-config'
import { POST } from '@/app/api/contracts/signatories/docusign/webhook/route'

type PostRequestArg = Parameters<typeof POST>[0]

const createSignature = (rawBody: string, connectKey: string): string => {
  return createHmac('sha256', connectKey).update(rawBody, 'utf8').digest('base64')
}

describe('DocuSign signatory webhook route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(appConfig.docusign as { connectKey?: string }).connectKey = 'test-docusign-connect-key'
  })

  it('returns disabled when connect key is not configured', async () => {
    ;(appConfig.docusign as { connectKey?: string }).connectKey = undefined

    const response = await POST({
      headers: new Headers(),
      text: async () => JSON.stringify({}),
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('DOCUSIGN_WEBHOOK_DISABLED')
  })

  it('returns forbidden for invalid webhook signature', async () => {
    const rawBody = JSON.stringify({ envelopeId: 'env-1', status: 'completed' })
    const response = await POST({
      headers: new Headers({ 'x-docusign-signature-1': 'invalid-signature' }),
      text: async () => rawBody,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('DOCUSIGN_WEBHOOK_FORBIDDEN')
  })

  it('returns validation error for invalid payload', async () => {
    const rawBody = JSON.stringify({ envelopeId: '' })
    const signature = createSignature(rawBody, 'test-docusign-connect-key')

    const response = await POST({
      headers: new Headers({ 'x-docusign-signature-1': signature }),
      text: async () => rawBody,
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
    const rawBody = JSON.stringify(payload)
    const signature = createSignature(rawBody, 'test-docusign-connect-key')

    const response = await POST({
      headers: new Headers({ 'x-docusign-signature-1': signature }),
      text: async () => rawBody,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.received).toBe(true)
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

    const rawBody = JSON.stringify({
      envelopeId: 'env-1',
      status: 'completed',
    })
    const signature = createSignature(rawBody, 'test-docusign-connect-key')

    const response = await POST({
      headers: new Headers({ 'x-docusign-signature-1': signature }),
      text: async () => rawBody,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('WEBHOOK_PAYLOAD_REJECTED')
  })
})
