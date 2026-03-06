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
      .from('master_counterparties')
      .select('name')
      .eq('tenant_id', session.tenantId)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    const counterpartyNames = (data ?? []).map((item) => item.name)
    const normalizedCounterpartyNames = counterpartyNames.filter((name) => name.trim().length > 0)
    const latestMetadataByCounterpartyName = new Map<
      string,
      {
        backgroundOfRequest: string
        budgetApproved: boolean
        signatories: Array<{
          name: string
          designation: string
          email: string
        }>
      }
    >()

    if (normalizedCounterpartyNames.length > 0) {
      const { data: contractRows, error: contractsError } = await supabase
        .from('contracts')
        .select(
          'counterparty_name, signatory_name, signatory_designation, signatory_email, background_of_request, budget_approved, updated_at'
        )
        .eq('tenant_id', session.tenantId)
        .is('deleted_at', null)
        .in('counterparty_name', normalizedCounterpartyNames)
        .order('updated_at', { ascending: false })

      if (contractsError) {
        throw contractsError
      }

      for (const row of contractRows ?? []) {
        const counterpartyName = row.counterparty_name?.trim()
        if (!counterpartyName || latestMetadataByCounterpartyName.has(counterpartyName)) {
          continue
        }

        latestMetadataByCounterpartyName.set(counterpartyName, {
          backgroundOfRequest: row.background_of_request?.trim() ?? '',
          budgetApproved: Boolean(row.budget_approved),
          signatories:
            row.signatory_name?.trim() && row.signatory_designation?.trim() && row.signatory_email?.trim()
              ? [
                  {
                    name: row.signatory_name.trim(),
                    designation: row.signatory_designation.trim(),
                    email: row.signatory_email.trim().toLowerCase(),
                  },
                ]
              : [],
        })
      }
    }

    return NextResponse.json(
      okResponse({
        counterparties: (data ?? []).map((item) => ({
          name: item.name,
          ...(latestMetadataByCounterpartyName.get(item.name.trim()) ?? {}),
        })),
      })
    )
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to fetch counterparties'
    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
