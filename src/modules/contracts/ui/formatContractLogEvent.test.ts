import { formatContractLogEvent, formatContractLogEvents } from '@/modules/contracts/ui/formatContractLogEvent'

describe('formatContractLogEvent legal send-for-signing semantics', () => {
  it('renders custom legal send-for-signing initiation message', () => {
    const result = formatContractLogEvent({
      id: 'event-1',
      eventType: 'CONTRACT_SIGNATORY_SENT',
      action: 'contract.legal.send_for_signing.initiated',
      userId: 'user-1',
      actorEmail: 'legal@nxtwave.co.in',
      actorRole: 'LEGAL_TEAM',
      targetEmail: 'hod.legal@nxtwave.co.in',
      noteText: 'Initiated Send for Signing workflow. Pending Legal HOD review.',
      metadata: {
        upload_mode: 'LEGAL_SEND_FOR_SIGNING',
        status: 'HOD_PENDING',
        workflow_label: 'Pending Legal HOD review',
      },
      createdAt: '2026-02-28T12:00:00.000Z',
    })

    expect(result.message).toBe('Initiated Send for Signing workflow. Pending Legal HOD review.')
    expect(result.remark).toBe('Reason: Initiated Send for Signing workflow. Pending Legal HOD review.')
  })

  it('attributes signed webhook events to external signer when actor is system', () => {
    const result = formatContractLogEvent({
      id: 'event-2',
      eventType: 'CONTRACT_SIGNATORY_SIGNED',
      action: 'contract.signatory.signed',
      userId: 'SYSTEM',
      actorEmail: null,
      actorRole: 'SYSTEM',
      targetEmail: 'signer@example.com',
      metadata: {
        recipient_type: 'EXTERNAL',
      },
      createdAt: '2026-02-28T13:00:00.000Z',
    })

    expect(result.actorLabel).toBe('Counter Party signer (signer@example.com)')
    expect(result.message).toBe('Signed by signer@example.com via Zoho Sign.')
    expect(result.category).toBe('SIGNING')
  })

  it('deduplicates noisy signing preparation draft saved events', () => {
    const events = [
      {
        id: 'draft-1',
        eventType: null,
        action: 'contract.signing_preparation_draft.saved',
        userId: 'SYSTEM',
        actorEmail: null,
        actorRole: 'SYSTEM',
        metadata: { recipients_count: 1, fields_count: 2 },
        createdAt: '2026-02-28T13:00:00.000Z',
      },
      {
        id: 'draft-2',
        eventType: null,
        action: 'contract.signing_preparation_draft.saved',
        userId: 'SYSTEM',
        actorEmail: null,
        actorRole: 'SYSTEM',
        metadata: { recipients_count: 2, fields_count: 4 },
        createdAt: '2026-02-28T14:00:00.000Z',
      },
      {
        id: 'signed-1',
        eventType: 'CONTRACT_SIGNATORY_SIGNED',
        action: 'contract.signatory.signed',
        userId: 'SYSTEM',
        actorEmail: null,
        actorRole: 'SYSTEM',
        targetEmail: 'signer@example.com',
        createdAt: '2026-02-28T15:00:00.000Z',
      },
    ]

    const result = formatContractLogEvents(events)
    expect(result).toHaveLength(2)
    expect(result.some((event) => event.id === 'draft-2')).toBe(true)
    expect(result.some((event) => event.id === 'draft-1')).toBe(false)
  })
})
