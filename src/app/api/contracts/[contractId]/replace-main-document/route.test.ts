import { BusinessRuleError } from '@/core/http/errors'

const mockSession = {
  employeeId: 'legal-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'LEGAL_TEAM',
  email: 'legal@nxtwave.co.in',
  fullName: 'Legal User',
}

const mockContractUploadService = {
  replacePrimaryDocument: jest.fn(),
}

const mockIdempotencyService = {
  claimOrGet: jest.fn(),
  store: jest.fn(),
  releaseClaim: jest.fn(),
}

type MockRequest = {
  headers: { get: (name: string) => string | null }
  formData: () => Promise<FormData>
}

type MockContext = {
  params?: Record<string, string>
}

type MockAuthHandler = (
  request: MockRequest,
  context: { session: typeof mockSession; params?: Record<string, string> }
) => unknown

jest.mock('@/core/http/with-auth', () => ({
  withAuth: (handler: MockAuthHandler) => {
    return async (request: MockRequest, context: MockContext = {}) => {
      return handler(request, {
        session: mockSession,
        params: context.params,
      })
    }
  },
}))

jest.mock('@/core/registry/service-registry', () => ({
  getContractUploadService: () => mockContractUploadService,
  getIdempotencyService: () => mockIdempotencyService,
}))

import { POST } from '@/app/api/contracts/[contractId]/replace-main-document/route'

type PostRequestArg = Parameters<typeof POST>[0]
type PostContextArg = Parameters<typeof POST>[1]

describe('Replace main contract document route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.tenantId = '00000000-0000-0000-0000-000000000000'
  })

  function createRequest(params?: {
    idempotencyKey?: string
    file?: File | null
    isFinalExecuted?: string
  }): PostRequestArg {
    const form = new FormData()
    if (params?.file !== null) {
      form.set(
        'file',
        params?.file ?? new File([new Uint8Array([1, 2, 3])], 'replacement.pdf', { type: 'application/pdf' })
      )
    }
    if (typeof params?.isFinalExecuted === 'string') {
      form.set('isFinalExecuted', params.isFinalExecuted)
    }

    return {
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'idempotency-key') {
            return params?.idempotencyKey ?? 'replace-key-1'
          }

          return null
        },
      },
      formData: async () => form,
    } as PostRequestArg
  }

  it('returns session invalid when tenant is missing', async () => {
    mockSession.tenantId = ''

    const response = await POST(createRequest(), { params: { contractId: 'contract-1' } } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SESSION_INVALID')
  })

  it('returns contract id required for missing contract id', async () => {
    const response = await POST(createRequest(), { params: {} } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONTRACT_ID_REQUIRED')
  })

  it('returns idempotency required when header is missing', async () => {
    const response = await POST(createRequest({ idempotencyKey: '' }), {
      params: { contractId: 'contract-1' },
    } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('replaces document on success', async () => {
    mockIdempotencyService.claimOrGet.mockResolvedValueOnce({ status: 'claimed' })
    mockContractUploadService.replacePrimaryDocument.mockResolvedValueOnce({
      id: 'document-2',
      documentKind: 'PRIMARY',
      versionNumber: 2,
      displayName: 'Primary Contract',
      fileName: 'replacement.pdf',
      fileSizeBytes: 3,
      fileMimeType: 'application/pdf',
      createdAt: new Date().toISOString(),
    })

    const response = await POST(createRequest(), { params: { contractId: 'contract-1' } } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.document.versionNumber).toBe(2)
    expect(mockContractUploadService.replacePrimaryDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'contract-1',
        tenantId: mockSession.tenantId,
        uploadedByRole: mockSession.role,
      })
    )
    expect(mockIdempotencyService.store).toHaveBeenCalled()
  })

  it('maps app errors with status and code', async () => {
    mockIdempotencyService.claimOrGet.mockResolvedValueOnce({ status: 'claimed' })
    mockContractUploadService.replacePrimaryDocument.mockRejectedValueOnce(
      new BusinessRuleError('CONTRACT_IN_SIGNATURE_REPLACEMENT_FORBIDDEN', 'Blocked')
    )

    const response = await POST(createRequest(), { params: { contractId: 'contract-1' } } as PostContextArg)
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONTRACT_IN_SIGNATURE_REPLACEMENT_FORBIDDEN')
  })

  it('parses isFinalExecuted and forwards it to the domain service', async () => {
    mockIdempotencyService.claimOrGet.mockResolvedValueOnce({ status: 'claimed' })
    mockContractUploadService.replacePrimaryDocument.mockResolvedValueOnce({
      id: 'document-2',
      documentKind: 'PRIMARY',
      versionNumber: 2,
      displayName: 'Primary Contract',
      fileName: 'replacement.pdf',
      fileSizeBytes: 3,
      fileMimeType: 'application/pdf',
      createdAt: new Date().toISOString(),
    })

    const response = await POST(createRequest({ isFinalExecuted: 'true' }), {
      params: { contractId: 'contract-1' },
    } as PostContextArg)

    expect(response.status).toBe(200)
    expect(mockContractUploadService.replacePrimaryDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'contract-1',
        isFinalExecuted: true,
      })
    )
  })
})
