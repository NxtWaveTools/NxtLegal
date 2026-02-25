const mockSession = {
  employeeId: 'admin-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'SUPER_ADMIN',
  email: 'admin@nxtwave.co.in',
  fullName: 'Admin User',
}

const mockSystemConfigurationService = {
  getConfiguration: jest.fn(),
  updateConfiguration: jest.fn(),
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
  getSystemConfigurationService: () => mockSystemConfigurationService,
}))

jest.mock('@/core/config/app-config', () => ({
  appConfig: {
    features: {
      enableAdminGovernance: true,
      enableContractWorkflow: true,
    },
  },
}))

import { appConfig } from '@/core/config/app-config'
import { GET, PATCH } from '@/app/api/admin/system-configuration/route'

type GetRequestArg = Parameters<typeof GET>[0]
type PatchRequestArg = Parameters<typeof PATCH>[0]
type PatchContextArg = Parameters<typeof PATCH>[1]

describe('Admin system configuration API route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(appConfig.features as { enableAdminGovernance: boolean }).enableAdminGovernance = true
  })

  it('returns configuration for GET /api/admin/system-configuration', async () => {
    mockSystemConfigurationService.getConfiguration.mockResolvedValueOnce({
      featureFlags: {
        enableAdminGovernance: true,
        enableContractWorkflow: true,
      },
      securitySessionPolicies: {
        accessTokenDays: 2,
        refreshTokenDays: 7,
        maxLoginAttempts: 5,
      },
      defaults: {
        defaultDepartmentRole: 'POC',
        defaultUserRole: 'LEGAL_TEAM',
      },
      updatedAt: null,
      updatedByUserId: null,
    })

    const response = await GET({} as unknown as GetRequestArg)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockSystemConfigurationService.getConfiguration).toHaveBeenCalledWith(mockSession)
  })

  it('updates configuration for PATCH /api/admin/system-configuration', async () => {
    mockSystemConfigurationService.updateConfiguration.mockResolvedValueOnce({
      featureFlags: {
        enableAdminGovernance: true,
        enableContractWorkflow: true,
      },
      securitySessionPolicies: {
        accessTokenDays: 3,
        refreshTokenDays: 10,
        maxLoginAttempts: 6,
      },
      defaults: {
        defaultDepartmentRole: 'HOD',
        defaultUserRole: 'USER',
      },
      updatedAt: '2026-02-24T00:00:00.000Z',
      updatedByUserId: 'admin-user-id',
    })

    const response = await PATCH(
      {
        json: async () => ({
          featureFlags: {
            enableAdminGovernance: true,
            enableContractWorkflow: true,
          },
          securitySessionPolicies: {
            accessTokenDays: 3,
            refreshTokenDays: 10,
            maxLoginAttempts: 6,
          },
          defaults: {
            defaultDepartmentRole: 'HOD',
            defaultUserRole: 'USER',
          },
          reason: 'Security hardening',
        }),
      } as unknown as PatchRequestArg,
      {} as PatchContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockSystemConfigurationService.updateConfiguration).toHaveBeenCalledWith({
      session: mockSession,
      config: {
        featureFlags: {
          enableAdminGovernance: true,
          enableContractWorkflow: true,
        },
        securitySessionPolicies: {
          accessTokenDays: 3,
          refreshTokenDays: 10,
          maxLoginAttempts: 6,
        },
        defaults: {
          defaultDepartmentRole: 'HOD',
          defaultUserRole: 'USER',
        },
      },
      reason: 'Security hardening',
    })
  })

  it('returns validation error for invalid PATCH payload', async () => {
    const response = await PATCH(
      {
        json: async () => ({
          featureFlags: { enableAdminGovernance: true, enableContractWorkflow: true },
          securitySessionPolicies: { accessTokenDays: 0, refreshTokenDays: 10, maxLoginAttempts: 6 },
          defaults: { defaultDepartmentRole: 'POC', defaultUserRole: 'LEGAL_TEAM' },
        }),
      } as unknown as PatchRequestArg,
      {} as PatchContextArg
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(mockSystemConfigurationService.updateConfiguration).not.toHaveBeenCalled()
  })
})
