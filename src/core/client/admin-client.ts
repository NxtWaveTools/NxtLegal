import { routeRegistry } from '@/core/config/route-registry'
import type { ApiResponse } from '@/core/http/response'

export type AdminRoleOption = {
  roleKey: string
  displayName: string
}

export type AdminUserOption = {
  id: string
  email: string
  fullName: string | null
  isActive: boolean
  roles: string[]
  departmentAssignments: Array<{
    departmentId: string
    departmentName: string
    departmentRole: 'POC' | 'HOD'
  }>
}

export type AdminDepartmentUserGroup = {
  departmentId: string
  departmentName: string
  isDepartmentActive: boolean
  users: Array<{
    id: string
    email: string
    fullName: string | null
    isActive: boolean
    roles: string[]
    departmentRole: 'POC' | 'HOD'
  }>
}

export type AdminDepartmentOption = {
  id: string
  name: string
  isActive: boolean
  pocName: string | null
  hodName: string | null
  hodUserId: string | null
  hodEmail: string | null
  pocUserId: string | null
  pocEmail: string | null
  legalAssignments: Array<{
    userId: string
    email: string
    fullName: string | null
  }>
}

export type RoleChangeRequest = {
  operation: 'grant' | 'revoke'
  roleKey: string
  reason?: string
}

export type DepartmentUpdateRequest = {
  operation: 'rename' | 'deactivate'
  name?: string
  reason?: string
}

export type AssignPrimaryRoleRequest = {
  roleType: 'POC' | 'HOD'
  newEmail: string
  newName: string
  reason?: string
}

export type LegalMatrixRequest = {
  legalUserIds: string[]
  reason?: string
}

export type RoleChangeResponse = {
  roleChange: {
    changed: boolean
    operation: 'grant' | 'revoke'
    roleKey: string
    targetUserId: string
    targetEmail: string
    beforeStateSnapshot: Record<string, unknown>
    afterStateSnapshot: Record<string, unknown>
    oldTokenVersion: number
    newTokenVersion: number
  }
  reauthentication: {
    required: boolean
    message: string | null
  }
}

export type DepartmentMutationResponse = {
  teamId: string
  departmentName: string
  isActive: boolean
  pocName: string | null
  hodName: string | null
  pocEmail: string | null
  hodEmail: string | null
  beforeStateSnapshot: Record<string, unknown>
  afterStateSnapshot: Record<string, unknown>
}

export type PrimaryRoleAssignmentResponse = {
  teamId: string
  roleType: 'POC' | 'HOD'
  previousEmail: string | null
  nextEmail: string
  beforeStateSnapshot: Record<string, unknown>
  afterStateSnapshot: Record<string, unknown>
}

export type SystemConfigurationPayload = {
  featureFlags: {
    enableAdminGovernance: boolean
    enableContractWorkflow: boolean
  }
  securitySessionPolicies: {
    accessTokenDays: number
    refreshTokenDays: number
    maxLoginAttempts: number
  }
  defaults: {
    defaultDepartmentRole: 'POC' | 'HOD'
    defaultUserRole: 'USER' | 'LEGAL_TEAM'
  }
  updatedAt: string | null
  updatedByUserId: string | null
}

export type AdminAuditLogItem = {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    const json = (await response.json()) as
      | ApiResponse<T>
      | {
          ok?: boolean
          data?: T | null
          error?: ApiResponse<never>['error'] | null
          meta?: Record<string, unknown>
        }

    if (typeof json === 'object' && json !== null && 'ok' in json && typeof json.ok === 'boolean') {
      return json as ApiResponse<T>
    }

    if (typeof json === 'object' && json !== null && ('data' in json || 'error' in json)) {
      const error = json.error ?? undefined
      return {
        ok: !error,
        data: json.data ?? undefined,
        error: error ?? undefined,
      }
    }

    return {
      ok: false,
      error: {
        code: 'invalid_api_response',
        message: 'Unexpected response contract from server',
      },
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid_json_response',
        message: 'Unexpected response from server',
      },
    }
  }
}

function resolveUserRolePath(userId: string): string {
  return routeRegistry.api.adminSections.roleManagement.userRoles.replace(':userId', userId)
}

function resolveUserStatusPath(userId: string): string {
  return routeRegistry.api.adminSections.userManagement.userStatus.replace(':userId', userId)
}

function resolveUserDepartmentPath(userId: string): string {
  return routeRegistry.api.adminSections.userManagement.userDepartment.replace(':userId', userId)
}

function resolveTeamDetailPath(teamId: string): string {
  return routeRegistry.api.adminSections.teamManagement.teamDetail.replace(':teamId', teamId)
}

function resolveTeamPrimaryRolePath(teamId: string): string {
  return routeRegistry.api.adminSections.hodPocAssignmentControl.teamPrimaryRole.replace(':teamId', teamId)
}

function resolveTeamLegalMatrixPath(teamId: string): string {
  return routeRegistry.api.adminSections.legalTeamAssignmentMatrix.teamLegalMatrix.replace(':teamId', teamId)
}

