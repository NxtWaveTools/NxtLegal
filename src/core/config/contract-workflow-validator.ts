import 'server-only'

import { createServiceSupabase } from '@/lib/supabase/service'
import { contractStatuses, forbiddenTransitionKeys, requiredTransitionKeys } from '@/core/constants/contracts'
import { DEFAULT_TENANT_ID } from '@/core/constants/tenants'

const allowedStatuses = new Set<string>([
  contractStatuses.draft,
  contractStatuses.uploaded,
  contractStatuses.hodPending,
  contractStatuses.underReview,
  contractStatuses.pendingInternal,
  contractStatuses.pendingExternal,
  contractStatuses.offlineExecution,
  contractStatuses.onHold,
  contractStatuses.completed,
  contractStatuses.signing,
  contractStatuses.executed,
  contractStatuses.void,
  contractStatuses.rejected,
])

type TransitionRow = {
  tenant_id: string
  from_status: string
  to_status: string
  trigger_action: string
  is_active: boolean
}

const toTransitionKey = (fromStatus: string, toStatus: string, triggerAction: string): string => {
  return `${fromStatus}:${toStatus}:${triggerAction}`
}

const toEdgeKey = (fromStatus: string, toStatus: string): string => {
  return `${fromStatus}:${toStatus}`
}

export async function validateContractWorkflowGraph(): Promise<void> {
  const supabase = createServiceSupabase()
  const { data, error } = await supabase
    .from('contract_transition_graph')
    .select('tenant_id, from_status, to_status, trigger_action, is_active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)

  if (error) {
    throw new Error(`Contract workflow graph query failed: ${error.message}`)
  }

  const transitions = (data ?? []) as TransitionRow[]

  if (transitions.length === 0) {
    throw new Error('Contract workflow graph has no active transitions for default tenant')
  }

  for (const transition of transitions) {
    if (!allowedStatuses.has(transition.from_status) || !allowedStatuses.has(transition.to_status)) {
      throw new Error(
        `Contract workflow graph has invalid status edge: ${transition.from_status} -> ${transition.to_status}`
      )
    }
  }

  const activeTransitionKeys = new Set(
    transitions.map((transition) =>
      toTransitionKey(transition.from_status, transition.to_status, transition.trigger_action)
    )
  )

  const activeEdgeKeys = new Set(
    transitions.map((transition) => toEdgeKey(transition.from_status, transition.to_status))
  )

  const missingRequired = requiredTransitionKeys.filter((requiredKey) => !activeTransitionKeys.has(requiredKey))
  if (missingRequired.length > 0) {
    throw new Error(`Contract workflow graph is missing required transitions: ${missingRequired.join(', ')}`)
  }

  const forbiddenEdges = forbiddenTransitionKeys.filter((forbiddenEdge) => activeEdgeKeys.has(forbiddenEdge))
  if (forbiddenEdges.length > 0) {
    throw new Error(`Contract workflow graph contains forbidden transitions: ${forbiddenEdges.join(', ')}`)
  }
}
