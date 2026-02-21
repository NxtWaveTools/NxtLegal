import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { createServiceSupabase } from '@/lib/supabase/service'

const GETHandler = withAuth(async (_request: NextRequest, { session }) => {
  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    const supabase = createServiceSupabase()
    const { data: teams, error } = await supabase
      .from('teams')
      .select('id, name')
      .eq('tenant_id', session.tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    const teamIds = (teams ?? []).map((team) => team.id)

    const hodByTeamId = new Map<string, { hodName: string | null; hodEmail: string | null }>()

    if (teamIds.length > 0) {
      const { data: hodMembers, error: hodMembersError } = await supabase
        .from('team_members')
        .select('team_id, user_id, is_primary, created_at')
        .eq('tenant_id', session.tenantId)
        .eq('role_type', 'HOD')
        .in('team_id', teamIds)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (hodMembersError) {
        throw hodMembersError
      }

      const hodUserIds = Array.from(new Set((hodMembers ?? []).map((item) => item.user_id)))

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('tenant_id', session.tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .in('id', hodUserIds.length > 0 ? hodUserIds : ['00000000-0000-0000-0000-000000000000'])

      if (usersError) {
        throw usersError
      }

      const userById = new Map((users ?? []).map((item) => [item.id, item]))

      for (const member of hodMembers ?? []) {
        if (hodByTeamId.has(member.team_id)) {
          continue
        }

        const user = userById.get(member.user_id)
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