export const adminClient = {
  async roles(): Promise<ApiResponse<{ roles: AdminRoleOption[] }>> {
    const response = await fetch(routeRegistry.api.adminSections.roleManagement.roles, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ roles: AdminRoleOption[] }>(response)
  },

  async users(): Promise<ApiResponse<{ users: AdminUserOption[] }>> {
    const response = await fetch(routeRegistry.api.adminSections.userManagement.users, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ users: AdminUserOption[] }>(response)
  },

  async usersByDepartment(): Promise<ApiResponse<{ departments: AdminDepartmentUserGroup[] }>> {
    const response = await fetch(`${routeRegistry.api.adminSections.userManagement.users}?groupBy=department`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ departments: AdminDepartmentUserGroup[] }>(response)
  },

  async createUser(payload: {
    email: string
    fullName?: string
    role: 'USER' | 'LEGAL_TEAM'
    isActive?: boolean
  }): Promise<ApiResponse<{ user: AdminUserOption }>> {
    const response = await fetch(routeRegistry.api.adminSections.userManagement.users, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ user: AdminUserOption }>(response)
  },

  async setUserStatus(userId: string, payload: { isActive: boolean }): Promise<ApiResponse<{ user: AdminUserOption }>> {
    const response = await fetch(resolveUserStatusPath(userId), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ user: AdminUserOption }>(response)
  },

  async assignUserDepartmentRole(
    userId: string,
    payload: { departmentId: string; departmentRole: 'POC' | 'HOD' }
  ): Promise<ApiResponse<{ success: boolean }>> {
    const response = await fetch(resolveUserDepartmentPath(userId), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ success: boolean }>(response)
  },

  async departments(): Promise<ApiResponse<{ departments: AdminDepartmentOption[] }>> {
    const response = await fetch(routeRegistry.api.adminSections.teamManagement.teams, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ departments: AdminDepartmentOption[] }>(response)
  },

  async createDepartment(payload: {
    name: string
    pocEmail: string
    pocName: string
    hodEmail: string
    hodName: string
    reason?: string
  }): Promise<ApiResponse<{ department: DepartmentMutationResponse }>> {
    const response = await fetch(routeRegistry.api.adminSections.teamManagement.teams, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ department: DepartmentMutationResponse }>(response)
  },

  async updateDepartment(
    teamId: string,
    payload: DepartmentUpdateRequest
  ): Promise<ApiResponse<{ department: unknown }>> {
    const response = await fetch(resolveTeamDetailPath(teamId), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ department: unknown }>(response)
  },

  async assignPrimaryRole(
    teamId: string,
    payload: AssignPrimaryRoleRequest
  ): Promise<ApiResponse<{ assignment: PrimaryRoleAssignmentResponse }>> {
    const response = await fetch(resolveTeamPrimaryRolePath(teamId), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ assignment: PrimaryRoleAssignmentResponse }>(response)
  },

  async setLegalMatrix(teamId: string, payload: LegalMatrixRequest): Promise<ApiResponse<{ legalMatrix: unknown }>> {
    const response = await fetch(resolveTeamLegalMatrixPath(teamId), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ legalMatrix: unknown }>(response)
  },

  async changeUserRole(userId: string, payload: RoleChangeRequest): Promise<ApiResponse<RoleChangeResponse>> {
    const response = await fetch(resolveUserRolePath(userId), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<RoleChangeResponse>(response)
  },

  async systemConfiguration(): Promise<ApiResponse<{ config: SystemConfigurationPayload }>> {
    const response = await fetch(routeRegistry.api.adminSections.systemConfiguration.config, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ config: SystemConfigurationPayload }>(response)
  },

  async updateSystemConfiguration(payload: {
    featureFlags: {
      enableAdminGovernance: boolean
      enableContractWorkflow: boolean
    }
    securitySessionPolicies: {
      accessTokenDays: number
      refreshTokenDays: number
      maxLoginAttempts: number
    }
    defaults: {
      defaultDepartmentRole: 'POC' | 'HOD'
      defaultUserRole: 'USER' | 'LEGAL_TEAM'
    }
    reason?: string
  }): Promise<ApiResponse<{ config: SystemConfigurationPayload }>> {
    const response = await fetch(routeRegistry.api.adminSections.systemConfiguration.config, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ config: SystemConfigurationPayload }>(response)
  },

  async auditLogs(params?: {
    action?: string
    resourceType?: string
    userId?: string
    query?: string
    from?: string
    to?: string
    cursor?: string
    limit?: number
  }): Promise<ApiResponse<{ logs: AdminAuditLogItem[] }>> {
    const searchParams = new URLSearchParams()

    if (params?.action) searchParams.set('action', params.action)
    if (params?.resourceType) searchParams.set('resourceType', params.resourceType)
    if (params?.userId) searchParams.set('userId', params.userId)
    if (params?.query) searchParams.set('query', params.query)
    if (params?.from) searchParams.set('from', params.from)
    if (params?.to) searchParams.set('to', params.to)
    if (params?.cursor) searchParams.set('cursor', params.cursor)
    if (typeof params?.limit === 'number') searchParams.set('limit', String(params.limit))

    const path = `${routeRegistry.api.adminSections.auditLogsViewer.logs}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ logs: AdminAuditLogItem[] }>(response)
  },

  buildAuditExportUrl(params?: {
    action?: string
    resourceType?: string
    userId?: string
    query?: string
    from?: string
    to?: string
    limit?: number
  }): string {
    const searchParams = new URLSearchParams()

    if (params?.action) searchParams.set('action', params.action)
    if (params?.resourceType) searchParams.set('resourceType', params.resourceType)
    if (params?.userId) searchParams.set('userId', params.userId)
    if (params?.query) searchParams.set('query', params.query)
    if (params?.from) searchParams.set('from', params.from)
    if (params?.to) searchParams.set('to', params.to)
    if (typeof params?.limit === 'number') searchParams.set('limit', String(params.limit))

    return `${routeRegistry.api.adminSections.auditLogsViewer.export}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  },
}
