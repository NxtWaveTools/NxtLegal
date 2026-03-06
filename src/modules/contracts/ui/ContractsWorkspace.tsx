'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  contractsClient,
  type ContractAllowedAction,
  type ContractDocument,
  type ContractDetailResponse,
  type ContractRecord,
  type ContractSigningPreparationDraft,
  type ContractTimelineEvent,
} from '@/core/client/contracts-client'
import { publicConfig } from '@/core/config/public-config'
import {
  getContractSignatoryRecipientTypeLabel,
  contractDocumentKinds,
  contractLegalAssignmentEditableStatuses,
  contractStatuses,
  contractTransitionActions,
} from '@/core/constants/contracts'
import Spinner from '@/components/ui/Spinner'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import ContractDocumentsPanel from '@/modules/contracts/ui/ContractDocumentsPanel'
import ApprovalsTab from '@/modules/contracts/ui/ApprovalsTab'
import { formatContractLogEvents, isContractNoteEvent } from '@/modules/contracts/ui/formatContractLogEvent'
import { triggerContractStatusConfetti } from '@/modules/contracts/ui/contract-status-confetti'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import styles from './contracts-workspace.module.css'

const PrepareForSigningModal = dynamic(() => import('@/modules/contracts/ui/PrepareForSigningModal'), {
  ssr: false,
})

const htmlPreviewExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'tsv', 'txt'])
const defaultDomain = publicConfig.auth.allowedDomains[0] ?? 'example.com'
const collaboratorEmailPlaceholder = `legalmember@${defaultDomain}`
const defaultPrepareForSigningRecipients = [
  {
    name: 'Rahul Attuluri',
    email: 'rahul@nxtwave.tech',
    recipientType: 'INTERNAL' as const,
    routingOrder: 1,
  },
  {
    name: 'Anupam Pedarla',
    email: 'anupam@nxtwave.tech',
    recipientType: 'INTERNAL' as const,
    routingOrder: 1,
  },
  {
    name: 'Sashank Reddy Gujjula',
    email: 'sashank@nxtwave.tech',
    recipientType: 'INTERNAL' as const,
    routingOrder: 1,
  },
]

const resolveFileExtension = (fileName: string): string => {
  const normalizedName = fileName.trim().toLowerCase()
  const lastDotIndex = normalizedName.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return ''
  }

  return normalizedName.slice(lastDotIndex + 1)
}

const copyTextToClipboard = async (value: string): Promise<boolean> => {
  const text = value.trim()
  if (!text) {
    return false
  }

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback for browsers/contexts that block Clipboard API (Safari, permission-restricted windows).
    }
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.top = '0'
  textArea.style.left = '-9999px'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)

  const selection = document.getSelection()
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null

  textArea.focus()
  textArea.select()
  textArea.setSelectionRange(0, textArea.value.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    document.body.removeChild(textArea)

    if (selection) {
      selection.removeAllRanges()
      if (originalRange) {
        selection.addRange(originalRange)
      }
    }

    activeElement?.focus()
  }

  return copied
}

type ContractsWorkspaceProps = {
  session: {
    employeeId: string
    role?: string
  }
  initialContractId?: string
}

