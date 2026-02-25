const mockSession = {
  employeeId: 'admin-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'SUPER_ADMIN',
  email: 'admin@nxtwave.co.in',
  fullName: 'Admin User',
}

const mockAuditViewerService = {
  listLogs: jest.fn(),
}

type MockRequest = {
  nextUrl?: {
    searchParams: URLSearchParams
  }
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
  getAuditViewerService: () => mockAuditViewerService,
}))

jest.mock('@/core/config/app-config', () => ({
  appConfig: {
    features: {
      enableAdminGovernance: true,
    },
  },
}))

import { GET } from '@/app/api/admin/audit-logs-viewer/export/route'

type GetRequestArg = Parameters<typeof GET>[0]

describe('Admin audit logs export route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns csv export response', async () => {
    mockAuditViewerService.listLogs.mockResolvedValueOnce({
      items: [
        {
          id: 'log-1',
          userId: 'admin-user-id',
          action: 'admin.system_configuration.updated',
          resourceType: 'system_configuration',
          resourceId: 'tenant',
          changes: {},
          metadata: {},
          createdAt: '2026-02-24T00:00:00.000Z',
        },
      ],
      cursor: null,
      limit: 1000,
      total: 1,
    })

    const response = await GET({
      nextUrl: {
        searchParams: new URLSearchParams('limit=1000'),
      },
    } as unknown as GetRequestArg)

    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(body).toContain('id,createdAt,userId,action,resourceType,resourceId,changes,metadata')
  })
})
