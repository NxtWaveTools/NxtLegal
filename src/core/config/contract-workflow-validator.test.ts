/**
 * Unit tests for validateContractWorkflowGraph.
 *
 * This validator is the configuration-time guardrail that prevents the system
 * from starting with a corrupt workflow graph. We mock the Supabase query
 * and test all the pure logical branches: required transitions, forbidden edges,
 * unknown statuses, and active-transitions-only enforcement.
 *
 * This is NOT an integration test — no real DB is used.
 */

// Mock server-only (handled by Next.js jest config, explicit for clarity)
jest.mock('@/lib/supabase/service', () => ({
  createServiceSupabase: jest.fn(),
}))

import { validateContractWorkflowGraph } from '@/core/config/contract-workflow-validator'
import { createServiceSupabase } from '@/lib/supabase/service'
import { contractStatuses, contractTransitionActions, requiredTransitionKeys } from '@/core/constants/contracts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TransitionRow = {
  tenant_id: string
  from_status: string
  to_status: string
  trigger_action: string
  is_active: boolean
}

const TENANT_ID = '00000000-0000-0000-0000-000000000000'

/** Build a complete, valid transition set from requiredTransitionKeys. */
const buildValidTransitions = (): TransitionRow[] =>
  requiredTransitionKeys.map((key) => {
    const [from_status, to_status, trigger_action] = key.split(':')
    return { tenant_id: TENANT_ID, from_status, to_status, trigger_action, is_active: true }
  })

/**
 * Build a chainable Supabase mock that yields `transitions` from .select().
 *
 * The real query chains: .from().select().eq('tenant_id', ...).eq('is_active', true)
 * So we need two levels of .eq() — the first returns an object with another .eq(),
 * and the second returns a resolved Promise.
 */
const buildSupabaseMock = (transitions: TransitionRow[] | null, error: { message: string } | null = null) => {
  const secondEq = {
    eq: jest.fn().mockResolvedValue({ data: transitions, error }),
  }

  const firstEq = {
    eq: jest.fn().mockReturnValue(secondEq),
  }

  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue(firstEq),
    }),
  }
}

const mockCreateServiceSupabase = createServiceSupabase as jest.MockedFunction<typeof createServiceSupabase>

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateContractWorkflowGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('passes with a complete valid transition graph', async () => {
    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock(buildValidTransitions()) as never)

    await expect(validateContractWorkflowGraph()).resolves.toBeUndefined()
  })

  it('throws when the DB query fails', async () => {
    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock(null, { message: 'Connection refused' }) as never)

    await expect(validateContractWorkflowGraph()).rejects.toThrow(
      'Contract workflow graph query failed: Connection refused'
    )
  })

  it('throws when no active transitions exist', async () => {
    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock([]) as never)

    await expect(validateContractWorkflowGraph()).rejects.toThrow('Contract workflow graph has no active transitions')
  })

  it('throws when a required transition is missing', async () => {
    // All valid transitions except the HOD approve one
    const transitions = buildValidTransitions().filter(
      (t) =>
        !(
          t.from_status === contractStatuses.hodPending &&
          t.to_status === contractStatuses.underReview &&
          t.trigger_action === contractTransitionActions.hodApprove
        )
    )

    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock(transitions) as never)

    await expect(validateContractWorkflowGraph()).rejects.toThrow(
      'Contract workflow graph is missing required transitions'
    )
  })

  it('throws when a forbidden edge is present', async () => {
    const validTransitions = buildValidTransitions()
    // Add the known forbidden edge: HOD_PENDING → COMPLETED (no action check)
    const forbidden: TransitionRow = {
      tenant_id: TENANT_ID,
      from_status: contractStatuses.hodPending,
      to_status: contractStatuses.completed,
      trigger_action: 'forbidden.action',
      is_active: true,
    }

    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock([...validTransitions, forbidden]) as never)

    await expect(validateContractWorkflowGraph()).rejects.toThrow(
      'Contract workflow graph contains forbidden transitions'
    )
  })

  it('throws when a transition references an unknown status', async () => {
    const validTransitions = buildValidTransitions()
    const invalidStatus: TransitionRow = {
      tenant_id: TENANT_ID,
      from_status: 'MYTHICAL_STATUS',
      to_status: contractStatuses.completed,
      trigger_action: 'some.action',
      is_active: true,
    }

    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock([...validTransitions, invalidStatus]) as never)

    await expect(validateContractWorkflowGraph()).rejects.toThrow('Contract workflow graph has invalid status edge')
  })

  it('accepts extra valid transitions beyond the required set', async () => {
    const extra: TransitionRow = {
      tenant_id: TENANT_ID,
      from_status: contractStatuses.underReview,
      to_status: contractStatuses.pendingInternal,
      trigger_action: contractTransitionActions.legalSetPendingInternal,
      is_active: true,
    }

    mockCreateServiceSupabase.mockReturnValue(buildSupabaseMock([...buildValidTransitions(), extra]) as never)

    await expect(validateContractWorkflowGraph()).resolves.toBeUndefined()
  })
})
