/**
 * Unit tests for contract status constants and mapping utilities.
 *
 * resolveRepositoryStatus and resolveContractStatusDisplayLabel are pure
 * mapping functions that drive the repository filter and display layer.
 * Testing every branch ensures no status is silently misrouted.
 */

import {
  resolveRepositoryStatus,
  resolveContractStatusDisplayLabel,
  contractStatuses,
  contractRepositoryStatuses,
  contractStatusDisplayLabels,
} from '@/core/constants/contracts'

// ─── resolveRepositoryStatus ─────────────────────────────────────────────────

describe('resolveRepositoryStatus', () => {
  it('maps HOD_PENDING to HOD_APPROVAL_PENDING', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.hodPending })).toBe(
      contractRepositoryStatuses.hodApprovalPending
    )
  })

  it('maps UNDER_REVIEW → underReview (no pending additional approvers)', () => {
    expect(
      resolveRepositoryStatus({ status: contractStatuses.underReview, hasPendingAdditionalApprovers: false })
    ).toBe(contractRepositoryStatuses.underReview)
  })

  it('maps UNDER_REVIEW with pending additional approvers → pendingInternal', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.underReview, hasPendingAdditionalApprovers: true })).toBe(
      contractRepositoryStatuses.pendingInternal
    )
  })

  it('maps PENDING_WITH_INTERNAL_STAKEHOLDERS → pendingInternal', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.pendingInternal })).toBe(
      contractRepositoryStatuses.pendingInternal
    )
  })

  it('maps PENDING_WITH_EXTERNAL_STAKEHOLDERS → pendingExternal', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.pendingExternal })).toBe(
      contractRepositoryStatuses.pendingExternal
    )
  })

  it('maps OFFLINE_EXECUTION → offlineExecution', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.offlineExecution })).toBe(
      contractRepositoryStatuses.offlineExecution
    )
  })

  it('maps ON_HOLD → onHold', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.onHold })).toBe(contractRepositoryStatuses.onHold)
  })

  it('maps COMPLETED → completed', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.completed })).toBe(contractRepositoryStatuses.completed)
  })

  it('maps SIGNING → signing', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.signing })).toBe(contractRepositoryStatuses.signing)
  })

  it('maps EXECUTED → executed', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.executed })).toBe(contractRepositoryStatuses.executed)
  })

  it('maps VOID → void', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.void })).toBe(contractRepositoryStatuses.void)
  })

  it('maps REJECTED → rejected', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.rejected })).toBe(contractRepositoryStatuses.rejected)
  })

  it('DRAFT and UPLOADED fall through to onHold (catch-all defensive mapping)', () => {
    // These early statuses should not appear in the repository, but the
    // resolver must handle them defensively rather than throw.
    expect(resolveRepositoryStatus({ status: contractStatuses.draft })).toBe(contractRepositoryStatuses.onHold)
    expect(resolveRepositoryStatus({ status: contractStatuses.uploaded })).toBe(contractRepositoryStatuses.onHold)
  })

  it('is stable with hasPendingAdditionalApprovers: undefined (treated as falsy)', () => {
    expect(resolveRepositoryStatus({ status: contractStatuses.underReview })).toBe(
      contractRepositoryStatuses.underReview
    )
  })
})

// ─── resolveContractStatusDisplayLabel ───────────────────────────────────────

describe('resolveContractStatusDisplayLabel', () => {
  it('returns standard label when no additional approvers pending', () => {
    expect(
      resolveContractStatusDisplayLabel({
        status: contractStatuses.underReview,
        hasPendingAdditionalApprovers: false,
      })
    ).toBe('Under Review')
  })

  it('returns enhanced label when UNDER_REVIEW and approvers pending', () => {
    const label = resolveContractStatusDisplayLabel({
      status: contractStatuses.underReview,
      hasPendingAdditionalApprovers: true,
    })
    expect(label).toBe(contractStatusDisplayLabels.legalWaitingForAdditionalApprovers)
    expect(label).toBe('Legal Waiting for Additional Approvers')
  })

  it('ignores hasPendingAdditionalApprovers for non-UNDER_REVIEW statuses', () => {
    expect(
      resolveContractStatusDisplayLabel({
        status: contractStatuses.completed,
        hasPendingAdditionalApprovers: true, // Irrelevant
      })
    ).toBe('Completed')
  })

  it('returns correct labels for all statuses', () => {
    const expectations: [keyof typeof contractStatuses, string][] = [
      ['draft', 'Draft'],
      ['uploaded', 'Uploaded'],
      ['hodPending', 'HOD Pending'],
      ['underReview', 'Under Review'],
      ['onHold', 'On Hold'],
      ['completed', 'Completed'],
      ['signing', 'Signing'],
      ['executed', 'Executed'],
      ['void', 'Voided'],
      ['rejected', 'Rejected'],
    ]

    for (const [statusKey, expectedLabel] of expectations) {
      expect(resolveContractStatusDisplayLabel({ status: contractStatuses[statusKey] })).toBe(expectedLabel)
    }
  })
})

// ─── Status transition matrix sanity checks ──────────────────────────────────

describe('Contract status constants completeness', () => {
  it('has exactly 13 workflow statuses', () => {
    expect(Object.keys(contractStatuses)).toHaveLength(13)
  })

  it('VOID and REJECTED are terminal statuses (not mapped to active repo statuses)', () => {
    // A void contract should not show as under review
    expect(resolveRepositoryStatus({ status: contractStatuses.void })).toBe(contractRepositoryStatuses.void)
    expect(resolveRepositoryStatus({ status: contractStatuses.rejected })).toBe(contractRepositoryStatuses.rejected)
  })

  it('requiredTransitionKeys and forbiddenTransitionKeys do not overlap', () => {
    const { requiredTransitionKeys, forbiddenTransitionKeys } = jest.requireActual('@/core/constants/contracts') as {
      requiredTransitionKeys: readonly string[]
      forbiddenTransitionKeys: readonly string[]
    }

    // Extract edge pairs from full transition keys (fromStatus:toStatus:action → fromStatus:toStatus)
    const requiredEdges = new Set(requiredTransitionKeys.map((key) => key.split(':').slice(0, 2).join(':')))

    for (const forbidden of forbiddenTransitionKeys) {
      expect(requiredEdges.has(forbidden)).toBe(false)
    }
  })
})
