'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  contractsClient,
  type ContractAllowedAction,
  type ContractDetailResponse,
  type ContractRecord,
  type ContractTimelineEvent,
} from '@/core/client/contracts-client'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import styles from './contracts-workspace.module.css'

type ContractsWorkspaceProps = {
  session: {
    employeeId: string
    role?: string
  }
}

export default function ContractsWorkspace({ session }: ContractsWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [selectedContractId, setSelectedContractId] = useState<string | null>(() => searchParams.get('contractId'))
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null)
  const [timeline, setTimeline] = useState<ContractTimelineEvent[]>([])
  const [availableActions, setAvailableActions] = useState<ContractAllowedAction[]>([])
  const [approvers, setApprovers] = useState<ContractDetailResponse['additionalApprovers']>([])
  const [noteText, setNoteText] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadContracts = useCallback(async () => {
    const response = await contractsClient.list({ limit: 20 })

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to load contracts')
      setContracts([])
      return
    }

    const contractsList = response.data.contracts

    setContracts(contractsList)
    setError(null)

    setSelectedContractId((current) => {
      if (current || contractsList.length === 0) {
        return current
      }

      return contractsList[0].id
    })
  }, [])

  const applyContractView = (contractView: ContractDetailResponse) => {
    setSelectedContract(contractView.contract)
    setAvailableActions(contractView.availableActions)
    setApprovers(contractView.additionalApprovers)
  }

  const loadContractContext = useCallback(async (contractId: string) => {
    const [detailResponse, timelineResponse] = await Promise.all([
      contractsClient.detail(contractId),
      contractsClient.timeline(contractId),
    ])

    if (!detailResponse.ok || !detailResponse.data?.contract) {
      setError(detailResponse.error?.message ?? 'Failed to load contract detail')
      setSelectedContract(null)
      setTimeline([])
      setAvailableActions([])
      setApprovers([])
      return
    }

    applyContractView(detailResponse.data)

    if (timelineResponse.ok && timelineResponse.data) {
      setTimeline(timelineResponse.data.events)
    } else {
      setTimeline([])
    }
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true)
      await loadContracts()
      setIsLoading(false)
    }

    void bootstrap()
  }, [loadContracts])

  useEffect(() => {
    if (!selectedContractId) {
      return
    }

    let isCancelled = false

    const loadSelectedContract = async () => {
      const [detailResponse, timelineResponse] = await Promise.all([
        contractsClient.detail(selectedContractId),
        contractsClient.timeline(selectedContractId),
      ])

      if (isCancelled) {
        return
      }

      if (!detailResponse.ok || !detailResponse.data?.contract) {
        setError(detailResponse.error?.message ?? 'Failed to load contract detail')
        setSelectedContract(null)
        setTimeline([])
        setAvailableActions([])
        setApprovers([])
        return
      }

      applyContractView(detailResponse.data)

      if (timelineResponse.ok && timelineResponse.data) {
        setTimeline(timelineResponse.data.events)
      } else {
        setTimeline([])
      }
    }

    void loadSelectedContract()

    return () => {
      isCancelled = true
    }
  }, [selectedContractId])

  const executeAction = async (actionItem: ContractAllowedAction) => {
    if (!selectedContractId) {
      return
    }

    let remark: string | undefined
    if (actionItem.requiresRemark) {
      const input = window.prompt('Remarks are required for this action. Enter remarks:')
      if (!input?.trim()) {
        setError('Remarks are required for this action')
        return
      }
      remark = input.trim()
    }

    setIsMutating(true)
    const response = await contractsClient.action(selectedContractId, {
      action: actionItem.action,
      noteText: remark,
    })
    setIsMutating(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to apply contract action')
      return
    }

    applyContractView(response.data)
    await loadContracts()
    await loadContractContext(selectedContractId)
    router.refresh()
  }

  const handleDownload = async () => {
    if (!selectedContractId) {
      return
    }

    const response = await contractsClient.download(selectedContractId)

    if (!response.ok || !response.data?.signedUrl) {
      setError(response.error?.message ?? 'Failed to generate download link')
      return
    }

    window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleAddNote = async () => {
    if (!selectedContractId || !noteText.trim()) {
      return
    }

    setIsMutating(true)
    const response = await contractsClient.addNote(selectedContractId, { noteText: noteText.trim() })
    setIsMutating(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to add note')
      return
    }

    setNoteText('')
    applyContractView(response.data)
    await loadContractContext(selectedContractId)
  }

  const handleAddApprover = async () => {
    if (!selectedContractId || !approverEmail.trim()) {
      return
    }

    setIsMutating(true)
    const response = await contractsClient.addApprover(selectedContractId, {
      approverEmail: approverEmail.trim().toLowerCase(),
    })
    setIsMutating(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to add additional approver')
      return
    }

    setApproverEmail('')
    applyContractView(response.data)
  }

  const noteEvents = useMemo(() => timeline.filter((event) => event.eventType === 'CONTRACT_NOTE_ADDED'), [timeline])

  return (
    <div className={styles.layout}>
      <section className={styles.panel}>
        <div className={styles.title}>Contracts</div>
        {isLoading ? (
          <div className={styles.itemMeta}>Loading contracts...</div>
        ) : (
          <div className={styles.list}>
            {contracts.map((contract) => (
              <button
                key={contract.id}
                type="button"
                className={`${styles.item} ${contract.id === selectedContractId ? styles.itemActive : ''}`}
                onClick={() => setSelectedContractId(contract.id)}
              >
                <div className={styles.itemTitle}>{contract.title}</div>
                <div className={styles.itemMeta}>
                  <ContractStatusBadge status={contract.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.title}>Contract Details</div>
        {!selectedContract ? (
          <div className={styles.itemMeta}>Select a contract to view details</div>
        ) : (
          <>
            <div className={styles.row}>
              <span>Title</span>
              <span>{selectedContract.title}</span>
            </div>
            <div className={styles.row}>
              <span>Status</span>
              <span>
                <ContractStatusBadge status={selectedContract.status} />
              </span>
            </div>
            <div className={styles.row}>
              <span>Assignee</span>
              <span>{selectedContract.currentAssigneeEmail}</span>
            </div>
            <div className={styles.row}>
              <span>File</span>
              <span>{selectedContract.fileName}</span>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={handleDownload}>
                Download
              </button>
              {availableActions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  disabled={isMutating}
                  onClick={() => void executeAction(item)}
                >
                  {isMutating ? 'Processing...' : item.label}
                </button>
              ))}
            </div>

            {(session.role === 'LEGAL_TEAM' || session.role === 'ADMIN') && (
              <div className={styles.section}>
                <div className={styles.title}>Additional Approvers</div>
                <div className={styles.inlineForm}>
                  <input
                    type="email"
                    className={styles.input}
                    placeholder="approver@nxtwave.co.in"
                    value={approverEmail}
                    onChange={(event) => setApproverEmail(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.button}
                    disabled={isMutating}
                    onClick={() => void handleAddApprover()}
                  >
                    Add Approver
                  </button>
                </div>
                <div className={styles.timeline}>
                  {approvers.map((approver) => (
                    <div key={approver.id} className={styles.event}>
                      <div>
                        #{approver.sequenceOrder} {approver.approverEmail}
                      </div>
                      <div className={styles.eventMeta}>{approver.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.section}>
              <div className={styles.title}>Notes</div>
              <div className={styles.inlineForm}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Add note"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
                <button
                  type="button"
                  className={styles.button}
                  disabled={isMutating}
                  onClick={() => void handleAddNote()}
                >
                  Add Note
                </button>
              </div>
              <div className={styles.timeline}>
                {noteEvents.map((event) => (
                  <div key={event.id} className={styles.event}>
                    <div>{event.noteText}</div>
                    <div className={styles.eventMeta}>{new Date(event.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.timeline}>
              <div className={styles.title}>Timeline</div>
              {timeline.map((event) => (
                <div key={event.id} className={styles.event}>
                  <div>{event.action}</div>
                  <div className={styles.eventMeta}>{new Date(event.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </section>
    </div>
  )
}
