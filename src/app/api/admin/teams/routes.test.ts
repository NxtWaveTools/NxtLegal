import { AuthorizationError } from '@/core/http/errors'

const mockSession = {
  employeeId: 'admin-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'SUPER_ADMIN',
  email: 'admin@nxtwave.co.in',
  fullName: 'Admin User',
}

const mockTeamGovernanceService = {
  listDepartments: jest.fn(),
  createDepartment: jest.fn(),
  updateDepartment: jest.fn(),
  assignPrimaryRole: jest.fn(),
  setLegalMatrix: jest.fn(),
}

type MockRequest = {
  json?: () => Promise<unknown>
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
  getTeamGovernanceService: () => mockTeamGovernanceService,
}))

jest.mock('@/core/config/app-config', () => ({
  appConfig: {
    features: {
      enableAdminGovernance: true,
    },
  },
}))

import { appConfig } from '@/core/config/app-config'
import { GET, POST } from '@/app/api/admin/teams/route'
import { PATCH } from '@/app/api/admin/teams/[teamId]/route'
import { PUT as PUTPrimaryRole } from '@/app/api/admin/teams/[teamId]/primary-role/route'
import { PUT as PUTLegalMatrix } from '@/app/api/admin/teams/[teamId]/legal-matrix/route'

type GetRequestArg = Parameters<typeof GET>[0]
type PostRequestArg = Parameters<typeof POST>[0]
type PostContextArg = Parameters<typeof POST>[1]
type PatchRequestArg = Parameters<typeof PATCH>[0]
type PatchContextArg = Parameters<typeof PATCH>[1]
type PutPrimaryRequestArg = Parameters<typeof PUTPrimaryRole>[0]
type PutPrimaryContextArg = Parameters<typeof PUTPrimaryRole>[1]
type PutLegalMatrixRequestArg = Parameters<typeof PUTLegalMatrix>[0]
type PutLegalMatrixContextArg = Parameters<typeof PUTLegalMatrix>[1]

describe('Admin team API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(appConfig.features as { enableAdminGovernance: boolean }).enableAdminGovernance = true
  })

  it('returns departments for GET /api/admin/teams', async () => {
    mockTeamGovernanceService.listDepartments.mockResolvedValueOnce([
      {
        id: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513',
        name: 'Finance',
        isActive: true,
        hodUserId: null,
        hodEmail: null,
        pocUserId: null,
        pocEmail: null,
        legalAssignments: [],
      },
    ])

    const response = await GET({} as unknown as GetRequestArg)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockTeamGovernanceService.listDepartments).toHaveBeenCalledWith(mockSession)
  })

  it('returns validation error for invalid POST /api/admin/teams payload', async () => {
    const response = await POST(
      {
        json: async () => ({ name: 'A' }),
      } as unknown as PostRequestArg,
      {} as PostContextArg
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(mockTeamGovernanceService.createDepartment).not.toHaveBeenCalled()
  })

  it('creates department for valid POST /api/admin/teams payload', async () => {
    mockTeamGovernanceService.createDepartment.mockResolvedValueOnce({
      teamId: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513',
      departmentName: 'Finance',
      isActive: true,
      beforeStateSnapshot: {},
      afterStateSnapshot: {},
    })

    const response = await POST(
      {
        json: async () => ({ name: 'Finance', reason: 'Initial setup' }),
      } as unknown as PostRequestArg,
      {} as PostContextArg
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockTeamGovernanceService.createDepartment).toHaveBeenCalledWith({
      session: mockSession,
      name: 'Finance',
      reason: 'Initial setup',
    })
  })

  it('returns app error for PATCH /api/admin/teams/[teamId]', async () => {
    mockTeamGovernanceService.updateDepartment.mockRejectedValueOnce(
      new AuthorizationError('FORBIDDEN_TEAM_GOVERNANCE', 'Denied')
    )

    const response = await PATCH(
      {
        json: async () => ({ operation: 'rename', name: 'Legal Ops' }),
      } as unknown as PatchRequestArg,
      { params: { teamId: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513' } } as PatchContextArg
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN_TEAM_GOVERNANCE')
  })

  it('assigns primary role for PUT /api/admin/teams/[teamId]/primary-role', async () => {
    mockTeamGovernanceService.assignPrimaryRole.mockResolvedValueOnce({
      teamId: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513',
      roleType: 'POC',
      previousUserId: null,
      nextUserId: '0f4cda17-cf11-43a8-a432-5d354803df7e',
      affectedContracts: 0,
      beforeStateSnapshot: {},
      afterStateSnapshot: {},
    })

    const response = await PUTPrimaryRole(
      {
        json: async () => ({
          roleType: 'POC',
          userId: '0f4cda17-cf11-43a8-a432-5d354803df7e',
          reason: 'Ownership transfer',
        }),
      } as unknown as PutPrimaryRequestArg,
      { params: { teamId: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513' } } as PutPrimaryContextArg
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockTeamGovernanceService.assignPrimaryRole).toHaveBeenCalledWith({
      session: mockSession,
      teamId: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513',
      roleType: 'POC',
      userId: '0f4cda17-cf11-43a8-a432-5d354803df7e',
      reason: 'Ownership transfer',
    })
  })

  it('returns validation error for invalid PUT /api/admin/teams/[teamId]/legal-matrix payload', async () => {
    const response = await PUTLegalMatrix(
      {
        json: async () => ({ legalUserIds: ['not-a-uuid'] }),
      } as unknown as PutLegalMatrixRequestArg,
      { params: { teamId: '6bc8d6e8-51b5-4a5f-9f57-5168b3729513' } } as PutLegalMatrixContextArg
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(mockTeamGovernanceService.setLegalMatrix).not.toHaveBeenCalled()
  })

  it('returns feature disabled when admin governance flag is off', async () => {
    ;(appConfig.features as { enableAdminGovernance: boolean }).enableAdminGovernance = false

    const response = await GET({} as unknown as GetRequestArg)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('FEATURE_DISABLED')
  })
})
