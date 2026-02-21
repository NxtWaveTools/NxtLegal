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
    const { data, error } = await supabase
      .from('contract_types')
      .select('id, name')
      .eq('tenant_id', session.tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json(
      okResponse({
        contractTypes: (data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
        })),
      })
    )
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to fetch contract types'
    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
