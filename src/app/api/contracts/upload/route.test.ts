const mockSession = {
  employeeId: 'employee-1',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'POC',
  email: 'poc@nxtwave.co.in',
  fullName: 'POC User',
}

const mockIdempotencyService = {
  claimOrGet: jest.fn(),
  store: jest.fn(),
  releaseClaim: jest.fn(),
}

const mockContractUploadService = {
  uploadContract: jest.fn(),
}

const mockContractApprovalNotificationService = {
  notifyHodOnContractUpload: jest.fn(),
}

type MockRequest = {
  headers: {
    get: (name: string) => string | null
  }
  formData: () => Promise<FormDataLike>
}

type MockContext = {
  params?: Record<string, string>
}

type MockAuthHandler = (
  request: MockRequest,
  context: { session: typeof mockSession; params?: Record<string, string> }
) => unknown

type FormDataLike = {
  get: (key: string) => unknown
  getAll: (key: string) => unknown[]
}

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
  getIdempotencyService: () => mockIdempotencyService,
  getContractUploadService: () => mockContractUploadService,
  getContractApprovalNotificationService: () => mockContractApprovalNotificationService,
}))

import { POST } from '@/app/api/contracts/upload/route'

type PostRequestArg = Parameters<typeof POST>[0]

describe('Contracts upload route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIdempotencyService.claimOrGet.mockResolvedValue({ status: 'claimed' })
  })

  it('rejects out-of-range supporting file indices before idempotency claim', async () => {
    const mainFile = new File([new Uint8Array([1, 2, 3])], 'contract.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const supportingFile = new File([new Uint8Array([4, 5, 6])], 'supporting.pdf', {
      type: 'application/pdf',
    })

    const formData: FormDataLike = {
      get: (key: string) => {
        const values: Record<string, unknown> = {
          title: 'Master Service Agreement',
          contractTypeId: '11111111-1111-1111-1111-111111111111',
          departmentId: '22222222-2222-2222-2222-222222222222',
          counterparties: JSON.stringify([
            {
              counterpartyName: 'Acme Inc',
              backgroundOfRequest: 'Need legal review',
              budgetApproved: false,
              signatories: [{ name: 'Vendor Signatory', designation: 'Director', email: 'vendor@example.com' }],
              supportingFileIndices: [1],
            },
          ]),
          file: mainFile,
        }

        return values[key] ?? null
      },
      getAll: (key: string) => {
        if (key === 'supportingFiles') {
          return [supportingFile]
        }
        return []
      },
    }

    const response = await POST({
      headers: {
        get: (name: string) => (name === 'Idempotency-Key' ? 'idem-123' : null),
      },
      formData: async () => formData,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('out of range')
    expect(mockIdempotencyService.claimOrGet).not.toHaveBeenCalled()
    expect(mockContractUploadService.uploadContract).not.toHaveBeenCalled()
  })

  it('accepts NA as a valid signatory email', async () => {
    const mainFile = new File([new Uint8Array([1, 2, 3])], 'contract.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const supportingFile = new File([new Uint8Array([4, 5, 6])], 'supporting.pdf', {
      type: 'application/pdf',
    })

    const uploadedContract = {
      id: 'contract-1',
      title: 'Master Service Agreement',
      status: 'HOD_PENDING',
      currentAssigneeEmployeeId: 'hod-1',
      currentAssigneeEmail: 'hod@nxtwave.co.in',
      fileName: 'contract.docx',
      fileSizeBytes: 1024,
    }

    mockContractUploadService.uploadContract.mockResolvedValue(uploadedContract)
    mockContractApprovalNotificationService.notifyHodOnContractUpload.mockResolvedValue(undefined)

    const formData: FormDataLike = {
      get: (key: string) => {
        const values: Record<string, unknown> = {
          title: 'Master Service Agreement',
          contractTypeId: '11111111-1111-1111-1111-111111111111',
          departmentId: '22222222-2222-2222-2222-222222222222',
          counterparties: JSON.stringify([
            {
              counterpartyName: 'Acme Inc',
              backgroundOfRequest: 'Need legal review',
              budgetApproved: false,
              signatories: [{ name: 'Vendor Signatory', designation: 'Director', email: 'NA' }],
              supportingFileIndices: [0],
            },
          ]),
          file: mainFile,
        }

        return values[key] ?? null
      },
      getAll: (key: string) => {
        if (key === 'supportingFiles') {
          return [supportingFile]
        }
        return []
      },
    }

    const response = await POST({
      headers: {
        get: (name: string) => (name === 'Idempotency-Key' ? 'idem-123' : null),
      },
      formData: async () => formData,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(mockContractUploadService.uploadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        signatoryEmail: 'na',
      })
    )
  })

  it('allows NA counterparty without signatories', async () => {
    const mainFile = new File([new Uint8Array([1, 2, 3])], 'contract.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const uploadedContract = {
      id: 'contract-1',
      title: 'Master Service Agreement',
      status: 'HOD_PENDING',
      currentAssigneeEmployeeId: 'hod-1',
      currentAssigneeEmail: 'hod@nxtwave.co.in',
      fileName: 'contract.docx',
      fileSizeBytes: 1024,
    }

    mockContractUploadService.uploadContract.mockResolvedValue(uploadedContract)
    mockContractApprovalNotificationService.notifyHodOnContractUpload.mockResolvedValue(undefined)

    const formData: FormDataLike = {
      get: (key: string) => {
        const values: Record<string, unknown> = {
          title: 'Master Service Agreement',
          contractTypeId: '11111111-1111-1111-1111-111111111111',
          departmentId: '22222222-2222-2222-2222-222222222222',
          counterparties: JSON.stringify([
            {
              counterpartyName: 'NA',
              backgroundOfRequest: '',
              budgetApproved: false,
              signatories: [],
              supportingFileIndices: [],
            },
          ]),
          file: mainFile,
        }

        return values[key] ?? null
      },
      getAll: () => [],
    }

    const response = await POST({
      headers: {
        get: (name: string) => (name === 'Idempotency-Key' ? 'idem-123' : null),
      },
      formData: async () => formData,
    } as unknown as PostRequestArg)

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(mockContractUploadService.uploadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        signatoryName: 'NA',
        signatoryDesignation: 'NA',
        signatoryEmail: 'NA',
        counterparties: expect.arrayContaining([
          expect.objectContaining({
            counterpartyName: 'NA',
            signatories: [],
            supportingFiles: [],
          }),
        ]),
      })
    )
  })
})
