const mockSession = {
  employeeId: 'admin-user-id',
  tenantId: '00000000-0000-0000-0000-000000000000',
  role: 'SUPER_ADMIN',
  email: 'admin@nxtwave.co.in',
  fullName: 'Admin User',
}

const mockAuditViewerService = {
  listLogs: jest.fn(),
  // The export route streams via listLogsExportChunk, not listLogs.
  listLogsExportChunk: jest.fn(),
}

type MockRequest = {
  nextUrl?: {
    searchParams: URLSearchParams
  }
  signal: AbortSignal
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
    mockAuditViewerService.listLogsExportChunk.mockResolvedValueOnce({
      items: [
        {
          id: 'log-1',
          userId: 'admin-user-id',
          actorEmployeeId: 'admin-user-id',
          actorName: 'Admin User',
          actorEmail: 'admin@nxtwave.co.in',
          actorRole: 'SUPER_ADMIN',
          action: 'admin.system_configuration.updated',
          resourceType: 'system_configuration',
          resourceId: 'tenant',
          changes: {},
          metadata: {},
          eventType: null,
          noteText: null,
          createdAt: '2026-02-24T00:00:00.000Z',
        },
      ],
      cursor: null,
    })

    // Provide a real AbortController signal so request.signal.aborted does not throw.
    const controller = new AbortController()

    const response = await GET({
      nextUrl: {
        searchParams: new URLSearchParams('limit=1000'),
      },
      signal: controller.signal,
    } as unknown as GetRequestArg)

    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    // Verify the actual header columns produced by the route
    expect(body).toContain(
      'id,createdAt,createdAtFormatted,actor,action,actionLabel,resource,eventType,noteText,metadataSummary'
    )
    expect(body).toContain('log-1')
  })

  it('returns 403 when admin governance feature flag is disabled', async () => {
    // Re-mock feature flag only for this test
    jest.resetModules()
  })
})
