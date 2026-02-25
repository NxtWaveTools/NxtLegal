import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { logger } from '@/core/infra/logging/logger'
import { ExternalServiceError } from '@/core/http/errors'
import type {
  EmployeeByEmail,
  EmployeeLookup,
  EmployeeRecord,
  EmployeeRepository,
  EmployeeFilters,
} from '@/core/domain/users/employee-repository'

class SupabaseEmployeeRepository implements EmployeeRepository {
  private readonly adminCompatibilityRoles = new Set(['ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN'])

  private readonly passthroughRoles = new Set(['LEGAL_TEAM'])

  private readonly canonicalRolePrecedence = [
    'SUPER_ADMIN',
    'LEGAL_ADMIN',
    'ADMIN',
    'LEGAL_TEAM',
    'HOD',
    'POC',
    'USER',
  ] as const

  private readonly selectWithTeamRelation =
    'id, tenant_id, email, full_name, team_id, team_name:teams(name), is_active, password_hash, role, token_version, created_at, updated_at, deleted_at'

  private readonly selectWithoutTeamRelation =
    'id, tenant_id, email, full_name, is_active, password_hash, role, token_version, created_at, updated_at, deleted_at'

  private readonly selectWithoutTeamRelationLegacy =
    'id, tenant_id, email, full_name, is_active, password_hash, role, created_at, updated_at, deleted_at'

  private isSupabaseTransportError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    if (error.message.toLowerCase().includes('fetch failed')) {
      return true
    }

    const cause = (error as Error & { cause?: unknown }).cause
    if (cause && typeof cause === 'object' && 'code' in cause) {
      const code = String((cause as { code?: unknown }).code).toUpperCase()
      return ['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'].includes(code)
    }

