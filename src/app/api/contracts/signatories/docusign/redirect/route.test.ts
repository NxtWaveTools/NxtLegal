const mockContractQueryService = {
  resolveEnvelopeContext: jest.fn(),
}

const mockCreateEmbeddedSigningUrl = jest.fn()
const mockGetSession = jest.fn()

jest.mock('@/core/registry/service-registry', () => ({
  getContractQueryService: () => mockContractQueryService,
}))

jest.mock('@/core/config/app-config', () => ({
  appConfig: {
    auth: { siteUrl: 'https://app.example.com' },
    zohoSign: {
      apiBaseUrl: 'https://sign.zoho.in/api/v1',
      accessToken: 'test-token',
      webhookSecret: 'test-secret',
    },
  },
}))

jest.mock('@/core/infra/integrations/zoho-sign/zoho-sign-client', () => ({
  ZohoSignClient: jest.fn().mockImplementation(() => ({
    createEmbeddedSigningUrl: mockCreateEmbeddedSigningUrl,
  })),
}))

jest.mock('@/core/infra/security/signatory-link-token', () => ({
  verifySignatoryLinkToken: jest.fn(),
}))

jest.mock('@/core/infra/session/jwt-session-store', () => ({
  getSession: () => mockGetSession(),
}))

import { verifySignatoryLinkToken } from '@/core/infra/security/signatory-link-token'
import { GET } from '@/app/api/contracts/signatories/docusign/redirect/route'

describe('Signatory redirect route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({
      employeeId: 'emp-1',
      tenantId: 'tenant-1',
      email: 'signer@nxtwave.co.in',
    })
  })

  it('returns bad request when token is missing', async () => {
    const response = await GET({
      nextUrl: new URL('https://app.example.com/api/contracts/signatories/docusign/redirect'),
    } as unknown as Parameters<typeof GET>[0])

    const body = await response.json()
    expect(response.status).toBe(400)
    expect(body.error.code).toBe('SIGNATORY_LINK_INVALID')
  })

  it('redirects to fresh Zoho embedded URL for valid external token without app session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    ;(verifySignatoryLinkToken as jest.Mock).mockResolvedValueOnce({
      envelopeId: 'req-1',
      recipientEmail: 'signer@nxtwave.co.in',
      recipientId: 'action-1',
    })

    mockContractQueryService.resolveEnvelopeContext.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      signatoryEmail: 'signer@nxtwave.co.in',
      signatoryStatus: 'PENDING',
      contractStatus: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
      recipientType: 'EXTERNAL',
      routingOrder: 1,
    })

    mockCreateEmbeddedSigningUrl.mockResolvedValueOnce('https://sign.zoho.in/embed/sign-url')

    const response = await GET({
      nextUrl: new URL('https://app.example.com/api/contracts/signatories/docusign/redirect?token=abc'),
    } as unknown as Parameters<typeof GET>[0])

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://sign.zoho.in/embed/sign-url')
  })

  it('returns unauthorized when internal signer has no active session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    ;(verifySignatoryLinkToken as jest.Mock).mockResolvedValueOnce({
      envelopeId: 'req-1',
      recipientEmail: 'signer@nxtwave.co.in',
      recipientId: 'action-1',
    })
    mockContractQueryService.resolveEnvelopeContext.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      signatoryEmail: 'signer@nxtwave.co.in',
      signatoryStatus: 'PENDING',
      contractStatus: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
      recipientType: 'INTERNAL',
      routingOrder: 1,
    })

    const response = await GET({
      nextUrl: new URL('https://app.example.com/api/contracts/signatories/docusign/redirect?token=abc'),
    } as unknown as Parameters<typeof GET>[0])

    const body = await response.json()
    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns forbidden when contract is void', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    ;(verifySignatoryLinkToken as jest.Mock).mockResolvedValueOnce({
      envelopeId: 'req-1',
      recipientEmail: 'signer@nxtwave.co.in',
      recipientId: 'action-1',
    })
    mockContractQueryService.resolveEnvelopeContext.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      signatoryEmail: 'signer@nxtwave.co.in',
      signatoryStatus: 'PENDING',
      contractStatus: 'VOID',
      recipientType: 'EXTERNAL',
      routingOrder: 1,
    })

    const response = await GET({
      nextUrl: new URL('https://app.example.com/api/contracts/signatories/docusign/redirect?token=abc'),
    } as unknown as Parameters<typeof GET>[0])

    const body = await response.json()
    expect(response.status).toBe(403)
    expect(body.error.code).toBe('SIGNATORY_LINK_FORBIDDEN')
  })

  it('allows redirect when signatory is already signed', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    ;(verifySignatoryLinkToken as jest.Mock).mockResolvedValueOnce({
      envelopeId: 'req-1',
      recipientEmail: 'signer@nxtwave.co.in',
      recipientId: 'action-1',
    })
    mockContractQueryService.resolveEnvelopeContext.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      signatoryEmail: 'signer@nxtwave.co.in',
      signatoryStatus: 'SIGNED',
      contractStatus: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
      recipientType: 'EXTERNAL',
      routingOrder: 1,
    })
    mockCreateEmbeddedSigningUrl.mockResolvedValueOnce('https://sign.zoho.in/embed/sign-url')

    const response = await GET({
      nextUrl: new URL('https://app.example.com/api/contracts/signatories/docusign/redirect?token=abc'),
    } as unknown as Parameters<typeof GET>[0])

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://sign.zoho.in/embed/sign-url')
  })

  it('returns unauthorized when internal signer session is not accepted', async () => {
    mockGetSession.mockImplementation(async () => ({
      employeeId: 'emp-1',
      tenantId: 'tenant-1',
      email: 'signer@nxtwave.co.in',
    }))
    ;(verifySignatoryLinkToken as jest.Mock).mockResolvedValueOnce({
      envelopeId: 'req-1',
      recipientEmail: 'another-user@nxtwave.co.in',
      recipientId: 'action-1',
    })
    mockContractQueryService.resolveEnvelopeContext.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      signatoryEmail: 'another-user@nxtwave.co.in',
      signatoryStatus: 'PENDING',
      contractStatus: 'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
      recipientType: 'INTERNAL',
      routingOrder: 1,
    })

    const response = await GET({
      nextUrl: new URL('https://app.example.com/api/contracts/signatories/docusign/redirect?token=abc'),
    } as unknown as Parameters<typeof GET>[0])

    const body = await response.json()
    expect(mockGetSession).toHaveBeenCalled()
    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})