export default function ContractsWorkspace({ session, initialContractId }: ContractsWorkspaceProps) {
  type TabId = 'overview' | 'activity' | 'notes' | 'documents' | 'approvals' | 'signed-docs'

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
  const [signingDraftRecipients, setSigningDraftRecipients] = useState<ContractSigningPreparationDraft['recipients']>(
    []
  )
  const [documents, setDocuments] = useState<ContractDocument[]>([])
  const [noteText, setNoteText] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [collaboratorEmail, setCollaboratorEmail] = useState('')
  const [activityMessageText, setActivityMessageText] = useState('')
  const [legalEffectiveDate, setLegalEffectiveDate] = useState('')
  const [legalTerminationDate, setLegalTerminationDate] = useState('')
  const [legalNoticePeriod, setLegalNoticePeriod] = useState('')
  const [legalAutoRenewal, setLegalAutoRenewal] = useState<'unknown' | 'yes' | 'no'>('unknown')
  const [isGeneratingLinkFor, setIsGeneratingLinkFor] = useState<string | null>(null)
  const [copiedSigningLinkFor, setCopiedSigningLinkFor] = useState<string | null>(null)
  const [generatedSigningLinksByEmail, setGeneratedSigningLinksByEmail] = useState<Record<string, string>>({})
  const [isDownloadingFinalSignedDoc, setIsDownloadingFinalSignedDoc] = useState(false)
  const [isDownloadingCompletionCertificate, setIsDownloadingCompletionCertificate] = useState(false)
  const [isDownloadingMergedArtifact, setIsDownloadingMergedArtifact] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [isActivityComposerOpen, setIsActivityComposerOpen] = useState(false)
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false)
  const [isAddingCollaborator, setIsAddingCollaborator] = useState(false)
  const [isMarkingActivitySeen, setIsMarkingActivitySeen] = useState(false)
  const [isSavingLegalMetadata, setIsSavingLegalMetadata] = useState(false)
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
  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [totalContracts, setTotalContracts] = useState(0)
  const knownContractStatusesRef = useRef<Map<string, ContractRecord['status']>>(new Map())
  const executedCelebratedContractIdsRef = useRef<Set<string>>(new Set())
  const pendingCompletedCelebrationContractIdRef = useRef<string | null>(null)
  const copiedSigningLinkResetTimerRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canViewSignedDocsTab = session.role === 'LEGAL_TEAM' || session.role === 'ADMIN'
  const tabs = useMemo(
    () =>
      [
        { id: 'overview', label: 'Overview' },
        { id: 'activity', label: 'Activity' },
        { id: 'notes', label: 'Notes' },
        { id: 'documents', label: 'Documents' },
        { id: 'approvals', label: 'Approvals' },
        ...(canViewSignedDocsTab ? [{ id: 'signed-docs', label: 'Signed Docs' }] : []),
      ] as Array<{ id: TabId; label: string }>,
    [canViewSignedDocsTab]
  )

  const PAGE_SIZE = 15

  const upsertContractInSidebarList = useCallback((contract: ContractRecord) => {
    setContracts((current) => {
      const existingIndex = current.findIndex((item) => item.id === contract.id)

      if (existingIndex === -1) {
        return [contract, ...current]
      }

      const next = [...current]
      next[existingIndex] = { ...next[existingIndex], ...contract }
      return next
    })
  }, [])

  const loadContracts = useCallback(async (cursor?: string) => {
    const response = await contractsClient.list({ cursor, limit: PAGE_SIZE })

    if (!response.ok || !response.data) {
      toast.error(response.error?.message ?? 'Failed to load contracts')
      if (!cursor) {
        setContracts([])
      }
      return
    }

    const { contracts: newContracts, pagination } = response.data

    setContracts((prev) => {
      if (!cursor) {
        const mergedFirstPage = [...newContracts]

        for (const existingContract of prev) {
          if (!mergedFirstPage.some((contract) => contract.id === existingContract.id)) {
            mergedFirstPage.push(existingContract)
          }
        }

        return mergedFirstPage
      }

      const mergedContracts = [...prev]

      for (const incomingContract of newContracts) {
        const existingIndex = mergedContracts.findIndex((contract) => contract.id === incomingContract.id)

        if (existingIndex === -1) {
          mergedContracts.push(incomingContract)
          continue
        }

        mergedContracts[existingIndex] = {
          ...mergedContracts[existingIndex],
          ...incomingContract,
        }
      }

      return mergedContracts
    })
    setNextCursor(pagination.cursor)
    setHasMore(pagination.cursor !== null)
    setTotalContracts(pagination.total)

    if (!cursor) {
      setSelectedContractId((current) => {
        if (current || newContracts.length === 0) {
          return current
        }
        return newContracts[0].id
      })
    }
  }, [])

  const maybeCelebrateExecutedTransition = useCallback((contract: ContractRecord) => {
    const normalizedCurrentStatus = (contract.status ?? '').toUpperCase()
    const normalizedPreviousStatus = (knownContractStatusesRef.current.get(contract.id) ?? '').toUpperCase()
    const previousStatus = knownContractStatusesRef.current.get(contract.id)
    const hasTransitionedToCompleted =
      previousStatus !== undefined &&
      normalizedPreviousStatus !== contractStatuses.completed &&
      normalizedCurrentStatus === contractStatuses.completed
    const hasTransitionedToExecuted =
      previousStatus !== undefined &&
      normalizedPreviousStatus !== contractStatuses.executed &&
      normalizedCurrentStatus === contractStatuses.executed

    if (hasTransitionedToCompleted && pendingCompletedCelebrationContractIdRef.current === contract.id) {
      triggerContractStatusConfetti()
      pendingCompletedCelebrationContractIdRef.current = null
    }

    if (hasTransitionedToExecuted && !executedCelebratedContractIdsRef.current.has(contract.id)) {
      triggerContractStatusConfetti()
      executedCelebratedContractIdsRef.current.add(contract.id)
    }

    knownContractStatusesRef.current.set(contract.id, contract.status)
  }, [])

  const resetLegalMetadataDraft = () => {
    setLegalEffectiveDate('')
    setLegalTerminationDate('')
    setLegalNoticePeriod('')
    setLegalAutoRenewal('unknown')
  }

  const applyContractView = (contractView: ContractDetailResponse) => {
    maybeCelebrateExecutedTransition(contractView.contract)
    setSelectedContract(contractView.contract)
    setLegalEffectiveDate(contractView.contract.legalEffectiveDate ?? '')
    setLegalTerminationDate(contractView.contract.legalTerminationDate ?? '')
    setLegalNoticePeriod(contractView.contract.legalNoticePeriod ?? '')
    setLegalAutoRenewal(
      contractView.contract.legalAutoRenewal === true
        ? 'yes'
        : contractView.contract.legalAutoRenewal === false
          ? 'no'
          : 'unknown'
    )
    setCounterparties(contractView.counterparties ?? [])
    setDocuments(contractView.documents ?? [])
    setAvailableActions(contractView.availableActions)
    setApprovers(contractView.additionalApprovers)
    setLegalCollaborators(contractView.legalCollaborators)
    setSignatories(contractView.signatories ?? [])
  }

  const syncContractReadState = useCallback((contractId: string, hasUnreadActivity: boolean) => {
    setContracts((current) =>
      current.map((contract) => (contract.id === contractId ? { ...contract, hasUnreadActivity } : contract))
    )
  }, [])

  const loadContractContext = useCallback(
    async (contractId: string) => {
      const [detailResponse, timelineResponse, signingDraftResponse] = await Promise.all([
        contractsClient.detail(contractId),
        contractsClient.timeline(contractId),
        contractsClient.getSigningPreparationDraft(contractId),
      ])

      if (!detailResponse.ok || !detailResponse.data?.contract) {
        toast.error(detailResponse.error?.message ?? 'Failed to load contract detail')
        setSelectedContract(null)
        resetLegalMetadataDraft()
        setTimeline([])
        setCounterparties([])
        setDocuments([])
        setAvailableActions([])
        setApprovers([])
        setLegalCollaborators([])
        setSignatories([])
        setSigningDraftRecipients([])
        return
      }

      applyContractView(detailResponse.data)
      upsertContractInSidebarList(detailResponse.data.contract)
      if (signingDraftResponse.ok) {
        setSigningDraftRecipients(signingDraftResponse.data?.recipients ?? [])
      } else {
        setSigningDraftRecipients([])
      }

      if (timelineResponse.ok && timelineResponse.data) {
        setTimeline(timelineResponse.data.events)
      } else {
        setTimeline([])
      }
    },
    [upsertContractInSidebarList]
  )

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true)
      await loadContracts()
      setIsLoading(false)
    }

    void bootstrap()
  }, [loadContracts])

  useEffect(() => {
    return () => {
      if (copiedSigningLinkResetTimerRef.current) {
        window.clearTimeout(copiedSigningLinkResetTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!canViewSignedDocsTab && activeTab === 'signed-docs') {
      setActiveTab('overview')
    }
  }, [activeTab, canViewSignedDocsTab])

  useEffect(() => {
    setGeneratedSigningLinksByEmail({})
    setCopiedSigningLinkFor(null)
  }, [selectedContractId])

  useEffect(() => {
    if (!selectedContractId) {
      return
    }

    let isCancelled = false

    const loadSelectedContract = async () => {
      setIsContractContextLoading(true)
      const [detailResponse, timelineResponse, signingDraftResponse] = await Promise.all([
        contractsClient.detail(selectedContractId),
        contractsClient.timeline(selectedContractId),
        contractsClient.getSigningPreparationDraft(selectedContractId),
      ])

      if (isCancelled) {
        return
      }

      if (!detailResponse.ok || !detailResponse.data?.contract) {
        toast.error(detailResponse.error?.message ?? 'Failed to load contract detail')
        setSelectedContract(null)
        resetLegalMetadataDraft()
        setTimeline([])
        setCounterparties([])
        setDocuments([])
        setAvailableActions([])
        setApprovers([])
        setLegalCollaborators([])
        setSignatories([])
        setSigningDraftRecipients([])
        setIsContractContextLoading(false)
        return
      }

      applyContractView(detailResponse.data)
      upsertContractInSidebarList(detailResponse.data.contract)
      if (signingDraftResponse.ok) {
        setSigningDraftRecipients(signingDraftResponse.data?.recipients ?? [])
      } else {
        setSigningDraftRecipients([])
      }

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
  }, [selectedContractId, upsertContractInSidebarList])

  const selectContract = (contractId: string) => {
    setIsContractContextLoading(true)
    setSelectedContractId(contractId)
    setSigningDraftRecipients([])
    setActiveTab('overview')
    setIsIntakeOpen(false)
    setIsPrepareForSigningOpen(false)
    setExpandedLogIds(new Set())
    setShowAllLogs(false)
  }

  const handleTabChange = useCallback(
    (tabId: TabId) => {
      setActiveTab(tabId)

      if ((tabId === 'documents' || tabId === 'signed-docs') && selectedContractId) {
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
      try {
        let shouldTriggerCelebration = false

        const response = await contractsClient.action(selectedContractId, {
          action: actionItem.action,
          noteText: remark,
        })

        if (response.ok !== true) {
          toast.error(response.error?.message ?? `Failed to apply ${actionItem.label}`, { id: loadingToastId })
          return false
        }

        if (response.data) {
          const normalizedStatus = (response.data.contract.status ?? '').toUpperCase()
          applyContractView(response.data)

          if (normalizedStatus === contractStatuses.completed) {
            shouldTriggerCelebration = true
            pendingCompletedCelebrationContractIdRef.current = null
          } else {
            pendingCompletedCelebrationContractIdRef.current = selectedContractId
          }
        }

        await loadContracts()
        await loadContractContext(selectedContractId)
        router.refresh()
        toast.success(`${actionItem.label} completed successfully`, { id: loadingToastId })

        if (shouldTriggerCelebration) {
          window.setTimeout(() => {
            triggerContractStatusConfetti()
          }, 220)
        }

        return true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : `Failed to apply ${actionItem.label}`
        toast.error(errorMessage, { id: loadingToastId })
        return false
      } finally {
        setActiveAction(null)
      }
    },
    [loadContractContext, loadContracts, router, selectedContractId]
  )

  const executeAction = async (actionItem: ContractAllowedAction) => {
    if (!selectedContractId) {
      return
    }

    if (actionItem.action.includes('approve')) {
      setConfirmActionItem(actionItem)
      return
    }

    if (actionItem.requiresRemark) {
      setRemarkActionItem(actionItem)
      setRemarkDraft('')
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
      toast.error('Remarks are required for this action')
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
      toast.error(response.error?.message ?? 'Failed to generate download link')
      return
    }

    window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadFinalSignedDocument = async () => {
    if (!selectedContractId) {
      return
    }

    setIsDownloadingFinalSignedDoc(true)
    const response = await contractsClient.downloadFinalSigningArtifact(selectedContractId, 'signed_document')
    if (!response.ok || !response.data) {
      toast.error(response.error?.message ?? 'Failed to download final signed document')
      setIsDownloadingFinalSignedDoc(false)
      return
    }

    if (response.data.signedUrl) {
      window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
      setIsDownloadingFinalSignedDoc(false)
      return
    }

    if (!response.data.blob) {
      toast.error('Failed to download final signed document')
      setIsDownloadingFinalSignedDoc(false)
      return
    }

    triggerBlobDownload(response.data.blob, response.data.fileName)
    setIsDownloadingFinalSignedDoc(false)
  }

  const handleDownloadCompletionCertificate = async () => {
    if (!selectedContractId) {
      return
    }

    setIsDownloadingCompletionCertificate(true)
    const response = await contractsClient.downloadFinalSigningArtifact(selectedContractId, 'completion_certificate')
    if (!response.ok || !response.data) {
      toast.error(response.error?.message ?? 'Failed to download completion certificate')
      setIsDownloadingCompletionCertificate(false)
      return
    }

    if (response.data.signedUrl) {
      window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
      setIsDownloadingCompletionCertificate(false)
      return
    }

    if (!response.data.blob) {
      toast.error('Failed to download completion certificate')
      setIsDownloadingCompletionCertificate(false)
      return
    }

    triggerBlobDownload(response.data.blob, response.data.fileName)
    setIsDownloadingCompletionCertificate(false)
  }

  const handleDownloadMergedSigningArtifact = async () => {
    if (!selectedContractId) {
      return
    }

    setIsDownloadingMergedArtifact(true)
    const response = await contractsClient.downloadFinalSigningArtifact(selectedContractId, 'merged_pdf')
    if (!response.ok || !response.data) {
      toast.error(response.error?.message ?? 'Failed to download merged signed artifact')
      setIsDownloadingMergedArtifact(false)
      return
    }

    if (response.data.signedUrl) {
      window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
      setIsDownloadingMergedArtifact(false)
      return
    }

    if (!response.data.blob) {
      toast.error('Failed to download merged signed artifact')
      setIsDownloadingMergedArtifact(false)
      return
    }

    triggerBlobDownload(response.data.blob, response.data.fileName)
    setIsDownloadingMergedArtifact(false)
  }

  const handleViewDocument = async (document?: ContractDocument) => {
    if (!selectedContractId) {
      return
    }

    const response = await contractsClient.download(selectedContractId, {
      documentId: document?.id,
    })

    if (!response.ok || !response.data?.signedUrl) {
      toast.error(response.error?.message ?? 'Failed to generate document view link')
      return
    }

    const resolvedFileName =
      response.data.fileName ?? document?.displayName ?? selectedContract?.fileName ?? 'Contract document'
    const resolvedMimeType = (document?.fileMimeType ?? '').trim().toLowerCase()
    const resolvedExtension = resolveFileExtension(resolvedFileName)
    const isDocx =
      resolvedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      resolvedExtension === 'docx'
    const isSpreadsheet =
      resolvedExtension === 'xls' ||
      resolvedExtension === 'xlsx' ||
      resolvedMimeType.includes('spreadsheetml') ||
      resolvedMimeType.includes('ms-excel')
    const isTextPreview =
      resolvedExtension === 'csv' ||
      resolvedExtension === 'tsv' ||
      resolvedExtension === 'txt' ||
      resolvedMimeType.startsWith('text/') ||
      resolvedMimeType.includes('csv')
    const isPresentation =
      resolvedExtension === 'ppt' ||
      resolvedExtension === 'pptx' ||
      resolvedMimeType.includes('ms-powerpoint') ||
      resolvedMimeType.includes('presentationml')
    const isLegacyDoc = resolvedExtension === 'doc' || resolvedMimeType.includes('application/msword')
    const renderAsHtml =
      isDocx ||
      isLegacyDoc ||
      isPresentation ||
      isSpreadsheet ||
      isTextPreview ||
      htmlPreviewExtensions.has(resolvedExtension)

    const previewUrl = contractsClient.previewUrl(selectedContractId, {
      documentId: document?.id,
      renderAs: renderAsHtml ? 'html' : 'binary',
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

  const triggerBlobDownload = useCallback((blob: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
    }, 0)
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
      toast.error(response.error?.message ?? 'Failed to add note')
      return
    }

    setNoteText('')
    applyContractView(response.data)
    await loadContractContext(selectedContractId)
    router.refresh()
  }

  const handleAddApprover = async () => {
    if (!selectedContractId) {
      throw new Error('No contract selected')
    }

    if (!approverEmail.trim()) {
      throw new Error('Approver email is required')
    }

    setIsMutating(true)
    const response = await contractsClient.addApprover(selectedContractId, {
      approverEmail: approverEmail.trim().toLowerCase(),
    })
    setIsMutating(false)

    if (!response.ok || !response.data) {
      throw new Error(response.error?.message ?? 'Failed to add additional approver')
    }

    setApproverEmail('')
    applyContractView(response.data)
  }

  const handleGenerateSigningLink = async (recipientEmail: string, recipientType: string) => {
    if (!selectedContractId) {
      return
    }

    if (recipientType !== 'INTERNAL') {
      setError('Signing link can only be generated for Nxtwave recipients')
      return
    }
    setIsGeneratingLinkFor(recipientEmail)
    try {
      const normalizedRecipientEmail = recipientEmail.trim().toLowerCase()
      const response = await fetch(
        `/api/contracts/${selectedContractId}/signatories/link?email=${encodeURIComponent(normalizedRecipientEmail)}`,
        { method: 'GET' }
      )
      const json = await response.json()
      if (!response.ok || !json?.ok || !json.data?.signing_url) {
        throw new Error(json?.error?.message ?? 'Failed to generate signing link')
      }
      const signingUrl = String(json.data.signing_url).trim()
      setGeneratedSigningLinksByEmail((current) => ({
        ...current,
        [normalizedRecipientEmail]: signingUrl,
      }))
      setError(null)

      const copied = await copyTextToClipboard(signingUrl)
      if (copied) {
        setCopiedSigningLinkFor(normalizedRecipientEmail)
        if (copiedSigningLinkResetTimerRef.current) {
          window.clearTimeout(copiedSigningLinkResetTimerRef.current)
        }
        copiedSigningLinkResetTimerRef.current = window.setTimeout(() => {
          setCopiedSigningLinkFor((current) => (current === normalizedRecipientEmail ? null : current))
        }, 2000)
      } else {
        setCopiedSigningLinkFor(null)
        setError('Signing link generated. Clipboard copy failed, copy the link shown below.')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate signing link')
    } finally {
      setIsGeneratingLinkFor(null)
    }
  }

  const handleRemindApprover = async (approverEmailToRemind?: string) => {
    if (!selectedContractId) {
      throw new Error('No contract selected')
    }

    setIsMutating(true)
    const response = await contractsClient.remindApprover(selectedContractId, {
      approverEmail: approverEmailToRemind,
    })
    setIsMutating(false)

    if (!response.ok) {
      throw new Error(response.error?.message ?? 'Failed to send reminder')
    }
  }

  const handleBypassApprover = async (approverId: string, reason: string) => {
    if (!selectedContractId) {
      throw new Error('No contract selected')
    }

    setIsMutating(true)
    const response = await contractsClient.action(selectedContractId, {
      action: 'BYPASS_APPROVAL',
      approverId,
      reason: reason.trim(),
    })
    setIsMutating(false)

    if (!response.ok || !response.data) {
      throw new Error(response.error?.message ?? 'Failed to bypass approval')
    }

    applyContractView(response.data)
    await loadContractContext(selectedContractId)
    await loadContracts()
    router.refresh()
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
      toast.error(response.error?.message ?? 'Failed to remove legal collaborator')
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
      toast.error(response.error?.message ?? 'Failed to post activity message')
      return
    }

    setActivityMessageText('')
    setIsActivityComposerOpen(false)
    applyContractView(response.data)
    await loadContractContext(selectedContractId)
    await loadContracts()
    syncContractReadState(selectedContractId, false)
  }

  const handleSaveLegalMetadata = async () => {
    if (!selectedContractId || session.role !== 'LEGAL_TEAM' || isSavingLegalMetadata) {
      return
    }

    setIsSavingLegalMetadata(true)

    const response = await contractsClient.updateLegalMetadata(selectedContractId, {
      effectiveDate: legalEffectiveDate.trim() ? legalEffectiveDate : null,
      terminationDate: legalTerminationDate.trim() ? legalTerminationDate : null,
      noticePeriod: legalNoticePeriod.trim() ? legalNoticePeriod.trim() : null,
      autoRenewal: legalAutoRenewal === 'yes' ? true : legalAutoRenewal === 'no' ? false : null,
    })

    setIsSavingLegalMetadata(false)

    if (!response.ok || !response.data) {
      toast.error(response.error?.message ?? 'Failed to save legal metadata')
      return
    }

    applyContractView(response.data)
    toast.success('Legal metadata saved')
  }

  const handleAddCollaboratorSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleAddCollaborator()
  }

  const handleAddNoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleAddNote()
  }

  const handleAddActivitySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleAddActivityMessage()
  }

  const handleLegalMetadataSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleSaveLegalMetadata()
  }

  const handleRemarkDialogSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitRemarkDialog()
  }

  const noteEvents = useMemo(() => timeline.filter((event) => isContractNoteEvent(event)), [timeline])
  const timelineById = useMemo(() => new Map(timeline.map((event) => [event.id, event])), [timeline])
  const selectedCurrentDocumentId = selectedContract?.currentDocumentId
  const signingPreviewDocument = useMemo(() => {
    const primaryDocuments = documents.filter((document) => document.documentKind === 'PRIMARY')
    const orderedPrimaryDocuments = [...primaryDocuments].sort(
      (first, second) => (second.versionNumber ?? 0) - (first.versionNumber ?? 0)
    )

    const isPdfDocument = (document: (typeof documents)[number]) =>
      document.fileMimeType.toLowerCase().includes('pdf') || document.fileName.toLowerCase().endsWith('.pdf')

    if (selectedCurrentDocumentId) {
      const currentDocument = primaryDocuments.find((document) => document.id === selectedCurrentDocumentId)
      if (currentDocument && isPdfDocument(currentDocument)) {
        return currentDocument
      }
    }

    const latestPrimaryPdf = orderedPrimaryDocuments.find(isPdfDocument)
    if (latestPrimaryPdf) {
      return latestPrimaryPdf
    }

    return null
  }, [documents, selectedCurrentDocumentId])
  const signingPreviewUrl = useMemo(() => {
    if (!selectedContractId || !signingPreviewDocument?.id) {
      return ''
    }

    return contractsClient.previewUrl(selectedContractId, {
      documentId: signingPreviewDocument.id,
      renderAs: 'binary',
    })
  }, [selectedContractId, signingPreviewDocument?.id])
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
  const orderedSignatories = useMemo(
    () =>
      [...signatories].sort((left, right) => {
        if (left.routingOrder !== right.routingOrder) {
          return left.routingOrder - right.routingOrder
        }
        return left.signatoryEmail.localeCompare(right.signatoryEmail)
      }),
    [signatories]
  )
  const intakeCounterparties = useMemo(() => {
    type IntakeCounterparty = {
      counterpartyName: string
      backgroundOfRequest: string
      budgetApproved: boolean | null
      signatories: Array<{
        name: string
        designation: string
        email: string
      }>
    }

    const externalDraftRecipients = [...signingDraftRecipients]
      .filter((recipient) => recipient.recipientType === 'EXTERNAL')
      .sort((left, right) => {
        if (left.routingOrder !== right.routingOrder) {
          return left.routingOrder - right.routingOrder
        }
        return left.email.localeCompare(right.email)
      })
      .map((recipient) => ({
        name: recipient.name.trim(),
        designation: recipient.designation?.trim() ?? '',
        email: recipient.email.trim(),
        counterpartyName: recipient.counterpartyName?.trim() ?? '',
        backgroundOfRequest: recipient.backgroundOfRequest?.trim() ?? '',
        budgetApproved: typeof recipient.budgetApproved === 'boolean' ? recipient.budgetApproved : null,
      }))

    const normalizedCounterparties = counterparties
      .map((counterparty) => counterparty.counterpartyName?.trim() ?? '')
      .filter((counterpartyName) => counterpartyName.length > 0)

    if (normalizedCounterparties.length === 0) {
      return [] as IntakeCounterparty[]
    }

    const signatoriesByCounterparty = normalizedCounterparties.map(
      () =>
        [] as Array<{
          name: string
          designation: string
          email: string
          backgroundOfRequest: string
          budgetApproved: boolean | null
        }>
    )
    const unmatchedSignatories: Array<{
      name: string
      designation: string
      email: string
      backgroundOfRequest: string
      budgetApproved: boolean | null
    }> = []

    const normalizedCounterpartyNameByIndex = normalizedCounterparties.map((name) => name.toLowerCase())
    for (const signatory of externalDraftRecipients) {
      if (!signatory.counterpartyName) {
        unmatchedSignatories.push(signatory)
        continue
      }
      const matchedCounterpartyIndex = normalizedCounterpartyNameByIndex.findIndex(
        (counterpartyName) => counterpartyName === signatory.counterpartyName.toLowerCase()
      )
      if (matchedCounterpartyIndex === -1) {
        unmatchedSignatories.push(signatory)
        continue
      }
      signatoriesByCounterparty[matchedCounterpartyIndex]?.push(signatory)
    }

    for (const [index, signatory] of unmatchedSignatories.entries()) {
      const targetCounterpartyIndex = Math.min(index, signatoriesByCounterparty.length - 1)
      signatoriesByCounterparty[targetCounterpartyIndex]?.push(signatory)
    }

    return normalizedCounterparties.map((counterpartyName, index) => {
      const mappedSignatories = signatoriesByCounterparty[index] ?? []
      return {
        counterpartyName,
        backgroundOfRequest: mappedSignatories[0]?.backgroundOfRequest ?? '',
        budgetApproved: mappedSignatories[0]?.budgetApproved ?? null,
        signatories: mappedSignatories.map((signatory) => ({
          name: signatory.name,
          designation: signatory.designation,
          email: signatory.email,
        })),
      }
    })
  }, [counterparties, signingDraftRecipients])
  const allSignatoriesSigned = useMemo(
    () => orderedSignatories.length > 0 && orderedSignatories.every((signatory) => signatory.status === 'SIGNED'),
    [orderedSignatories]
  )
  const completionArtifactsByKind = useMemo(() => {
    const executedDocuments = documents
      .filter((document) => document.documentKind === contractDocumentKinds.executedContract)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    const certificateDocuments = documents
      .filter((document) => document.documentKind === contractDocumentKinds.auditCertificate)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

    return {
      executedDocument: executedDocuments[0],
      completionCertificate: certificateDocuments[0],
    }
  }, [documents])
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
    if (session.role !== 'LEGAL_TEAM') {
      return false
    }

    if (!selectedContract?.status) {
      return false
    }

    return contractLegalAssignmentEditableStatuses.includes(
      selectedContract.status as (typeof contractLegalAssignmentEditableStatuses)[number]
    )
  }, [selectedContract, session.role])
  const canManageLegalMetadata = session.role === 'LEGAL_TEAM'
  const selectedContractListRow = useMemo(
    () => contracts.find((contract) => contract.id === selectedContractId) ?? null,
    [contracts, selectedContractId]
  )
  const hasUnreadActivity = Boolean(selectedContractListRow?.hasUnreadActivity)
  const shouldShowDetailShimmer = Boolean(selectedContractId) && (isLoading || isContractContextLoading)

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
        <ErrorBoundary sectionLabel="contract details" resetKey={selectedContractId}>
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

          {shouldShowDetailShimmer ? (
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
          ) : !selectedContract ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>📄</div>
              <div style={{ fontWeight: 600 }}>Select a contract</div>
              <div className={styles.itemMeta}>Choose a contract from the sidebar to view details</div>
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

                {canManageLegalMetadata ? (
                  <div className={styles.sectionBlock}>
                    <div className={styles.sectionLabel}>Legal Metadata</div>
                    <form className={styles.legalMetadataForm} onSubmit={handleLegalMetadataSubmit}>
                      <div className={styles.legalMetadataField}>
                        <span>Effective Date</span>
                        <input
                          type="date"
                          className={styles.input}
                          value={legalEffectiveDate}
                          onChange={(event) => setLegalEffectiveDate(event.target.value)}
                          disabled={isSavingLegalMetadata || isMutating}
                        />
                      </div>
                      <div className={styles.legalMetadataField}>
                        <span>Termination Date</span>
                        <input
                          type="date"
                          className={styles.input}
                          value={legalTerminationDate}
                          onChange={(event) => setLegalTerminationDate(event.target.value)}
                          disabled={isSavingLegalMetadata || isMutating}
                        />
                      </div>
                      <div className={styles.legalMetadataField}>
                        <span>Notice Period</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={legalNoticePeriod}
                          onChange={(event) => setLegalNoticePeriod(event.target.value)}
                          placeholder="e.g. 30 days"
                          disabled={isSavingLegalMetadata || isMutating}
                        />
                      </div>
                      <div className={styles.legalMetadataField}>
                        <span>Auto-renewal</span>
                        <select
                          className={styles.input}
                          value={legalAutoRenewal}
                          onChange={(event) => setLegalAutoRenewal(event.target.value as 'unknown' | 'yes' | 'no')}
                          disabled={isSavingLegalMetadata || isMutating}
                        >
                          <option value="unknown">Not set</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className={styles.button}
                        disabled={isSavingLegalMetadata || isMutating || !selectedContractId}
                      >
                        <span className={styles.buttonContent}>
                          {isSavingLegalMetadata ? <Spinner size={14} /> : null}
                          {isSavingLegalMetadata ? 'Saving…' : 'Save Legal Metadata'}
                        </span>
                      </button>
                    </form>
                  </div>
                ) : null}
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
                            {intakeCounterparties.length === 0 ? (
                              <div className={styles.row}>
                                <span>Counterparties</span>
                                <span>—</span>
                              </div>
                            ) : (
                              intakeCounterparties.map((counterparty, counterpartyIndex) => (
                                <div key={`${counterparty.counterpartyName}-${counterpartyIndex}`}>
                                  <div className={styles.row}>
                                    <span>Counterparty {counterpartyIndex + 1}</span>
                                    <span>{counterparty.counterpartyName}</span>
                                  </div>
                                  {counterparty.signatories.length === 0 ? (
                                    <div className={styles.row}>
                                      <span>Signatories</span>
                                      <span>—</span>
                                    </div>
                                  ) : (
                                    counterparty.signatories.map((signatory, signatoryIndex) => (
                                      <div
                                        key={`${counterparty.counterpartyName}-${counterpartyIndex}-signatory-${signatoryIndex}`}
                                      >
                                        <div className={styles.row}>
                                          <span>
                                            Counterparty {counterpartyIndex + 1} Signatory {signatoryIndex + 1} Name
                                          </span>
                                          <span>{signatory.name || '—'}</span>
                                        </div>
                                        <div className={styles.row}>
                                          <span>
                                            Counterparty {counterpartyIndex + 1} Signatory {signatoryIndex + 1}{' '}
                                            Designation
                                          </span>
                                          <span>{signatory.designation || '—'}</span>
                                        </div>
                                        <div className={styles.row}>
                                          <span>
                                            Counterparty {counterpartyIndex + 1} Signatory {signatoryIndex + 1} Email
                                          </span>
                                          <span>{signatory.email || '—'}</span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                  <div className={styles.row}>
                                    <span>Counterparty {counterpartyIndex + 1} Background</span>
                                    <span className={styles.multilineValue}>
                                      {counterparty.backgroundOfRequest || '—'}
                                    </span>
                                  </div>
                                  <div className={styles.row}>
                                    <span>Counterparty {counterpartyIndex + 1} Budget Approved</span>
                                    <span>
                                      {counterparty.budgetApproved === null
                                        ? '—'
                                        : counterparty.budgetApproved
                                          ? 'Yes'
                                          : 'No'}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>

                      {canManageLegalWorkSharing && (
                        <div className={styles.card}>
                          <div className={styles.sectionTitle}>Legal Work Sharing</div>
                          <form className={styles.inlineForm} onSubmit={handleAddCollaboratorSubmit}>
                            <input
                              type="email"
                              className={styles.input}
                              placeholder={collaboratorEmailPlaceholder}
                              value={collaboratorEmail}
                              onChange={(event) => setCollaboratorEmail(event.target.value)}
                            />
                            <button
                              type="submit"
                              className={styles.button}
                              disabled={isMutating || isAddingCollaborator}
                            >
                              <span className={styles.buttonContent}>
                                {isAddingCollaborator ? <Spinner size={14} /> : null}
                                {isAddingCollaborator ? 'Adding Collaborator…' : 'Add Collaborator'}
                              </span>
                            </button>
                          </form>
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
                            {([contractStatuses.underReview, contractStatuses.completed] as string[]).includes(
                              selectedContract.status
                            ) ? (
                              <div className={styles.inlineForm}>
                                <button
                                  type="button"
                                  className={styles.button}
                                  disabled={!selectedContractId || !signingPreviewDocument}
                                  onClick={() => setIsPrepareForSigningOpen(true)}
                                >
                                  Prepare for Signing
                                </button>
                              </div>
                            ) : (
                              <div className={styles.eventMeta}>
                                Sign is available only in UNDER REVIEW or COMPLETED.
                              </div>
                            )}
                            {([contractStatuses.underReview, contractStatuses.completed] as string[]).includes(
                              selectedContract.status
                            ) && !signingPreviewDocument ? (
                              <div className={styles.eventMeta}>
                                Prepare for Signing requires a PDF primary document.
                              </div>
                            ) : null}
                            <div className={styles.timeline}>
                              {signatories.map((signatory) => {
                                const generatedSigningLink =
                                  generatedSigningLinksByEmail[signatory.signatoryEmail.trim().toLowerCase()]

                                return (
                                  <div key={signatory.id} className={styles.event}>
                                    <div className={styles.signatoryHeader}>
                                      <div>
                                        {signatory.signatoryEmail} ·{' '}
                                        {getContractSignatoryRecipientTypeLabel(signatory.recipientType)} · Step{' '}
                                        {signatory.routingOrder}
                                      </div>
                                      <span
                                        className={`${styles.signatoryStatusBadge} ${
                                          signatory.status === 'SIGNED'
                                            ? styles.signatoryStatusSigned
                                            : styles.signatoryStatusPending
                                        }`}
                                      >
                                        {signatory.status}
                                      </span>
                                    </div>
                                    {signatory.recipientType === 'INTERNAL' ? (
                                      <div className={styles.signatoryActionRow}>
                                        <button
                                          type="button"
                                          className={`${styles.button} ${styles.buttonGhost} ${styles.signatoryLinkButton}`}
                                          disabled={isMutating || isGeneratingLinkFor === signatory.signatoryEmail}
                                          onClick={() =>
                                            void handleGenerateSigningLink(
                                              signatory.signatoryEmail,
                                              signatory.recipientType
                                            )
                                          }
                                        >
                                          {isGeneratingLinkFor === signatory.signatoryEmail
                                            ? 'Generating link...'
                                            : copiedSigningLinkFor === signatory.signatoryEmail.trim().toLowerCase()
                                              ? 'Copied'
                                              : 'Copy Signing Link'}
                                        </button>
                                        <span className={styles.signatoryActionHint}>
                                          {copiedSigningLinkFor === signatory.signatoryEmail.trim().toLowerCase()
                                            ? 'Copied to clipboard'
                                            : 'Generates fresh secure link'}
                                        </span>
                                        {generatedSigningLink ? (
                                          <a
                                            href={generatedSigningLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.signatoryLinkValue}
                                            title={generatedSigningLink}
                                          >
                                            {generatedSigningLink}
                                          </a>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className={styles.signatoryActionHint}>
                                        Signing link available for Nxtwave users.
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === 'activity' && (
                    <div className={`${styles.tabSection} h-full min-h-0`}>
                      <div className={`${styles.card} h-full min-h-0 flex flex-col`}>
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
                          <form className={styles.activityComposer} onSubmit={handleAddActivitySubmit}>
                            <textarea
                              className={styles.textarea}
                              placeholder="Discuss this contract. Use @email to tag someone."
                              value={activityMessageText}
                              onChange={(event) => setActivityMessageText(event.target.value)}
                              rows={3}
                            />
                            <div className={styles.activityComposerActions}>
                              <button
                                type="submit"
                                className={styles.button}
                                disabled={isSubmittingActivity || isMutating}
                              >
                                {isSubmittingActivity ? 'Posting…' : 'Post'}
                              </button>
                            </div>
                          </form>
                        ) : null}

                        <div className={`${styles.logContainer} flex-1 min-h-0 overflow-y-auto`}>
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
                                  <div className={styles.timelineEventHeader}>
                                    <span className={styles.eventCategoryBadge}>
                                      <span aria-hidden="true">{event.categoryIcon}</span>
                                      <span>{event.categoryLabel}</span>
                                    </span>
                                    <div className={styles.eventMeta} title={event.absoluteTimestamp}>
                                      {event.relativeTimestamp}
                                    </div>
                                  </div>
                                  <div className={styles.eventActor}>
                                    <strong>{event.actorLabel}</strong>
                                  </div>
                                  <div>{event.message}</div>
                                  {event.target ? (
                                    <div className={styles.eventTargetEmail}>
                                      Recipient: <strong>{event.target}</strong>
                                    </div>
                                  ) : null}
                                  <div className={styles.eventMeta} title={event.absoluteTimestamp}>
                                    {event.absoluteTimestamp}
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
                        <form className={styles.inlineForm} onSubmit={handleAddNoteSubmit}>
                          <input
                            type="text"
                            className={styles.input}
                            placeholder="Add note"
                            value={noteText}
                            onChange={(event) => setNoteText(event.target.value)}
                          />
                          <button type="submit" className={styles.button} disabled={isMutating}>
                            Add Note
                          </button>
                        </form>
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
                      canBypassApprovals={session.role === 'LEGAL_TEAM' || session.role === 'ADMIN'}
                      approverEmail={approverEmail}
                      onApproverEmailChange={setApproverEmail}
                      onAddApprover={handleAddApprover}
                      onRemindApprover={handleRemindApprover}
                      onBypassApprover={handleBypassApprover}
                    />
                  )}

                  {activeTab === 'signed-docs' && canViewSignedDocsTab && (
                    <div className={styles.tabSection}>
                      <div className={styles.card}>
                        <div className={styles.sectionHeaderRow}>
                          <div className={styles.sectionTitle}>Signed Docs</div>
                          {allSignatoriesSigned ? (
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => void handleDownloadFinalSignedDocument()}
                                disabled={
                                  isDownloadingFinalSignedDoc ||
                                  isDownloadingCompletionCertificate ||
                                  isDownloadingMergedArtifact ||
                                  !selectedContractId
                                }
                              >
                                <span className={styles.buttonContent}>
                                  {isDownloadingFinalSignedDoc ? <Spinner size={14} /> : null}
                                  {isDownloadingFinalSignedDoc ? 'Preparing…' : 'Download Signed Document'}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`${styles.button} ${styles.buttonGhost}`}
                                onClick={() => void handleDownloadCompletionCertificate()}
                                disabled={
                                  isDownloadingCompletionCertificate ||
                                  isDownloadingFinalSignedDoc ||
                                  isDownloadingMergedArtifact ||
                                  !selectedContractId
                                }
                              >
                                <span className={styles.buttonContent}>
                                  {isDownloadingCompletionCertificate ? <Spinner size={14} /> : null}
                                  {isDownloadingCompletionCertificate
                                    ? 'Preparing...'
                                    : 'Download Completion Certificate'}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`${styles.button} ${styles.buttonGhost}`}
                                onClick={() => void handleDownloadMergedSigningArtifact()}
                                disabled={
                                  isDownloadingMergedArtifact ||
                                  isDownloadingCompletionCertificate ||
                                  isDownloadingFinalSignedDoc ||
                                  !selectedContractId
                                }
                              >
                                <span className={styles.buttonContent}>
                                  {isDownloadingMergedArtifact ? <Spinner size={14} /> : null}
                                  {isDownloadingMergedArtifact ? 'Preparing...' : 'Download Combined PDF'}
                                </span>
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {orderedSignatories.length === 0 ? (
                          <div className={styles.placeholderRow}>No signatories configured yet.</div>
                        ) : (
                          <div className={styles.timeline}>
                            {orderedSignatories.map((signatory) => (
                              <div key={signatory.id} className={styles.event}>
                                <div className={styles.signatoryHeader}>
                                  <div>
                                    {signatory.signatoryEmail} ·{' '}
                                    {getContractSignatoryRecipientTypeLabel(signatory.recipientType)} · Step{' '}
                                    {signatory.routingOrder}
                                  </div>
                                  <span
                                    className={`${styles.signatoryStatusBadge} ${
                                      signatory.status === 'SIGNED'
                                        ? styles.signatoryStatusSigned
                                        : styles.signatoryStatusPending
                                    }`}
                                  >
                                    {signatory.status}
                                  </span>
                                </div>
                                <div className={styles.signatoryActionHint}>
                                  {signatory.status === 'SIGNED'
                                    ? 'This signer has completed signing.'
                                    : 'Waiting for this signer to complete signing.'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {allSignatoriesSigned &&
                        (!completionArtifactsByKind.executedDocument ||
                          !completionArtifactsByKind.completionCertificate) ? (
                          <div className={styles.eventMeta}>
                            Final artifacts are syncing to local storage. Downloads use Zoho live fallback meanwhile.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </ErrorBoundary>
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
              ) : viewerMimeType.startsWith('video/') ? (
                <video src={viewerUrl} className={styles.viewerFrame} controls />
              ) : viewerMimeType.startsWith('audio/') ? (
                <audio src={viewerUrl} controls />
              ) : (
                <iframe src={viewerUrl} title={viewerFileName} className={styles.viewerFrame} />
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
          <form className={styles.actionRemarkModal} onSubmit={handleRemarkDialogSubmit}>
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
                type="submit"
                className={`${styles.button} ${styles.buttonPrimary}`}
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
          </form>
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

      {selectedContractId && selectedContract && signingPreviewDocument && signingPreviewUrl ? (
        <PrepareForSigningModal
          isOpen={isPrepareForSigningOpen}
          contractId={selectedContractId}
          contractStatus={selectedContract.status}
          pdfUrl={signingPreviewUrl}
          initialRecipients={defaultPrepareForSigningRecipients}
          onClose={() => setIsPrepareForSigningOpen(false)}
          onSent={(contractView) => void handleSigningPrepared(contractView)}
        />
      ) : null}
    </div>
  )
}
