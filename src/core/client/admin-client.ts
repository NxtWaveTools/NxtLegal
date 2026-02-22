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
  roles: string[]
}

export type AdminDepartmentOption = {
  id: string
  name: string
  isActive: boolean
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
  userId: string
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

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>
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
  return routeRegistry.api.admin.userRoles.replace(':userId', userId)
}

function resolveTeamDetailPath(teamId: string): string {
  return routeRegistry.api.admin.teamDetail.replace(':teamId', teamId)
}

function resolveTeamPrimaryRolePath(teamId: string): string {
  return routeRegistry.api.admin.teamPrimaryRole.replace(':teamId', teamId)
}

function resolveTeamLegalMatrixPath(teamId: string): string {
  return routeRegistry.api.admin.teamLegalMatrix.replace(':teamId', teamId)
}

export const adminClient = {
  async roles(): Promise<ApiResponse<{ roles: AdminRoleOption[] }>> {
    const response = await fetch(routeRegistry.api.admin.roles, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ roles: AdminRoleOption[] }>(response)
  },

  async users(): Promise<ApiResponse<{ users: AdminUserOption[] }>> {
    const response = await fetch(routeRegistry.api.admin.users, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ users: AdminUserOption[] }>(response)
  },

  async departments(): Promise<ApiResponse<{ departments: AdminDepartmentOption[] }>> {
    const response = await fetch(routeRegistry.api.admin.teams, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })

    return parseApiResponse<{ departments: AdminDepartmentOption[] }>(response)
  },

  async createDepartment(payload: { name: string; reason?: string }): Promise<ApiResponse<{ department: unknown }>> {
    const response = await fetch(routeRegistry.api.admin.teams, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ department: unknown }>(response)
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
  ): Promise<ApiResponse<{ assignment: unknown }>> {
    const response = await fetch(resolveTeamPrimaryRolePath(teamId), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return parseApiResponse<{ assignment: unknown }>(response)
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
}