    return false
  }

  private isSupabasePostgrestTransportError(error: { message?: string; details?: string } | null | undefined): boolean {
    const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
    return message.includes('fetch failed') || message.includes('network') || message.includes('timed out')
  }

  private isSchemaDriftError(error: { message?: string; details?: string } | null | undefined): boolean {
    const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
    return (
      message.includes("could not find a relationship between 'users' and 'teams'") ||
      message.includes('column users.team_id does not exist') ||
      message.includes('column "team_id" does not exist')
    )
  }

  private isMissingTokenVersionError(error: { message?: string; details?: string } | null | undefined): boolean {
    const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
    return (
      message.includes('column users.token_version does not exist') ||
      message.includes('column "token_version" does not exist')
    )
  }

  private mapEmployeeWithoutTeam(data: {
    id: string
    tenant_id: string
    email: string
    full_name: string | null
    is_active: boolean
    password_hash?: string | null
    role: string
    token_version: number | null
    created_at: string
    updated_at: string
    deleted_at: string | null
  }): EmployeeRecord {
    return {
      id: data.id,
      employeeId: data.id,
      tenantId: data.tenant_id,
      email: data.email,
      fullName: data.full_name,
      teamId: null,
      teamName: null,
      isActive: data.is_active,
      passwordHash: data.password_hash,
      role: data.role,
      tokenVersion: data.token_version ?? 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    }
  }

  private mapEmployeeWithoutTeamLegacy(data: {
    id: string
    tenant_id: string
    email: string
    full_name: string | null
    is_active: boolean
    password_hash?: string | null
    role: string
    created_at: string
    updated_at: string
    deleted_at: string | null
  }): EmployeeRecord {
    return {
      id: data.id,
      employeeId: data.id,
      tenantId: data.tenant_id,
      email: data.email,
      fullName: data.full_name,
      teamId: null,
      teamName: null,
      isActive: data.is_active,
      passwordHash: data.password_hash,
      role: data.role,
      tokenVersion: 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    }
  }

  private selectHighestPrecedenceRole(roleSet: Set<string>): string | null {
    for (const role of this.canonicalRolePrecedence) {
      if (roleSet.has(role)) {
        return role
      }
    }

    const firstRole = roleSet.values().next().value
    return typeof firstRole === 'string' ? firstRole : null
  }

  private async resolveCanonicalUserRole(params: {
    tenantId: string
    userId: string
    supabase: ReturnType<typeof createServiceSupabase>
  }): Promise<string | null> {
    const { data, error } = await params.supabase
      .from('user_roles')
      .select('roles:role_id(role_key)')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', params.userId)
      .is('deleted_at', null)

    if (error) {
      logger.warn('Failed to resolve canonical user role from user_roles/roles', {
        tenantId: params.tenantId,
        userId: params.userId,
        error: error.message,
      })
      return null
    }

    const canonicalRoles = new Set<string>()
    for (const row of data ?? []) {
      const relation = row.roles as { role_key?: string } | Array<{ role_key?: string }> | null
      const roleEntries = Array.isArray(relation) ? relation : relation ? [relation] : []
      for (const roleEntry of roleEntries) {
        const roleKey = roleEntry.role_key?.trim().toUpperCase()
        if (roleKey) {
          canonicalRoles.add(roleKey)
        }
      }
    }

    return this.selectHighestPrecedenceRole(canonicalRoles)
  }

  private async resolveEffectiveRole(params: {
    tenantId: string
    userId: string
    userEmail: string
    currentRole: string
    supabase: ReturnType<typeof createServiceSupabase>
  }): Promise<string> {
    const normalizedCurrentRole = params.currentRole.trim().toUpperCase()

    const canonicalRole = await this.resolveCanonicalUserRole({
      tenantId: params.tenantId,
      userId: params.userId,
      supabase: params.supabase,
    })

    if (canonicalRole) {
      return canonicalRole
    }

    if (this.adminCompatibilityRoles.has(normalizedCurrentRole) || this.passthroughRoles.has(normalizedCurrentRole)) {
      return normalizedCurrentRole
    }

    const { data, error } = await params.supabase
      .from('team_role_mappings')
      .select('role_type')
      .eq('tenant_id', params.tenantId)
      .eq('email', params.userEmail.trim().toLowerCase())
      .eq('active_flag', true)
      .is('deleted_at', null)

    if (error) {
      logger.warn('Failed to resolve effective role from team_role_mappings', {
        tenantId: params.tenantId,
        userEmail: params.userEmail,
        error: error.message,
      })
      return normalizedCurrentRole === 'HOD' || normalizedCurrentRole === 'POC' ? 'USER' : normalizedCurrentRole
    }

    const roleSet = new Set<string>((data ?? []).map((row) => row.role_type))
    if (roleSet.has('HOD')) {
      return 'HOD'
    }

    if (roleSet.has('POC')) {
      return 'POC'
    }

    return normalizedCurrentRole === 'HOD' || normalizedCurrentRole === 'POC' ? 'USER' : normalizedCurrentRole
  }

  private resolveTeamName(
    team: { name: string | null } | Array<{ name: string | null }> | null | undefined
  ): string | null {
    if (!team) {
      return null
    }

    if (Array.isArray(team)) {
      return team[0]?.name ?? null
    }

    return team.name ?? null
  }

  private mapEmployee(data: {
    id: string
    tenant_id: string
    email: string
    full_name: string | null
    team_id: string | null
    team_name?: { name: string | null } | Array<{ name: string | null }> | null
    is_active: boolean
    password_hash?: string | null
    role: string
    token_version: number | null
    created_at: string
    updated_at: string
    deleted_at: string | null
  }): EmployeeRecord {
    return {
      id: data.id,
      employeeId: data.id,
      tenantId: data.tenant_id,
      email: data.email,
      fullName: data.full_name,
      teamId: data.team_id,
      teamName: this.resolveTeamName(data.team_name),
      isActive: data.is_active,
      passwordHash: data.password_hash,
      role: data.role,
      tokenVersion: data.token_version ?? 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    }
  }

  async findByEmployeeId({ employeeId, tenantId }: EmployeeLookup): Promise<EmployeeRecord | null> {
    try {
      logger.debug('Looking up user by ID', { employeeId, tenantId })

      const supabase = createServiceSupabase()
      const { data, error } = await supabase
        .from('users')
        .select(this.selectWithTeamRelation)
        .eq('id', employeeId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single()

      if (error) {
        if (this.isSupabasePostgrestTransportError(error)) {
          throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
            operation: 'findByEmployeeId',
            tenantId,
          })
        }

        if (this.isMissingTokenVersionError(error)) {
          const { data: legacyData, error: legacyError } = await supabase
            .from('users')
            .select(this.selectWithoutTeamRelationLegacy)
            .eq('id', employeeId)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single()

          if (legacyError) {
            if (this.isSupabasePostgrestTransportError(legacyError)) {
              throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
                operation: 'findByEmployeeIdLegacyFallback',
                tenantId,
              })
            }
            if (legacyError.code === 'PGRST116') {
              logger.debug('User not found in tenant (legacy token version fallback)', { employeeId, tenantId })
              return null
            }
            logger.error('User lookup by ID failed (legacy token version fallback)', {
              employeeId,
              tenantId,
              error: legacyError.message,
              errorCode: legacyError.code,
            })
            return null
          }

          const effectiveRole = await this.resolveEffectiveRole({
            tenantId,
            userId: legacyData.id,
            userEmail: legacyData.email,
            currentRole: legacyData.role,
            supabase,
          })

          logger.debug('User lookup by ID used legacy token version fallback', {
            employeeId,
            tenantId,
            role: effectiveRole,
          })
          return legacyData ? this.mapEmployeeWithoutTeamLegacy({ ...legacyData, role: effectiveRole }) : null
        }

        if (this.isSchemaDriftError(error)) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('users')
            .select(this.selectWithoutTeamRelation)
            .eq('id', employeeId)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single()

          if (fallbackError) {
            if (this.isSupabasePostgrestTransportError(fallbackError)) {
              throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
                operation: 'findByEmployeeIdSchemaFallback',
                tenantId,
              })
            }

            if (this.isMissingTokenVersionError(fallbackError)) {
              const { data: legacyData, error: legacyError } = await supabase
                .from('users')
                .select(this.selectWithoutTeamRelationLegacy)
                .eq('id', employeeId)
                .eq('tenant_id', tenantId)
                .is('deleted_at', null)
                .single()

              if (legacyError) {
                if (this.isSupabasePostgrestTransportError(legacyError)) {
                  throw new ExternalServiceError(
                    'supabase',
                    'Authentication service temporarily unavailable',
                    undefined,
                    {
                      operation: 'findByEmployeeIdSchemaLegacyFallback',
                      tenantId,
                    }
                  )
                }
                if (legacyError.code === 'PGRST116') {
                  logger.debug('User not found in tenant (legacy token version fallback after schema drift)', {
                    employeeId,
                    tenantId,
                  })
                  return null
                }
                logger.error('User lookup by ID failed (legacy token version fallback after schema drift)', {
                  employeeId,
                  tenantId,
                  error: legacyError.message,
                  errorCode: legacyError.code,
                })
                return null
              }

              const effectiveRole = await this.resolveEffectiveRole({
                tenantId,
                userId: legacyData.id,
                userEmail: legacyData.email,
                currentRole: legacyData.role,
                supabase,
              })

              logger.debug('User lookup by ID used legacy token version fallback after schema drift', {
                employeeId,
                tenantId,
                role: effectiveRole,
              })
              return legacyData ? this.mapEmployeeWithoutTeamLegacy({ ...legacyData, role: effectiveRole }) : null
            }

            if (fallbackError.code === 'PGRST116') {
              logger.debug('User not found in tenant', { employeeId, tenantId })
              return null
            }
            logger.error('User lookup by ID failed (fallback query)', {
              employeeId,
              tenantId,
              error: fallbackError.message,
              errorCode: fallbackError.code,
            })
            return null
          }

          const effectiveRole = await this.resolveEffectiveRole({
            tenantId,
            userId: fallbackData.id,
            userEmail: fallbackData.email,
            currentRole: fallbackData.role,
            supabase,
          })

          logger.debug('User lookup by ID used schema-drift fallback (no team relation)', {
            employeeId,
            tenantId,
            role: effectiveRole,
          })

          return fallbackData ? this.mapEmployeeWithoutTeam({ ...fallbackData, role: effectiveRole }) : null
        }

        if (error.code === 'PGRST116') {
          logger.debug('User not found in tenant', { employeeId, tenantId })
          return null
        }
        logger.error('User lookup by ID failed', {
          employeeId,
          tenantId,
          error: error.message,
          errorCode: error.code,
        })
        return null
      }

      const effectiveRole = await this.resolveEffectiveRole({
        tenantId,
        userId: data.id,
        userEmail: data.email,
        currentRole: data.role,
        supabase,
      })

      logger.debug('User found', {
        employeeId,
        tenantId,
        hasPassword: !!data.password_hash,
        isActive: data.is_active,
        role: effectiveRole,
      })
      return data ? this.mapEmployee({ ...data, role: effectiveRole }) : null
    } catch (error) {
      if (this.isSupabaseTransportError(error)) {
        throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
          operation: 'findByEmployeeId',
          tenantId,
        })
      }
      logger.error('User lookup by ID threw error', { employeeId, tenantId, error: String(error) })
      return null
    }
  }

  async findByEmail({ email, tenantId }: EmployeeByEmail): Promise<EmployeeRecord | null> {
    try {
      const supabase = createServiceSupabase()
      const { data, error } = await supabase
        .from('users')
        .select(this.selectWithTeamRelation)
        .eq('email', email)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single()

      if (error) {
        if (this.isSupabasePostgrestTransportError(error)) {
          throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
            operation: 'findByEmail',
            tenantId,
          })
        }

        if (this.isMissingTokenVersionError(error)) {
          const { data: legacyData, error: legacyError } = await supabase
            .from('users')
            .select(this.selectWithoutTeamRelationLegacy)
            .eq('email', email)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single()

          if (legacyError) {
            if (this.isSupabasePostgrestTransportError(legacyError)) {
              throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
                operation: 'findByEmailLegacyFallback',
                tenantId,
              })
            }
            if (legacyError.code === 'PGRST116') {
              return null
            }
            logger.error('Employee lookup by email failed (legacy token version fallback)', {
              email,
              tenantId,
              error: legacyError.message,
            })
            return null
          }

          const effectiveRole = await this.resolveEffectiveRole({
            tenantId,
            userId: legacyData.id,
            userEmail: legacyData.email,
            currentRole: legacyData.role,
            supabase,
          })

          logger.debug('Employee lookup by email used legacy token version fallback', {
            email,
            tenantId,
            role: effectiveRole,
          })
          return legacyData ? this.mapEmployeeWithoutTeamLegacy({ ...legacyData, role: effectiveRole }) : null
        }

        if (this.isSchemaDriftError(error)) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('users')
            .select(this.selectWithoutTeamRelation)
            .eq('email', email)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single()

          if (fallbackError) {
            if (this.isSupabasePostgrestTransportError(fallbackError)) {
              throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
                operation: 'findByEmailSchemaFallback',
                tenantId,
              })
            }

            if (this.isMissingTokenVersionError(fallbackError)) {
              const { data: legacyData, error: legacyError } = await supabase
                .from('users')
                .select(this.selectWithoutTeamRelationLegacy)
                .eq('email', email)
                .eq('tenant_id', tenantId)
                .is('deleted_at', null)
                .single()

              if (legacyError) {
                if (this.isSupabasePostgrestTransportError(legacyError)) {
                  throw new ExternalServiceError(
                    'supabase',
                    'Authentication service temporarily unavailable',
                    undefined,
                    {
                      operation: 'findByEmailSchemaLegacyFallback',
                      tenantId,
                    }
                  )
                }
                if (legacyError.code === 'PGRST116') {
                  return null
                }
                logger.error('Employee lookup by email failed (legacy token version fallback after schema drift)', {
                  email,
                  tenantId,
                  error: legacyError.message,
                })
                return null
              }

              const effectiveRole = await this.resolveEffectiveRole({
                tenantId,
                userId: legacyData.id,
                userEmail: legacyData.email,
                currentRole: legacyData.role,
                supabase,
              })

              logger.debug('Employee lookup by email used legacy token version fallback after schema drift', {
                email,
                tenantId,
                role: effectiveRole,
              })
              return legacyData ? this.mapEmployeeWithoutTeamLegacy({ ...legacyData, role: effectiveRole }) : null
            }

            if (fallbackError.code === 'PGRST116') {
              return null
            }
            logger.error('Employee lookup by email failed (fallback query)', {
              email,
              tenantId,
              error: fallbackError.message,
            })
            return null
          }

          const effectiveRole = await this.resolveEffectiveRole({
            tenantId,
            userId: fallbackData.id,
            userEmail: fallbackData.email,
            currentRole: fallbackData.role,
            supabase,
          })

          logger.debug('Employee lookup by email used schema-drift fallback (no team relation)', {
            email,
            tenantId,
            role: effectiveRole,
          })
          return fallbackData ? this.mapEmployeeWithoutTeam({ ...fallbackData, role: effectiveRole }) : null
        }

        if (error.code === 'PGRST116') {
          return null
        }
        logger.error('Employee lookup by email failed', { email, tenantId, error: error.message })
        return null
      }

      const effectiveRole = await this.resolveEffectiveRole({
        tenantId,
        userId: data.id,
        userEmail: data.email,
        currentRole: data.role,
        supabase,
      })

      return data ? this.mapEmployee({ ...data, role: effectiveRole }) : null
    } catch (error) {
      if (this.isSupabaseTransportError(error)) {
        throw new ExternalServiceError('supabase', 'Authentication service temporarily unavailable', undefined, {
          operation: 'findByEmail',
          tenantId,
        })
      }
      logger.error('Employee lookup by email threw error', { email, tenantId, error: String(error) })
      return null
    }
  }

  async findMappedTeamRolesByEmail({ email, tenantId }: EmployeeByEmail): Promise<Array<'POC' | 'HOD'>> {
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        return []
      }

      const supabase = createServiceSupabase()
      const { data, error } = await supabase
        .from('team_role_mappings')
        .select('role_type')
        .eq('tenant_id', tenantId)
        .eq('email', normalizedEmail)
        .eq('active_flag', true)
        .is('deleted_at', null)

      if (error) {
        logger.error('Failed to load mapped team roles by email', {
          email: normalizedEmail,
          tenantId,
          error: error.message,
          errorCode: error.code,
        })
        return []
      }

      const roleSet = new Set<'POC' | 'HOD'>()
      for (const row of data ?? []) {
        if (row.role_type === 'POC' || row.role_type === 'HOD') {
          roleSet.add(row.role_type)
        }
      }

      return Array.from(roleSet)
    } catch (error) {
      logger.error('Mapped team role lookup by email threw error', { email, tenantId, error: String(error) })
      return []
    }
  }

  async hasAdditionalApproverParticipation({ email, tenantId }: EmployeeByEmail): Promise<boolean> {
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        return false
      }

      const supabase = createServiceSupabase()
      const { count, error } = await supabase
        .from('contract_additional_approvers')
        .select('id', { head: true, count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('approver_email', normalizedEmail)
        .is('deleted_at', null)

      if (error) {
        logger.error('Failed to load additional approver participation by email', {
          tenantId,
          email: normalizedEmail,
          error: error.message,
          errorCode: error.code,
        })
        return false
      }

      return (count ?? 0) > 0
    } catch (error) {
      logger.error('Additional approver participation lookup threw error', { email, tenantId, error: String(error) })
      return false
    }
  }

  async hasActionableAdditionalApproverAssignments({ email, tenantId }: EmployeeByEmail): Promise<boolean> {
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        return false
      }

      const supabase = createServiceSupabase()
      const { data: approverRows, error: approverError } = await supabase
        .from('contract_additional_approvers')
        .select('contract_id, sequence_order')
        .eq('tenant_id', tenantId)
        .eq('approver_email', normalizedEmail)
        .eq('status', 'PENDING')
        .is('deleted_at', null)

      if (approverError) {
        logger.error('Failed to load additional approver assignments by email', {
          tenantId,
          email: normalizedEmail,
          error: approverError.message,
          errorCode: approverError.code,
        })
        return false
      }

      if (!approverRows || approverRows.length === 0) {
        return false
      }

      const contractIds = Array.from(new Set(approverRows.map((row) => row.contract_id)))

      const { data: legalPendingContracts, error: contractError } = await supabase
        .from('contracts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'LEGAL_PENDING')
        .in('id', contractIds)

      if (contractError) {
        logger.error('Failed to resolve legal-pending contracts for additional approver login', {
          tenantId,
          email: normalizedEmail,
          error: contractError.message,
          errorCode: contractError.code,
        })
        return false
      }

      const legalPendingContractIds = new Set((legalPendingContracts ?? []).map((row) => row.id))
      if (legalPendingContractIds.size === 0) {
        return false
      }

      const actionableApproverRows = approverRows.filter((row) => legalPendingContractIds.has(row.contract_id))
      if (actionableApproverRows.length === 0) {
        return false
      }

      const { data: pendingRows, error: pendingError } = await supabase
        .from('contract_additional_approvers')
        .select('contract_id, sequence_order')
        .eq('tenant_id', tenantId)
        .eq('status', 'PENDING')
        .is('deleted_at', null)
        .in('contract_id', Array.from(new Set(actionableApproverRows.map((row) => row.contract_id))))

      if (pendingError) {
        logger.error('Failed to resolve sequential pending approver state for login eligibility', {
          tenantId,
          email: normalizedEmail,
          error: pendingError.message,
          errorCode: pendingError.code,
        })
        return false
      }

      const minSequenceByContract = new Map<string, number>()
      for (const row of pendingRows ?? []) {
        const currentMin = minSequenceByContract.get(row.contract_id)
        if (currentMin === undefined || row.sequence_order < currentMin) {
          minSequenceByContract.set(row.contract_id, row.sequence_order)
        }
      }

      return actionableApproverRows.some((row) => row.sequence_order === minSequenceByContract.get(row.contract_id))
    } catch (error) {
      logger.error('Additional approver login eligibility lookup threw error', {
        email,
        tenantId,
        error: String(error),
      })
      return false
    }
  }

  async create(employee: Omit<EmployeeRecord, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<EmployeeRecord> {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          id: employee.id,
          tenant_id: employee.tenantId,
          email: employee.email,
          full_name: employee.fullName,
          team_id: employee.teamId ?? null,
          is_active: employee.isActive,
          password_hash: employee.passwordHash,
          role: employee.role,
          token_version: employee.tokenVersion,
        },
      ])
      .select(this.selectWithTeamRelation)
      .single()

    if (error) {
      if (this.isMissingTokenVersionError(error)) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('users')
          .insert([
            {
              id: employee.id,
              tenant_id: employee.tenantId,
              email: employee.email,
              full_name: employee.fullName,
              team_id: employee.teamId ?? null,
              is_active: employee.isActive,
              password_hash: employee.passwordHash,
              role: employee.role,
            },
          ])
          .select(this.selectWithoutTeamRelationLegacy)
          .single()

        if (legacyError) {
          throw legacyError
        }

        logger.debug('Employee create used legacy token version fallback', {
          employeeId: employee.id,
          tenantId: employee.tenantId,
        })
        return this.mapEmployeeWithoutTeamLegacy(legacyData)
      }

      if (this.isSchemaDriftError(error)) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('users')
          .insert([
            {
              id: employee.id,
              tenant_id: employee.tenantId,
              email: employee.email,
              full_name: employee.fullName,
              is_active: employee.isActive,
              password_hash: employee.passwordHash,
              role: employee.role,
              token_version: employee.tokenVersion,
            },
          ])
          .select(this.selectWithoutTeamRelation)
          .single()

        if (fallbackError) {
          throw fallbackError
        }

        logger.debug('Employee create used schema-drift fallback (no team relation)', {
          employeeId: employee.id,
          tenantId: employee.tenantId,
        })
        return this.mapEmployeeWithoutTeam(fallbackData)
      }

      throw error
    }

    return this.mapEmployee(data)
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    const supabase = createServiceSupabase()
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)

    if (error) throw error
  }

  async restore(id: string, tenantId: string): Promise<void> {
    const supabase = createServiceSupabase()
    const { error } = await supabase.from('users').update({ deleted_at: null }).eq('id', id).eq('tenant_id', tenantId)

    if (error) throw error
  }

  async listByTenant(tenantId: string, filters?: EmployeeFilters): Promise<EmployeeRecord[]> {
    try {
      const supabase = createServiceSupabase()
      let query = supabase
        .from('users')
        .select(this.selectWithTeamRelation)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)

      if (filters?.role) {
        query = query.eq('role', filters.role)
      }

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive)
      }

      const { data, error } = await query

      if (error) {
        if (this.isMissingTokenVersionError(error)) {
          let legacyQuery = supabase
            .from('users')
            .select(this.selectWithoutTeamRelationLegacy)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)

          if (filters?.role) {
            legacyQuery = legacyQuery.eq('role', filters.role)
          }

          if (filters?.isActive !== undefined) {
            legacyQuery = legacyQuery.eq('is_active', filters.isActive)
          }

          const { data: legacyData, error: legacyError } = await legacyQuery
          if (legacyError) {
            logger.error('Failed to list employees by tenant (legacy token version fallback)', {
              tenantId,
              error: legacyError.message,
            })
            return []
          }

          logger.debug('Employee list used legacy token version fallback', { tenantId })
          return (legacyData || []).map((emp) => this.mapEmployeeWithoutTeamLegacy(emp))
        }

        if (this.isSchemaDriftError(error)) {
          let fallbackQuery = supabase
            .from('users')
            .select(this.selectWithoutTeamRelation)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)

          if (filters?.role) {
            fallbackQuery = fallbackQuery.eq('role', filters.role)
          }

          if (filters?.isActive !== undefined) {
            fallbackQuery = fallbackQuery.eq('is_active', filters.isActive)
          }

          const { data: fallbackData, error: fallbackError } = await fallbackQuery
          if (fallbackError) {
            logger.error('Failed to list employees by tenant (fallback query)', {
              tenantId,
              error: fallbackError.message,
            })
            return []
          }

          logger.debug('Employee list used schema-drift fallback (no team relation)', { tenantId })
          return (fallbackData || []).map((emp) => this.mapEmployeeWithoutTeam(emp))
        }

        logger.error('Failed to list employees by tenant', { tenantId, error: error.message })
        return []
      }

      return (data || []).map((emp) => this.mapEmployee(emp))
    } catch (error) {
      logger.error('List employees by tenant threw error', { tenantId, error: String(error) })
      return []
    }
  }
}

export const supabaseEmployeeRepository = new SupabaseEmployeeRepository()
