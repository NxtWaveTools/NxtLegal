import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { logger } from '@/core/infra/logging/logger'
import type {
  EmployeeByEmail,
  EmployeeLookup,
  EmployeeRecord,
  EmployeeRepository,
  EmployeeFilters,
} from '@/core/domain/users/employee-repository'

class SupabaseEmployeeRepository implements EmployeeRepository {
  private readonly selectWithTeamRelation =
    'id, tenant_id, email, full_name, team_id, team_name:teams(name), is_active, password_hash, role, created_at, updated_at, deleted_at'

  private readonly selectWithoutTeamRelation =
    'id, tenant_id, email, full_name, is_active, password_hash, role, created_at, updated_at, deleted_at'

  private isSchemaDriftError(error: { message?: string; details?: string } | null | undefined): boolean {
    const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
    return (
      message.includes("could not find a relationship between 'users' and 'teams'") ||
      message.includes('column users.team_id does not exist') ||
      message.includes('column "team_id" does not exist')
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
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
    }
  }

  private async resolveEffectiveRole(params: {
    tenantId: string
    userId: string
    currentRole: string
    supabase: ReturnType<typeof createServiceSupabase>
  }): Promise<string> {
    if (params.currentRole !== 'USER') {
      return params.currentRole
    }

    const { data, error } = await params.supabase
      .from('team_members')
      .select('role_type, is_primary, created_at')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', params.userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) {
      logger.warn('Failed to resolve effective role from team_members', {
        tenantId: params.tenantId,
        userId: params.userId,
        error: error.message,
      })
      return params.currentRole
    }

    const roleType = (data ?? [])[0]?.role_type
    if (roleType === 'HOD') {
      return 'HOD'
    }

    if (roleType === 'POC') {
      return 'POC'
    }

    return params.currentRole
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
        if (this.isSchemaDriftError(error)) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('users')
            .select(this.selectWithoutTeamRelation)
            .eq('id', employeeId)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single()

          if (fallbackError) {
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
            currentRole: fallbackData.role,
            supabase,
          })

          logger.warn('User lookup by ID used schema-drift fallback (no team relation)', {
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
        if (this.isSchemaDriftError(error)) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('users')
            .select(this.selectWithoutTeamRelation)
            .eq('email', email)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single()

          if (fallbackError) {
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
            currentRole: fallbackData.role,
            supabase,
          })

          logger.warn('Employee lookup by email used schema-drift fallback (no team relation)', {
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
        currentRole: data.role,
        supabase,
      })

      return data ? this.mapEmployee({ ...data, role: effectiveRole }) : null
    } catch (error) {
      logger.error('Employee lookup by email threw error', { email, tenantId, error: String(error) })
      return null
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
        },
      ])
      .select(this.selectWithTeamRelation)
      .single()

    if (error) {
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
            },
          ])
          .select(this.selectWithoutTeamRelation)
          .single()

        if (fallbackError) {
          throw fallbackError
        }

        logger.warn('Employee create used schema-drift fallback (no team relation)', {
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

          logger.warn('Employee list used schema-drift fallback (no team relation)', { tenantId })
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
