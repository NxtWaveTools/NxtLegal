import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { adminGovernance } from '@/core/constants/admin-governance'
import { createServiceSupabase } from '@/lib/supabase/service'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const supabase = createServiceSupabase()
    const normalizedRole = (session.role ?? '').trim().toUpperCase()
    const normalizedEmail = session.email?.trim().toLowerCase() ?? ''
    const isAdminRole = adminGovernance.adminActorRoles.includes(
      normalizedRole as (typeof adminGovernance.adminActorRoles)[number]
    )

    const roleScopedToPocAssignments = normalizedRole === 'POC' || normalizedRole === 'USER'

    let scopedTeamIds: string[] | null = null

    if (!isAdminRole && roleScopedToPocAssignments && normalizedEmail) {
      const { data: pocMappings, error: pocMappingsError } = await supabase
        .from('team_role_mappings')
        .select('team_id')
        .eq('tenant_id', session.tenantId)
        .eq('role_type', 'POC')
        .eq('email', normalizedEmail)
        .eq('active_flag', true)
        .is('deleted_at', null)

      if (pocMappingsError) {
        throw pocMappingsError
      }

      scopedTeamIds = Array.from(new Set((pocMappings ?? []).map((row) => row.team_id)))

      if (scopedTeamIds.length === 0) {
        const { data: fallbackTeams, error: fallbackTeamsError } = await supabase
          .from('teams')
          .select('id')
          .eq('tenant_id', session.tenantId)
          .eq('poc_email', normalizedEmail)
          .eq('is_active', true)
          .is('deleted_at', null)

        if (fallbackTeamsError) {
          throw fallbackTeamsError
        }

        scopedTeamIds = Array.from(new Set((fallbackTeams ?? []).map((team) => team.id)))
      }
    }

    if (Array.isArray(scopedTeamIds) && scopedTeamIds.length === 0) {
      return NextResponse.json(okResponse({ departments: [] }))
    }

    let teamsQuery = supabase
      .from('teams')
      .select('id, name')
      .eq('tenant_id', session.tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (scopedTeamIds) {
      teamsQuery = teamsQuery.in('id', scopedTeamIds)
    }

    const { data: teams, error } = await teamsQuery

    if (error) {
      throw error
    }

    const teamIds = (teams ?? []).map((team) => team.id)

    const hodByTeamId = new Map<string, { hodName: string | null; hodEmail: string | null }>()

    if (teamIds.length > 0) {
      const { data: hodMembers, error: hodMembersError } = await supabase
        .from('team_role_mappings')
        .select('team_id, email, role_type, created_at')
        .eq('tenant_id', session.tenantId)
        .eq('role_type', 'HOD')
        .eq('active_flag', true)
        .is('deleted_at', null)
        .in('team_id', teamIds)
        .order('created_at', { ascending: true })

      if (hodMembersError) {
        throw hodMembersError
      }

      const hodEmails = Array.from(new Set((hodMembers ?? []).map((item) => item.email?.toLowerCase()).filter(Boolean)))

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('tenant_id', session.tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .in('email', hodEmails.length > 0 ? hodEmails : ['__no_hod_email__'])

      if (usersError) {
        throw usersError
      }

      const userByEmail = new Map((users ?? []).map((item) => [item.email.toLowerCase(), item]))

      for (const member of hodMembers ?? []) {
        if (hodByTeamId.has(member.team_id)) {
          continue
        }

        const user = userByEmail.get(member.email.toLowerCase())
        hodByTeamId.set(member.team_id, {
          hodName: user?.full_name ?? null,
          hodEmail: user?.email ?? null,
        })
      }
    }

    return NextResponse.json(
      okResponse({
        departments: (teams ?? []).map((item) => {
          const hod = hodByTeamId.get(item.id)

          return {
            id: item.id,
            name: item.name,
            hodName: hod?.hodName ?? null,
            hodEmail: hod?.hodEmail ?? null,
          }
        }),
      })
    )
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to fetch departments'
    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
