'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  contractsClient,
  type ContractAllowedAction,
  type ContractDocument,
  type ContractDetailResponse,
  type ContractRecord,
  type ContractTimelineEvent,
} from '@/core/client/contracts-client'
import {
  contractLegalAssignmentEditableStatuses,
  contractStatuses,
  contractTransitionActions,
} from '@/core/constants/contracts'
import Spinner from '@/components/ui/Spinner'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import ContractDocumentsPanel from '@/modules/contracts/ui/ContractDocumentsPanel'
import ApprovalsTab from '@/modules/contracts/ui/ApprovalsTab'
import { formatContractLogEvents, isContractNoteEvent } from '@/modules/contracts/ui/formatContractLogEvent'
import PrepareForSigningModal from '@/modules/contracts/ui/PrepareForSigningModal'
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
    { id: 'approvals', label: 'Approvals' },
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
  const [legalCollaborators, setLegalCollaborators] = useState<ContractDetailResponse['legalCollaborators']>([])
  const [signatories, setSignatories] = useState<ContractDetailResponse['signatories']>([])
  const [counterparties, setCounterparties] = useState<ContractDetailResponse['counterparties']>([])
  const [documents, setDocuments] = useState<ContractDocument[]>([])
  const [noteText, setNoteText] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [collaboratorEmail, setCollaboratorEmail] = useState('')
  const [activityMessageText, setActivityMessageText] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [isActivityComposerOpen, setIsActivityComposerOpen] = useState(false)
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false)
  const [isSettingOwner, setIsSettingOwner] = useState(false)
  const [isAddingCollaborator, setIsAddingCollaborator] = useState(false)
  const [isMarkingActivitySeen, setIsMarkingActivitySeen] = useState(false)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [isPrepareForSigningOpen, setIsPrepareForSigningOpen] = useState(false)
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [showAllLogs, setShowAllLogs] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isContractContextLoading, setIsContractContextLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [activeAction, setActiveAction] = useState<ContractAllowedAction['action'] | null>(null)
  const [confirmActionItem, setConfirmActionItem] = useState<ContractAllowedAction | null>(null)
  const [remarkActionItem, setRemarkActionItem] = useState<ContractAllowedAction | null>(null)
  const [selectedLegalAction, setSelectedLegalAction] = useState<ContractAllowedAction['action'] | ''>('')
  const [remarkDraft, setRemarkDraft] = useState('')
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerExternalUrl, setViewerExternalUrl] = useState<string | null>(null)
  const [viewerMimeType, setViewerMimeType] = useState<string>('')
  const [viewerFileName, setViewerFileName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [totalContracts, setTotalContracts] = useState(0)

  const PAGE_SIZE = 15

  const loadContracts = useCallback(async (cursor?: string) => {
    const response = await contractsClient.list({ cursor, limit: PAGE_SIZE })

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to load contracts')
      if (!cursor) {
        setContracts([])
      }
      return
    }

    const { contracts: newContracts, pagination } = response.data

    setContracts((prev) => (cursor ? [...prev, ...newContracts] : newContracts))
    setNextCursor(pagination.cursor)
    setHasMore(pagination.cursor !== null)
    setTotalContracts(pagination.total)
    setError(null)

    if (!cursor) {
      setSelectedContractId((current) => {
        if (current || newContracts.length === 0) {
          return current
        }
        return newContracts[0].id
      })
    }
  }, [])

  const applyContractView = (contractView: ContractDetailResponse) => {
    setSelectedContract(contractView.contract)
    setCounterparties(contractView.counterparties ?? [])
    setDocuments(contractView.documents ?? [])
    setAvailableActions(contractView.availableActions)
    setApprovers(contractView.additionalApprovers)
    setLegalCollaborators(contractView.legalCollaborators)
    setSignatories(contractView.signatories ?? [])
    setOwnerEmail(contractView.contract.currentAssigneeEmail)
  }

  const syncContractReadState = useCallback((contractId: string, hasUnreadActivity: boolean) => {
    setContracts((current) =>
      current.map((contract) => (contract.id === contractId ? { ...contract, hasUnreadActivity } : contract))
    )
  }, [])

  const loadContractContext = useCallback(async (contractId: string) => {
    const [detailResponse, timelineResponse] = await Promise.all([
      contractsClient.detail(contractId),
      contractsClient.timeline(contractId),
    ])

    if (!detailResponse.ok || !detailResponse.data?.contract) {
      setError(detailResponse.error?.message ?? 'Failed to load contract detail')
      setSelectedContract(null)
      setTimeline([])
      setCounterparties([])
      setDocuments([])
      setAvailableActions([])
      setApprovers([])
      setLegalCollaborators([])
      setSignatories([])
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
      setIsContractContextLoading(true)
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
        setCounterparties([])
        setDocuments([])
        setAvailableActions([])
        setApprovers([])
        setLegalCollaborators([])
        setSignatories([])
        setIsContractContextLoading(false)
        return
      }

      applyContractView(detailResponse.data)

      if (timelineResponse.ok && timelineResponse.data) {
        setTimeline(timelineResponse.data.events)
      } else {
        setTimeline([])
      }

      setIsContractContextLoading(false)
    }

    void loadSelectedContract()

    return () => {
      isCancelled = true
    }
  }, [selectedContractId])

  const selectContract = (contractId: string) => {
    setIsContractContextLoading(true)
    setSelectedContractId(contractId)
    setActiveTab('overview')
    setIsIntakeOpen(false)
    setIsPrepareForSigningOpen(false)
    setExpandedLogIds(new Set())
    setShowAllLogs(false)
  }

  const handleTabChange = useCallback(
    (tabId: TabId) => {
      setActiveTab(tabId)

      if (tabId === 'documents' && selectedContractId) {
        void loadContractContext(selectedContractId)
      }
    },
    [loadContractContext, selectedContractId]
  )

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    await loadContracts(nextCursor)
    setIsLoadingMore(false)
  }

  const applyAction = useCallback(
    async (actionItem: ContractAllowedAction, remark?: string): Promise<boolean> => {
      if (!selectedContractId) {
        return false
      }

      const loadingToastId = `contract-action-${actionItem.action}`
      toast.loading(`Applying ${actionItem.label}...`, { id: loadingToastId })

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
        toast.error(response.error?.message ?? `Failed to apply ${actionItem.label}`, { id: loadingToastId })
        return false
      }

      if (response.data) {
        applyContractView(response.data)
      }

      await loadContracts()
      await loadContractContext(selectedContractId)
      router.refresh()
      toast.success(`${actionItem.label} completed successfully`, { id: loadingToastId })
      return true
    },
    [loadContractContext, loadContracts, router, selectedContractId]
  )

  const executeAction = async (actionItem: ContractAllowedAction) => {
    if (!selectedContractId) {
      return
    }

    if (actionItem.action.includes('approve')) {
      setConfirmActionItem(actionItem)
      setError(null)
      return
    }

    if (actionItem.requiresRemark) {
      setRemarkActionItem(actionItem)
      setRemarkDraft('')
      setError(null)
      return
    }

    await applyAction(actionItem)
  }

  const closeConfirmDialog = useCallback(() => {
    if (activeAction) {
      return
    }

    setConfirmActionItem(null)
  }, [activeAction])

  const submitConfirmDialog = useCallback(async () => {
    if (!confirmActionItem) {
      return
    }

    if (confirmActionItem.requiresRemark) {
      setRemarkActionItem(confirmActionItem)
      setRemarkDraft('')
      setConfirmActionItem(null)
      return
    }

    const didApply = await applyAction(confirmActionItem)
    if (didApply) {
      setConfirmActionItem(null)
    }
  }, [applyAction, confirmActionItem])

  const closeRemarkDialog = useCallback(() => {
    if (activeAction) {
      return
    }

    setRemarkActionItem(null)
    setRemarkDraft('')
  }, [activeAction])

  const submitRemarkDialog = useCallback(async () => {
    if (!remarkActionItem) {
      return
    }

    const remark = remarkDraft.trim()
    if (!remark) {
      setError('Remarks are required for this action')
      return
    }

    const didApply = await applyAction(remarkActionItem, remark)
    if (didApply) {
      setRemarkActionItem(null)
      setRemarkDraft('')
    }
  }, [applyAction, remarkActionItem, remarkDraft])

  const legalStatusActionSet = useMemo(
    () =>
      new Set<ContractAllowedAction['action']>([
        contractTransitionActions.legalSetUnderReview,
        contractTransitionActions.legalSetPendingInternal,
        contractTransitionActions.legalSetPendingExternal,
        contractTransitionActions.legalSetOfflineExecution,
        contractTransitionActions.legalSetOnHold,
        contractTransitionActions.legalSetCompleted,
        contractTransitionActions.legalReroute,
        contractTransitionActions.legalReject,
        contractTransitionActions.legalVoid,
      ]),
    []
  )

  const legalStatusActionRank = useMemo(
    () =>
      new Map<ContractAllowedAction['action'], number>([
        [contractTransitionActions.legalSetUnderReview, 1],
        [contractTransitionActions.legalSetPendingInternal, 2],
        [contractTransitionActions.legalSetPendingExternal, 3],
        [contractTransitionActions.legalSetOfflineExecution, 4],
        [contractTransitionActions.legalSetOnHold, 5],
        [contractTransitionActions.legalSetCompleted, 6],
        [contractTransitionActions.legalReroute, 7],
        [contractTransitionActions.legalReject, 8],
        [contractTransitionActions.legalVoid, 9],
      ]),
    []
  )

  const legalStatusActions = useMemo(
    () =>
      availableActions
        .filter((actionItem) => legalStatusActionSet.has(actionItem.action))
        .sort((left, right) => {
          const leftRank = legalStatusActionRank.get(left.action) ?? Number.MAX_SAFE_INTEGER
          const rightRank = legalStatusActionRank.get(right.action) ?? Number.MAX_SAFE_INTEGER

          if (leftRank === rightRank) {
            return left.label.localeCompare(right.label)
          }

          return leftRank - rightRank
        }),
    [availableActions, legalStatusActionRank, legalStatusActionSet]
  )

  const nonLegalStatusActions = useMemo(
    () => availableActions.filter((actionItem) => !legalStatusActionSet.has(actionItem.action)),
    [availableActions, legalStatusActionSet]
  )

  const handleLegalActionSelect = useCallback(
    (actionName: ContractAllowedAction['action'] | '') => {
      setSelectedLegalAction(actionName)

      if (!actionName) {
        return
      }

      const actionItem = legalStatusActions.find((entry) => entry.action === actionName)
      if (!actionItem) {
        setSelectedLegalAction('')
        return
      }

      setConfirmActionItem(actionItem)
      setError(null)
      setSelectedLegalAction('')
    },
    [legalStatusActions]
  )

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

  const handleRemindApprover = async (approverEmailToRemind?: string) => {
    if (!selectedContractId) {
      return
    }

    setIsMutating(true)
    const response = await contractsClient.remindApprover(selectedContractId, {
      approverEmail: approverEmailToRemind,
    })
    setIsMutating(false)

    if (!response.ok) {
      setError(response.error?.message ?? 'Failed to send reminder')
      return
    }
  }

  const handleSetOwner = async () => {
    if (!selectedContractId || !ownerEmail.trim() || isSettingOwner) {
      return
    }

    setIsSettingOwner(true)
    setIsMutating(true)
    const response = await contractsClient.manageAssignment(selectedContractId, {
      operation: 'set_owner',
      ownerEmail: ownerEmail.trim().toLowerCase(),
    })
    setIsMutating(false)
    setIsSettingOwner(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to update legal owner')
      toast.error(response.error?.message ?? 'Failed to update legal owner')
      return
    }

    applyContractView(response.data)
    await loadContracts()
    toast.success('Legal owner updated successfully')
  }

  const handleAddCollaborator = async () => {
    if (!selectedContractId || !collaboratorEmail.trim() || isAddingCollaborator) {
      return
    }

    setIsAddingCollaborator(true)
    setIsMutating(true)
    const response = await contractsClient.manageAssignment(selectedContractId, {
      operation: 'add_collaborator',
      collaboratorEmail: collaboratorEmail.trim().toLowerCase(),
    })
    setIsMutating(false)
    setIsAddingCollaborator(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to add legal collaborator')
      toast.error(response.error?.message ?? 'Failed to add legal collaborator')
      return
    }

    setCollaboratorEmail('')
    applyContractView(response.data)
    toast.success('Collaborator added successfully')
  }

  const handleRemoveCollaborator = async (email: string) => {
    if (!selectedContractId) {
      return
    }

    setIsMutating(true)
    const response = await contractsClient.manageAssignment(selectedContractId, {
      operation: 'remove_collaborator',
      collaboratorEmail: email,
    })
    setIsMutating(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to remove legal collaborator')
      return
    }

    applyContractView(response.data)
  }

  const handleAddActivityMessage = async () => {
    if (!selectedContractId || !activityMessageText.trim()) {
      return
    }

    setIsSubmittingActivity(true)
    const response = await contractsClient.addActivityMessage(selectedContractId, {
      messageText: activityMessageText.trim(),
    })
    setIsSubmittingActivity(false)

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Failed to post activity message')
      return
    }

    setActivityMessageText('')
    setIsActivityComposerOpen(false)
    applyContractView(response.data)
    await loadContractContext(selectedContractId)
    await loadContracts()
    syncContractReadState(selectedContractId, false)
  }

  const noteEvents = useMemo(() => timeline.filter((event) => isContractNoteEvent(event)), [timeline])
  const timelineById = useMemo(() => new Map(timeline.map((event) => [event.id, event])), [timeline])
  const selectedCurrentDocumentId = selectedContract?.currentDocumentId
  const signingPreviewDocumentId = useMemo(() => {
    const primaryDocuments = documents.filter((document) => document.documentKind === 'PRIMARY')
    const orderedPrimaryDocuments = [...primaryDocuments].sort(
      (first, second) => (second.versionNumber ?? 0) - (first.versionNumber ?? 0)
    )

    const isPdfDocument = (document: (typeof documents)[number]) =>
      document.fileMimeType.toLowerCase().includes('pdf') || document.fileName.toLowerCase().endsWith('.pdf')

    if (selectedCurrentDocumentId) {
      const currentDocument = primaryDocuments.find((document) => document.id === selectedCurrentDocumentId)
      if (currentDocument && isPdfDocument(currentDocument)) {
        return currentDocument.id
      }
    }

    const latestPrimaryPdf = orderedPrimaryDocuments.find(isPdfDocument)
    if (latestPrimaryPdf) {
      return latestPrimaryPdf.id
    }

    if (selectedCurrentDocumentId) {
      const currentDocument = primaryDocuments.find((document) => document.id === selectedCurrentDocumentId)
      if (currentDocument) {
        return currentDocument.id
      }
    }

    return orderedPrimaryDocuments[0]?.id ?? documents[0]?.id
  }, [documents, selectedCurrentDocumentId])
  const signingPreviewUrl = useMemo(() => {
    if (!selectedContractId) {
      return ''
    }

    return contractsClient.previewUrl(selectedContractId, {
      documentId: signingPreviewDocumentId,
      renderAs: 'binary',
    })
  }, [selectedContractId, signingPreviewDocumentId])
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
  const quickMetadata = useMemo(() => {
    const metadata: Array<{ label: string; value: string }> = [
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
    ]

    if (selectedContract?.status === contractStatuses.void) {
      metadata.push({
        label: 'Void Reason',
        value: selectedContract.voidReason?.trim() ? selectedContract.voidReason : '—',
      })
    }

    return metadata
  }, [selectedContract])
  const canManageLegalWorkSharing = useMemo(() => {
    if (!(session.role === 'LEGAL_TEAM' || session.role === 'ADMIN')) {
      return false
    }

    if (!selectedContract?.status) {
      return false
    }

    return contractLegalAssignmentEditableStatuses.includes(
      selectedContract.status as (typeof contractLegalAssignmentEditableStatuses)[number]
    )
  }, [selectedContract, session.role])
  const selectedContractListRow = useMemo(
    () => contracts.find((contract) => contract.id === selectedContractId) ?? null,
    [contracts, selectedContractId]
  )
  const hasUnreadActivity = Boolean(selectedContractListRow?.hasUnreadActivity)

  useEffect(() => {
    if (!selectedContractId || activeTab !== 'activity' || !hasUnreadActivity || isMarkingActivitySeen) {
      return
    }

    let isCancelled = false
    const markSeen = async () => {
      setIsMarkingActivitySeen(true)
      syncContractReadState(selectedContractId, false)
      const response = await contractsClient.markActivitySeen(selectedContractId)
      if (!isCancelled && response.ok && response.data) {
        syncContractReadState(selectedContractId, response.data.hasUnread)
      }
      if (!isCancelled) {
        setIsMarkingActivitySeen(false)
      }
    }

    void markSeen()

    return () => {
      isCancelled = true
    }
  }, [activeTab, hasUnreadActivity, isMarkingActivitySeen, selectedContractId, syncContractReadState])

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab)

    if (currentIndex === -1) {
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const nextIndex = (currentIndex + 1) % tabs.length
      handleTabChange(tabs[nextIndex].id)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
      handleTabChange(tabs[nextIndex].id)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      handleTabChange(tabs[0].id)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      handleTabChange(tabs[tabs.length - 1].id)
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

  const handleSigningPrepared = async (contractView: ContractDetailResponse) => {
    applyContractView(contractView)
    setIsPrepareForSigningOpen(false)
    if (contractView.contract.id === selectedContractId) {
      await loadContractContext(selectedContractId)
    }
    await loadContracts()
    router.refresh()
  }

  return (
    <div className={`${styles.layout} ${!isSidebarOpen ? styles.layoutCollapsed : ''}`}>
      {/* ── Left Sidebar ── */}
      <aside className={`${styles.sidebar} ${!isSidebarOpen ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarHeaderRow}>
            <div>
              <span className={styles.sidebarTitle}>Contracts</span>
              {!isLoading && (
                <span className={styles.sidebarCount}>
                  {contracts.length}
                  {totalContracts > 0 ? ` / ${totalContracts}` : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              className={styles.menuButton}
              aria-label={isSidebarOpen ? 'Hide contracts list' : 'Show contracts list'}
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen((current) => !current)}
            >
              ☰
            </button>
          </div>
        </div>
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
                  {contract.hasUnreadActivity ? (
                    <span className={styles.unreadDot} aria-label="Unread activity" />
                  ) : null}
                  <ContractStatusBadge status={contract.status} displayLabel={contract.displayStatusLabel} />
                </div>
              </button>
            ))}
            {hasMore && (
              <button
                type="button"
                className={styles.loadMoreButton}
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
              >
                {isLoadingMore ? 'Loading…' : `Load More (${contracts.length} of ${totalContracts})`}
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Right Detail Panel ── */}
      <section className={styles.detail}>
        <div className={styles.headerRow}>
          <button type="button" className={styles.backButton} onClick={handleBackNavigation}>
            ← Back
          </button>
          <div className={styles.title}>{selectedContract?.title ?? 'Contract Details'}</div>
          <div className={styles.headerActions}>
            {selectedContract ? (
              <ContractStatusBadge
                status={selectedContract.status}
                displayLabel={selectedContract.displayStatusLabel}
              />
            ) : null}

            {legalStatusActions.length > 0 ? (
              <select
                className={styles.actionDropdown}
                value={selectedLegalAction}
                onChange={(event) =>
                  handleLegalActionSelect(event.target.value as ContractAllowedAction['action'] | '')
                }
                disabled={Boolean(activeAction) || isMutating}
                aria-label="Legal status actions"
              >
                <option value="">Legal Status Actions</option>
                {legalStatusActions.map((item) => (
                  <option key={item.action} value={item.action}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : null}

            {nonLegalStatusActions.map((item) => (
              <button
                key={item.action}
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={Boolean(activeAction) || isMutating}
                onClick={() => void executeAction(item)}
              >
                {activeAction === item.action ? (
                  <span className={styles.buttonContent}>
                    <Spinner size={14} />
                    Processing…
                  </span>
                ) : (
                  item.label
                )}
              </button>
            ))}
          </div>
        </div>

        {selectedContract?.latestAdditionalApproverRejectionReason ? (
          <div className={styles.rejectionContextBanner}>
            Additional approver rejection reason: {selectedContract.latestAdditionalApproverRejectionReason}
          </div>
        ) : null}

        {selectedContract?.status === contractStatuses.void && selectedContract.voidReason ? (
          <div className={styles.rejectionContextBanner}>Void reason: {selectedContract.voidReason}</div>
        ) : null}

        {!selectedContract ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📄</div>
            <div style={{ fontWeight: 600 }}>Select a contract</div>
            <div className={styles.itemMeta}>Choose a contract from the sidebar to view details</div>
          </div>
        ) : isContractContextLoading ? (
          <div className={styles.detailShimmer}>
            <div className={styles.shimmerBlock}>
              <div className={styles.shimmerLine} style={{ width: '28%' }} />
              <div className={styles.shimmerLine} style={{ width: '92%' }} />
              <div className={styles.shimmerLine} style={{ width: '84%' }} />
            </div>
            <div className={styles.shimmerBlock}>
              <div className={styles.shimmerLine} style={{ width: '20%' }} />
              <div className={styles.shimmerLine} style={{ width: '96%' }} />
              <div className={styles.shimmerLine} style={{ width: '88%' }} />
              <div className={styles.shimmerLine} style={{ width: '80%' }} />
            </div>
            <div className={styles.shimmerBlock}>
              <div className={styles.shimmerLine} style={{ width: '24%' }} />
              <div className={styles.shimmerLine} style={{ width: '90%' }} />
            </div>
          </div>
        ) : (
          <div className={styles.detailsShell}>
            {/* ── Summary Column (flat sections) ── */}
            <aside className={styles.summaryColumn}>
              <div className={styles.sectionBlock}>
                <div className={styles.sectionLabel}>Contract Summary</div>
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

              <div className={styles.sectionBlock}>
                <div className={styles.sectionLabel}>Department</div>
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

              <div className={styles.sectionBlock}>
                <div className={styles.sectionLabel}>Assignee</div>
                <div className={styles.row}>
                  <span>Current</span>
                  <span>{selectedContract.currentAssigneeEmail}</span>
                </div>
                <div className={styles.row}>
                  <span>Uploaded By</span>
                  <span>{selectedContract.uploadedByEmail}</span>
                </div>
              </div>

              <div className={styles.sectionBlock}>
                <div className={styles.sectionLabel}>Metadata</div>
                {quickMetadata.map((item) => (
                  <div key={item.label} className={styles.row}>
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </aside>

            {/* ── Tab Column ── */}
            <div className={styles.tabColumn}>
              <div
                className={styles.tabHeader}
                role="tablist"
                aria-label="Contract details sections"
                onKeyDown={handleTabKeyDown}
              >
                {tabs.map((tab) => {
                  const selected = activeTab === tab.id
                  const showTabUnreadDot = tab.id === 'activity' && hasUnreadActivity && !selected

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
                      onClick={() => handleTabChange(tab.id)}
                    >
                      <span className={styles.tabLabelWithDot}>
                        {tab.label}
                        {showTabUnreadDot ? <span className={styles.unreadDot} aria-label="Unread activity" /> : null}
                      </span>
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
                        <span>
                          {counterparties.length > 0
                            ? counterparties.map((counterparty) => counterparty.counterpartyName).join(', ')
                            : (selectedContract.counterpartyName ?? '—')}
                        </span>
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
                        {isIntakeOpen ? '▾' : '▸'} Intake Details
                      </button>
                      {isIntakeOpen ? (
                        <div id="intake-details-panel" className={styles.accordionBody}>
                          <div className={styles.row}>
                            <span>Counterparty Signatory Name</span>
                            <span>{selectedContract.signatoryName ?? '—'}</span>
                          </div>
                          <div className={styles.row}>
                            <span>Counterparty Signatory Designation</span>
                            <span>{selectedContract.signatoryDesignation ?? '—'}</span>
                          </div>
                          <div className={styles.row}>
                            <span>Counterparty Signatory Email</span>
                            <span>{selectedContract.signatoryEmail ?? '—'}</span>
                          </div>
                          <div className={styles.row}>
                            <span>Background</span>
                            <span className={styles.multilineValue}>{selectedContract.backgroundOfRequest ?? '—'}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {canManageLegalWorkSharing && (
                      <div className={styles.card}>
                        <div className={styles.sectionTitle}>Legal Work Sharing</div>
                        <div className={styles.inlineForm}>
                          <input
                            type="email"
                            className={styles.input}
                            placeholder="owner@nxtwave.co.in"
                            value={ownerEmail}
                            onChange={(event) => setOwnerEmail(event.target.value)}
                          />
                          <button
                            type="button"
                            className={styles.button}
                            disabled={isMutating || isSettingOwner || isAddingCollaborator}
                            onClick={() => void handleSetOwner()}
                          >
                            <span className={styles.buttonContent}>
                              {isSettingOwner ? <Spinner size={14} /> : null}
                              {isSettingOwner ? 'Setting Owner…' : 'Set Owner'}
                            </span>
                          </button>
                        </div>
                        <div className={styles.inlineForm}>
                          <input
                            type="email"
                            className={styles.input}
                            placeholder="collaborator@nxtwave.co.in"
                            value={collaboratorEmail}
                            onChange={(event) => setCollaboratorEmail(event.target.value)}
                          />
                          <button
                            type="button"
                            className={styles.button}
                            disabled={isMutating || isSettingOwner || isAddingCollaborator}
                            onClick={() => void handleAddCollaborator()}
                          >
                            <span className={styles.buttonContent}>
                              {isAddingCollaborator ? <Spinner size={14} /> : null}
                              {isAddingCollaborator ? 'Adding Collaborator…' : 'Add Collaborator'}
                            </span>
                          </button>
                        </div>
                        <div className={styles.timeline}>
                          {legalCollaborators.length === 0 ? (
                            <div className={styles.eventMeta}>No collaborators assigned.</div>
                          ) : (
                            legalCollaborators.map((collaborator) => (
                              <div key={collaborator.id} className={styles.event}>
                                <div>{collaborator.collaboratorEmail}</div>
                                <button
                                  type="button"
                                  className={`${styles.button} ${styles.buttonGhost}`}
                                  disabled={isMutating}
                                  onClick={() => void handleRemoveCollaborator(collaborator.collaboratorEmail)}
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {(session.role === 'LEGAL_TEAM' || session.role === 'ADMIN') && (
                      <>
                        <div className={styles.card}>
                          <div className={styles.sectionTitle}>Signatories</div>
                          {selectedContract.status === contractStatuses.completed ? (
                            <div className={styles.inlineForm}>
                              <button
                                type="button"
                                className={styles.button}
                                disabled={!selectedContractId}
                                onClick={() => setIsPrepareForSigningOpen(true)}
                              >
                                Prepare for Signing
                              </button>
                            </div>
                          ) : (
                            <div className={styles.eventMeta}>Sign is available only after COMPLETED.</div>
                          )}
                          <div className={styles.timeline}>
                            {signatories.map((signatory) => (
                              <div key={signatory.id} className={styles.event}>
                                <div>
                                  {signatory.signatoryEmail} · {signatory.recipientType} · Step {signatory.routingOrder}
                                </div>
                                <div className={styles.eventMeta}>{signatory.status}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'activity' && (
                  <div className={styles.tabSection}>
                    <div className={styles.card}>
                      <div className={styles.sectionHeaderRow}>
                        <div className={styles.sectionTitle}>Logs Timeline</div>
                        {(session.role === 'LEGAL_TEAM' || session.role === 'ADMIN' || session.role === 'HOD') && (
                          <button
                            type="button"
                            className={`${styles.button} ${styles.buttonGhost}`}
                            onClick={() => setIsActivityComposerOpen((current) => !current)}
                          >
                            {isActivityComposerOpen ? 'Cancel' : '+ Add'}
                          </button>
                        )}
                      </div>

                      {isActivityComposerOpen ? (
                        <div className={styles.activityComposer}>
                          <textarea
                            className={styles.textarea}
                            placeholder="Discuss this contract. Use @email to tag someone."
                            value={activityMessageText}
                            onChange={(event) => setActivityMessageText(event.target.value)}
                            rows={3}
                          />
                          <div className={styles.activityComposerActions}>
                            <button
                              type="button"
                              className={styles.button}
                              disabled={isSubmittingActivity || isMutating}
                              onClick={() => void handleAddActivityMessage()}
                            >
                              {isSubmittingActivity ? 'Posting…' : 'Post'}
                            </button>
                          </div>
                        </div>
                      ) : null}

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
                          className={`${styles.button} ${styles.buttonGhost}`}
                          onClick={() => setShowAllLogs((current) => !current)}
                          style={{ marginTop: 8 }}
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
                  <ContractDocumentsPanel
                    contractId={selectedContract.id}
                    contractStatus={selectedContract.status}
                    userRole={session.role}
                    currentDocumentId={selectedContract.currentDocumentId}
                    documents={documents}
                    defaultUploaderEmail={selectedContract.uploadedByEmail}
                    onPreviewDocument={(document) => void handleViewDocument(document)}
                    onDownloadDocument={(document) => void handleDownload(document)}
                    onRefreshDocuments={async () => {
                      await loadContractContext(selectedContract.id)
                    }}
                  />
                )}

                {activeTab === 'approvals' && (
                  <ApprovalsTab
                    contract={selectedContract}
                    approvers={approvers}
                    isMutating={isMutating}
                    canManageApprovals={session.role === 'LEGAL_TEAM' || session.role === 'ADMIN'}
                    approverEmail={approverEmail}
                    onApproverEmailChange={setApproverEmail}
                    onAddApprover={handleAddApprover}
                    onRemindApprover={handleRemindApprover}
                  />
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

      {remarkActionItem ? (
        <div className={styles.actionRemarkOverlay} role="dialog" aria-modal="true" aria-label="Provide action remarks">
          <div className={styles.actionRemarkModal}>
            <div className={styles.sectionTitle}>Remarks Required</div>
            <div className={styles.eventMeta}>Provide remarks for: {remarkActionItem.label}</div>
            <textarea
              className={styles.textarea}
              value={remarkDraft}
              onChange={(event) => setRemarkDraft(event.target.value)}
              rows={4}
              placeholder="Enter remarks"
              autoFocus
            />
            <div className={styles.actionRemarkActions}>
              <button
                type="button"
                className={styles.button}
                onClick={closeRemarkDialog}
                disabled={Boolean(activeAction)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => {
                  void submitRemarkDialog()
                }}
                disabled={Boolean(activeAction)}
              >
                {activeAction === remarkActionItem.action ? (
                  <span className={styles.buttonContent}>
                    <Spinner size={14} />
                    Processing…
                  </span>
                ) : (
                  'Submit Remarks'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmActionItem ? (
        <div className={styles.actionRemarkOverlay} role="dialog" aria-modal="true" aria-label="Confirm action">
          <div className={styles.actionRemarkModal}>
            <div className={styles.sectionTitle}>Confirm Action</div>
            <div className={styles.eventMeta}>Are you sure you want to proceed with: {confirmActionItem.label}?</div>
            <div className={styles.actionRemarkActions}>
              <button
                type="button"
                className={styles.button}
                onClick={closeConfirmDialog}
                disabled={Boolean(activeAction)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => {
                  void submitConfirmDialog()
                }}
                disabled={Boolean(activeAction)}
              >
                {activeAction === confirmActionItem.action ? (
                  <span className={styles.buttonContent}>
                    <Spinner size={14} />
                    Processing…
                  </span>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedContractId && selectedContract && signingPreviewUrl ? (
        <PrepareForSigningModal
          isOpen={isPrepareForSigningOpen}
          contractId={selectedContractId}
          contractStatus={selectedContract.status}
          pdfUrl={signingPreviewUrl}
          onClose={() => setIsPrepareForSigningOpen(false)}
          onSent={(contractView) => void handleSigningPrepared(contractView)}
        />
      ) : null}
    </div>
  )
}
