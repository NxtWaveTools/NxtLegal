'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  contractsClient,
  type ContractAllowedAction,
  type ContractDocument,
  type ContractDetailResponse,
  type ContractRecord,
  type ContractTimelineEvent,
} from '@/core/client/contracts-client'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import { formatContractLogEvents, isContractNoteEvent } from '@/modules/contracts/ui/formatContractLogEvent'
import styles from './contracts-workspace.module.css'

type ContractsWorkspaceProps = {
  session: {
    employeeId: string
    role?: string
  }
  initialContractId?: string
}

export default function ContractsWorkspace({ session, initialContractId }: ContractsWorkspaceProps) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'notes', label: 'Notes' },
    { id: 'documents', label: 'Documents' },
  ] as const

  type TabId = (typeof tabs)[number]['id']

  const router = useRouter()
  const searchParams = useSearchParams()
  const source = searchParams.get('from')
  const sourceFilter = searchParams.get('filter')
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [selectedContractId, setSelectedContractId] = useState<string | null>(() => {
    return searchParams.get('contractId') ?? initialContractId ?? null
  })
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null)
  const [timeline, setTimeline] = useState<ContractTimelineEvent[]>([])
  const [availableActions, setAvailableActions] = useState<ContractAllowedAction[]>([])
  const [approvers, setApprovers] = useState<ContractDetailResponse['additionalApprovers']>([])
  const [documents, setDocuments] = useState<ContractDocument[]>([])
  const [noteText, setNoteText] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [showAllLogs, setShowAllLogs] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [activeAction, setActiveAction] = useState<ContractAllowedAction['action'] | null>(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerExternalUrl, setViewerExternalUrl] = useState<string | null>(null)
  const [viewerMimeType, setViewerMimeType] = useState<string>('')
  const [viewerFileName, setViewerFileName] = useState<string>('')
  const [previewingDocumentId, setPreviewingDocumentId] = useState<string | null>(null)
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
    setDocuments(contractView.documents ?? [])
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
      setDocuments([])
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
        setDocuments([])
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

  const selectContract = (contractId: string) => {
    setSelectedContractId(contractId)
    setActiveTab('overview')
    setIsIntakeOpen(false)
    setExpandedLogIds(new Set())
    setShowAllLogs(false)
  }

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

    setActiveAction(actionItem.action)
    const response = await contractsClient.action(selectedContractId, {
      action: actionItem.action,
      noteText: remark,
    })
    setActiveAction(null)

    if (response.ok !== true) {
      if (response.error?.code) {
        setError(response.error.message ?? 'Failed to apply contract action')
      }
      return
    }

    if (response.data) {
      applyContractView(response.data)
    }

    await loadContracts()
    await loadContractContext(selectedContractId)
    router.refresh()
  }

  const handleDownload = async (document?: ContractDocument) => {
    if (!selectedContractId) {
      return
    }

    const response = await contractsClient.download(selectedContractId, {
      documentId: document?.id,
    })

    if (!response.ok || !response.data?.signedUrl) {
      setError(response.error?.message ?? 'Failed to generate download link')
      return
    }

    window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleViewDocument = async (document?: ContractDocument) => {
    if (!selectedContractId) {
      return
    }

    const previewKey = document?.id ?? '__primary__'
    setPreviewingDocumentId(previewKey)
    try {
      const response = await contractsClient.download(selectedContractId, {
        documentId: document?.id,
      })

      if (!response.ok || !response.data?.signedUrl) {
        setError(response.error?.message ?? 'Failed to generate document view link')
        return
      }

      const resolvedFileName =
        response.data.fileName ?? document?.displayName ?? selectedContract?.fileName ?? 'Contract document'
      const resolvedMimeType = document?.fileMimeType ?? ''
      const isDocx =
        resolvedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        resolvedFileName.toLowerCase().endsWith('.docx')

      const previewUrl = contractsClient.previewUrl(selectedContractId, {
        documentId: document?.id,
        renderAs: isDocx ? 'html' : 'binary',
      })

      setViewerUrl(previewUrl)
      setViewerExternalUrl(response.data.signedUrl)
      setViewerMimeType(resolvedMimeType)
      setViewerFileName(resolvedFileName)
      setIsViewerOpen(true)
    } finally {
      setPreviewingDocumentId(null)
    }
  }

  const closeViewer = useCallback(() => {
    setIsViewerOpen(false)
    setViewerUrl(null)
    setViewerExternalUrl(null)
    setViewerMimeType('')
    setViewerFileName('')
  }, [])

  useEffect(() => {
    if (!isViewerOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeViewer()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [closeViewer, isViewerOpen])

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
    router.refresh()
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

  const noteEvents = useMemo(() => timeline.filter((event) => isContractNoteEvent(event)), [timeline])
  const timelineById = useMemo(() => new Map(timeline.map((event) => [event.id, event])), [timeline])
  const formattedLogs = useMemo(() => {
    if (activeTab !== 'activity') {
      return []
    }

    return formatContractLogEvents(timeline)
  }, [activeTab, timeline])
  const visibleLogs = useMemo(() => {
    if (showAllLogs) {
      return formattedLogs
    }

    return formattedLogs.slice(0, 5)
  }, [formattedLogs, showAllLogs])
  const quickMetadata = useMemo(
    () => [
      {
        label: 'Created At',
        value: selectedContract?.requestCreatedAt
          ? new Date(selectedContract.requestCreatedAt).toLocaleString()
          : selectedContract?.createdAt
            ? new Date(selectedContract.createdAt).toLocaleString()
            : '—',
      },
      {
        label: 'Budget Approved',
        value: selectedContract ? (selectedContract.budgetApproved ? 'Yes' : 'No') : '—',
      },
    ],
    [selectedContract]
  )

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab)

    if (currentIndex === -1) {
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const nextIndex = (currentIndex + 1) % tabs.length
      setActiveTab(tabs[nextIndex].id)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
      setActiveTab(tabs[nextIndex].id)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setActiveTab(tabs[0].id)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setActiveTab(tabs[tabs.length - 1].id)
    }
  }

  const toggleLogExpansion = (logId: string) => {
    setExpandedLogIds((current) => {
      const next = new Set(current)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }

  const handleBackNavigation = () => {
    if (source === 'dashboard') {
      const dashboardQuery = new URLSearchParams()
      if (sourceFilter) {
        dashboardQuery.set('filter', sourceFilter)
      }

      const target = dashboardQuery.size > 0 ? `/dashboard?${dashboardQuery.toString()}` : '/dashboard'
      router.push(target)
      return
    }

    if (source === 'repository') {
      router.push('/repository')
      return
    }

    router.push('/repository')
  }

  return (
    <div className={styles.layout}>
      <section className={styles.panel}>
        <div className={styles.title}>Contracts</div>
        {isLoading ? (
          <div className={styles.list}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={styles.shimmerBlock}>
                <div className={styles.shimmerLine} style={{ width: `${50 + i * 10}%` }} />
                <div className={styles.shimmerLine} style={{ width: '35%', height: 10 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {contracts.map((contract) => (
              <button
                key={contract.id}
                type="button"
                className={`${styles.item} ${contract.id === selectedContractId ? styles.itemActive : ''}`}
                onClick={() => selectContract(contract.id)}
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
        <div className={styles.headerRow}>
          <button type="button" className={styles.backButton} onClick={handleBackNavigation}>
            Back
          </button>
          <div className={styles.title}>{selectedContract?.title ?? 'Contract Details'}</div>
          <div className={styles.headerActions}>
            {selectedContract ? <ContractStatusBadge status={selectedContract.status} /> : null}
            {availableActions.map((item) => (
              <button
                key={item.action}
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={Boolean(activeAction) || isMutating}
                onClick={() => void executeAction(item)}
              >
                {activeAction === item.action ? 'Processing...' : item.label}
              </button>
            ))}
          </div>
        </div>
        {!selectedContract ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📄</div>
            <div style={{ fontWeight: 600 }}>Select a contract</div>
            <div className={styles.itemMeta}>Choose a contract from the list to view its details</div>
          </div>
        ) : (
          <div className={styles.detailsShell}>
            <aside className={styles.summaryColumn}>
              <div className={styles.card}>
                <div className={styles.sectionTitle}>Contract Summary</div>
                <div className={styles.row}>
                  <span>Title</span>
                  <span className={styles.rowValue}>{selectedContract.title}</span>
                </div>
                <div className={styles.row}>
                  <span>Contract Type</span>
                  <span>{selectedContract.contractTypeName ?? '—'}</span>
                </div>
                <div className={styles.row}>
                  <span>File</span>
                  <span className={styles.rowValue}>{selectedContract.fileName}</span>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.sectionTitle}>Department</div>
                <div className={styles.row}>
                  <span>Name</span>
                  <span>{selectedContract.departmentName ?? '—'}</span>
                </div>
                <div className={styles.row}>
                  <span>HOD</span>
                  <span>{selectedContract.departmentHodName ?? '—'}</span>
                </div>
                <div className={styles.row}>
                  <span>HOD Email</span>
                  <span>{selectedContract.departmentHodEmail ?? '—'}</span>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.sectionTitle}>Assignee</div>
                <div className={styles.row}>
                  <span>Current</span>
                  <span>{selectedContract.currentAssigneeEmail}</span>
                </div>
                <div className={styles.row}>
                  <span>Uploaded By</span>
                  <span>{selectedContract.uploadedByEmail}</span>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.sectionTitle}>Quick Metadata</div>
                {quickMetadata.map((item) => (
                  <div key={item.label} className={styles.row}>
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </aside>

            <div className={styles.tabColumn}>
              <div
                className={styles.tabHeader}
                role="tablist"
                aria-label="Contract details sections"
                onKeyDown={handleTabKeyDown}
              >
                {tabs.map((tab) => {
                  const selected = activeTab === tab.id

                  return (
                    <button
                      key={tab.id}
                      id={`contract-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      tabIndex={selected ? 0 : -1}
                      aria-selected={selected}
                      aria-controls={`contract-tabpanel-${tab.id}`}
                      className={`${styles.tabButton} ${selected ? styles.tabButtonActive : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              <div
                id={`contract-tabpanel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`contract-tab-${activeTab}`}
                className={styles.tabPanel}
              >
                {activeTab === 'overview' && (
                  <div className={styles.tabSection}>
                    <div className={styles.card}>
                      <div className={styles.sectionTitle}>Overview</div>
                      <div className={styles.row}>
                        <span>Contract Type</span>
                        <span>{selectedContract.contractTypeName ?? '—'}</span>
                      </div>
                      <div className={styles.row}>
                        <span>Counterparty</span>
                        <span>{selectedContract.counterpartyName ?? '—'}</span>
                      </div>
                      <div className={styles.row}>
                        <span>File Name</span>
                        <span>{selectedContract.fileName ?? '—'}</span>
                      </div>
                      <div className={styles.row}>
                        <span>File Size</span>
                        <span>
                          {typeof selectedContract.fileSizeBytes === 'number'
                            ? `${Math.round(selectedContract.fileSizeBytes / 1024)} KB`
                            : '—'}
                        </span>
                      </div>
                      <div className={styles.row}>
                        <span>File Type</span>
                        <span>{selectedContract.fileMimeType ?? '—'}</span>
                      </div>
                    </div>

                    <div className={styles.card}>
                      <button
                        type="button"
                        className={styles.accordionTrigger}
                        aria-expanded={isIntakeOpen}
                        aria-controls="intake-details-panel"
                        onClick={() => setIsIntakeOpen((current) => !current)}
                      >
                        Intake Details
                      </button>
                      {isIntakeOpen ? (
                        <div id="intake-details-panel" className={styles.accordionBody}>
                          <div className={styles.row}>
                            <span>Signatory Name</span>
                            <span>{selectedContract.signatoryName ?? '—'}</span>
                          </div>
                          <div className={styles.row}>
                            <span>Signatory Designation</span>
                            <span>{selectedContract.signatoryDesignation ?? '—'}</span>
                          </div>
                          <div className={styles.row}>
                            <span>Signatory Email</span>
                            <span>{selectedContract.signatoryEmail ?? '—'}</span>
                          </div>
                          <div className={styles.row}>
                            <span>Background</span>
                            <span className={styles.multilineValue}>{selectedContract.backgroundOfRequest ?? '—'}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {(session.role === 'LEGAL_TEAM' || session.role === 'ADMIN') && (
                      <div className={styles.card}>
                        <div className={styles.sectionTitle}>Additional Approvers</div>
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
                  </div>
                )}

                {activeTab === 'activity' && (
                  <div className={styles.tabSection}>
                    <div className={styles.card}>
                      <div className={styles.sectionTitle}>Logs Timeline</div>
                      <div className={styles.logContainer}>
                        {visibleLogs.map((event) => {
                          const rawEvent = timelineById.get(event.id)
                          const roleClass =
                            rawEvent?.actorRole === 'HOD'
                              ? styles.roleHod
                              : rawEvent?.actorRole === 'LEGAL_TEAM'
                                ? styles.roleLegal
                                : styles.rolePoc
                          const isExpanded = expandedLogIds.has(event.id)

                          return (
                            <div key={event.id} className={`${styles.timelineEvent} ${roleClass}`}>
                              <div className={styles.timelineMarker} />
                              <div className={styles.timelineContent}>
                                <div className={styles.eventActor}>{event.actorLabel}</div>
                                <div>{event.message}</div>
                                <div className={styles.eventMeta} title={event.absoluteTimestamp}>
                                  {event.relativeTimestamp}
                                </div>
                                <button
                                  type="button"
                                  className={styles.inlineLinkButton}
                                  onClick={() => toggleLogExpansion(event.id)}
                                  aria-expanded={isExpanded}
                                >
                                  {isExpanded ? 'Collapse' : 'Expand'}
                                </button>
                                {isExpanded ? (
                                  <div className={styles.expandedMeta}>
                                    {event.remark ? <div className={styles.eventRemark}>{event.remark}</div> : null}
                                    <div className={styles.eventMeta}>{event.absoluteTimestamp}</div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {formattedLogs.length > 5 ? (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => setShowAllLogs((current) => !current)}
                        >
                          {showAllLogs ? 'Show Latest 5' : `Show All (${formattedLogs.length})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className={styles.tabSection}>
                    <div className={styles.card}>
                      <div className={styles.sectionTitle}>Notes</div>
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
                            <div className={styles.eventActor}>{event.actorEmail ?? 'System'}</div>
                            <div>{event.noteText}</div>
                            <div className={styles.eventMeta}>{new Date(event.createdAt).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'documents' && (
                  <div className={styles.tabSection}>
                    <div className={styles.card}>
                      <div className={styles.sectionTitle}>Documents</div>
                      <div className={styles.timeline}>
                        {documents.length === 0 ? (
                          <div className={styles.placeholderRow}>No documents available for this contract.</div>
                        ) : (
                          documents.map((document) => (
                            <div key={document.id} className={styles.documentRow}>
                              <div className={styles.documentMeta}>
                                <div className={styles.eventActor}>{document.displayName}</div>
                                <div className={styles.itemMeta}>{document.fileName}</div>
                                <div className={styles.itemMeta}>
                                  {Math.max(1, Math.round(document.fileSizeBytes / 1024))} KB · {document.fileMimeType}
                                </div>
                              </div>
                              <div className={styles.actions}>
                                <button
                                  type="button"
                                  className={styles.button}
                                  disabled={Boolean(previewingDocumentId)}
                                  onClick={() => void handleViewDocument(document)}
                                >
                                  {previewingDocumentId === document.id ? 'Opening...' : 'Preview'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.button}
                                  onClick={() => void handleDownload(document)}
                                >
                                  Download
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </section>

      {isViewerOpen && viewerUrl ? (
        <div
          className={styles.viewerOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Contract document preview"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeViewer()
            }
          }}
        >
          <div className={styles.viewerModal}>
            <div className={styles.viewerHeader}>
              <div className={styles.viewerTitle}>{viewerFileName}</div>
              <button type="button" className={styles.button} onClick={closeViewer}>
                Close
              </button>
            </div>
            <div className={styles.viewerBody}>
              {viewerMimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewerUrl} alt={viewerFileName} className={styles.viewerFrame} />
              ) : viewerMimeType.includes('pdf') ||
                viewerFileName.toLowerCase().endsWith('.pdf') ||
                viewerFileName.toLowerCase().endsWith('.docx') ? (
                <iframe src={viewerUrl} title={viewerFileName} className={styles.viewerFrame} />
              ) : (
                <div className={styles.placeholderRow}>
                  Preview is not supported for this file type. Use Open in New Tab.
                </div>
              )}
            </div>
            <div className={styles.viewerFooter}>
              <span className={styles.itemMeta}>If preview is not available, open in a new tab.</span>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => window.open(viewerExternalUrl ?? viewerUrl, '_blank', 'noopener,noreferrer')}
              >
                Open in New Tab
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
