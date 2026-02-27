'use client'

import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import Spinner from '@/components/ui/Spinner'
import ThirdPartyUploadSidebar from '@/modules/contracts/ui/third-party-upload/ThirdPartyUploadSidebar'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import { triggerContractStatusConfetti } from '@/modules/contracts/ui/contract-status-confetti'
import { contractsClient, type ContractRecord, type DashboardContractsFilter } from '@/core/client/contracts-client'
import {
  contractStatuses,
  contractUploadModes,
  contractWorkflowRoles,
  type ContractUploadMode,
} from '@/core/constants/contracts'
import { limits } from '@/core/constants/limits'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import styles from './dashboard.module.css'

type DashboardClientProps = {
  session: {
    employeeId: string
    fullName?: string | null
    email?: string | null
    team?: string | null
    role?: string
    canAccessApproverHistory?: boolean
  }
}

type ActionCardProps = {
  title: string
  count: number
  description: string
  onClick?: () => void
  icon?: ReactNode
}

type DashboardRoleConfig = {
  defaultFilter: DashboardContractsFilter
  approveFilter: DashboardContractsFilter
  filters: Array<{ value: DashboardContractsFilter; label: string }>
  showApproveCard: boolean
}

const legacyDashboardFilterMap: Record<string, DashboardContractsFilter> = {
  LEGAL_PENDING: 'UNDER_REVIEW',
  FINAL_APPROVED: 'COMPLETED',
  LEGAL_QUERY: 'ON_HOLD',
}

const normalizeDashboardFilter = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  return legacyDashboardFilterMap[value] ?? value
}

const dashboardTimestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

function DashboardActionCard({ title, count, description, onClick, icon }: ActionCardProps) {
  return (
    <button type="button" onClick={onClick} className={styles.actionCard}>
      <div className={styles.actionCardTop}>
        <span className={styles.actionCardTitle}>
          {icon && <span className={styles.actionCardIcon}>{icon}</span>}
          {title}
        </span>
        <span className={styles.actionCardCount}>{count}</span>
      </div>
      <span className={styles.actionCardMeta}>{description}</span>
    </button>
  )
}

function getRoleConfig(role?: string): DashboardRoleConfig {
  if (role === contractWorkflowRoles.admin) {
    return {
      defaultFilter: 'ALL',
      approveFilter: 'HOD_PENDING',
      showApproveCard: true,
      filters: [
        { value: 'ALL', label: 'All' },
        { value: 'HOD_PENDING', label: 'HOD Pending' },
        { value: 'UNDER_REVIEW', label: 'Under Review' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'ON_HOLD', label: 'On Hold' },
      ],
    }
  }

  if (role === contractWorkflowRoles.legalTeam) {
    return {
      defaultFilter: 'UNDER_REVIEW',
      approveFilter: 'UNDER_REVIEW',
      showApproveCard: true,
      filters: [
        { value: 'ASSIGNED_TO_ME', label: 'Assigned To Me' },
        { value: 'UNDER_REVIEW', label: 'Under Review' },
        { value: 'HOD_PENDING', label: 'HOD Pending' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'ON_HOLD', label: 'On Hold' },
      ],
    }
  }

  if (role === contractWorkflowRoles.hod) {
    return {
      defaultFilter: 'HOD_PENDING',
      approveFilter: 'HOD_PENDING',
      showApproveCard: true,
      filters: [
        { value: 'HOD_PENDING', label: 'HOD Pending' },
        { value: 'UNDER_REVIEW', label: 'Under Review' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'ON_HOLD', label: 'On Hold' },
      ],
    }
  }

  return {
    defaultFilter: 'HOD_PENDING',
    approveFilter: 'HOD_PENDING',
    showApproveCard: false,
    filters: [
      { value: 'HOD_PENDING', label: 'HOD Pending' },
      { value: 'UNDER_REVIEW', label: 'Under Review' },
      { value: 'COMPLETED', label: 'Completed' },
      { value: 'ON_HOLD', label: 'On Hold' },
    ],
  }
}

export default function DashboardClient({ session }: DashboardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleConfig = useMemo(() => getRoleConfig(session.role), [session.role])
  const contractsSectionRef = useRef<HTMLElement | null>(null)
  const latestContractsRequestIdRef = useRef(0)
  const lastVisibilityRefreshAtRef = useRef(0)
  const knownContractStatusesRef = useRef<Map<string, ContractRecord['status']>>(new Map())
  const executedCelebratedContractIdsRef = useRef<Set<string>>(new Set())

  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<ContractUploadMode>(contractUploadModes.default)
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [isLoadingContracts, setIsLoadingContracts] = useState(true)
  const [isLoadingPageChange, setIsLoadingPageChange] = useState(false)
  const [contractsCursor, setContractsCursor] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined])
  const [mutatingContractId, setMutatingContractId] = useState<string | null>(null)
  const [downloadingContractId, setDownloadingContractId] = useState<string | null>(null)
  const [approvingContractId, setApprovingContractId] = useState<string | null>(null)
  const [rejectingContractId, setRejectingContractId] = useState<string | null>(null)
  const [rejectReasonDraft, setRejectReasonDraft] = useState('')
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<DashboardContractsFilter>(() => {
    const requestedFilter = normalizeDashboardFilter(searchParams.get('filter'))
    const isAllowedFilter = roleConfig.filters.some((item) => item.value === requestedFilter)

    if (requestedFilter && isAllowedFilter) {
      return requestedFilter as DashboardContractsFilter
    }

    return roleConfig.defaultFilter
  })
  const [filterCounts, setFilterCounts] = useState<Partial<Record<DashboardContractsFilter, number>>>({})
  const [activeFilterTotal, setActiveFilterTotal] = useState(0)
  const [actionableAdditionalApprovals, setActionableAdditionalApprovals] = useState<ContractRecord[]>([])

  const loadPendingApprovals = useCallback(async () => {
    if (!roleConfig.showApproveCard) {
      setPendingApprovalsCount(0)
      return
    }

    const response = await contractsClient.dashboardContracts({
      filter: roleConfig.approveFilter,
      limit: 1,
    })

    if (!response.ok || !response.data) {
      setPendingApprovalsCount(0)
      return
    }

    setPendingApprovalsCount(response.data.pagination.total)
  }, [roleConfig.approveFilter, roleConfig.showApproveCard])

  const loadContractsForFilter = useCallback(
    async (
      filter: DashboardContractsFilter,
      options?: { cursor?: string; pageIndex?: number; isPageChange?: boolean }
    ) => {
      const requestId = latestContractsRequestIdRef.current + 1
      latestContractsRequestIdRef.current = requestId

      if (options?.isPageChange) {
        setIsLoadingPageChange(true)
      } else {
        setIsLoadingContracts(true)
      }

      try {
        const response = await contractsClient.dashboardContracts({
          filter,
          cursor: options?.cursor,
          limit: limits.dashboardContractsPageSize,
          includeExtras: true,
        })

        if (requestId !== latestContractsRequestIdRef.current) {
          return
        }

        if (!response.ok || !response.data) {
          if (!options?.isPageChange) {
            setContracts([])
            setActiveFilterTotal(0)
            setContractsCursor(null)
            setPageIndex(0)
            setPageCursors([undefined])
          }

          toast.error(response.error?.message ?? 'Failed to load contracts')
          return
        }

        const responseData = response.data

        for (const contract of responseData.contracts) {
          const previousStatus = knownContractStatusesRef.current.get(contract.id)
          const hasTransitionedToExecuted =
            previousStatus !== undefined &&
            previousStatus !== contractStatuses.executed &&
            contract.status === contractStatuses.executed

          if (hasTransitionedToExecuted && !executedCelebratedContractIdsRef.current.has(contract.id)) {
            triggerContractStatusConfetti()
            executedCelebratedContractIdsRef.current.add(contract.id)
          }

          knownContractStatusesRef.current.set(contract.id, contract.status)
        }

        setContracts(responseData.contracts)
        setActionableAdditionalApprovals(responseData.additionalApproverSections?.actionableContracts ?? [])
        setContractsCursor(responseData.pagination.cursor)
        setActiveFilterTotal(responseData.pagination.total)
        if (typeof options?.pageIndex === 'number') {
          const nextPageIndex = options.pageIndex
          setPageIndex(nextPageIndex)
          setPageCursors((previousCursors) => {
            const nextCursors = previousCursors.slice(0, nextPageIndex + 1)
            nextCursors[nextPageIndex] = options.cursor
            return nextCursors
          })
        } else {
          setPageIndex(0)
          setPageCursors([undefined])
        }
      } catch (error) {
        if (requestId !== latestContractsRequestIdRef.current) {
          return
        }

        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
        toast.error(errorMessage)
      } finally {
        if (requestId !== latestContractsRequestIdRef.current) {
          return
        }

        setIsLoadingContracts(false)
        setIsLoadingPageChange(false)
      }
    },
    []
  )

  const loadFilterCounts = useCallback(async () => {
    const results = await Promise.all(
      roleConfig.filters.map(async (filterOption) => {
        const response = await contractsClient.dashboardContracts({
          filter: filterOption.value,
          limit: 1,
        })

        return {
          filter: filterOption.value,
          count: response.ok && response.data ? response.data.pagination.total : 0,
        }
      })
    )

    const nextCounts: Partial<Record<DashboardContractsFilter, number>> = {}
    for (const item of results) {
      nextCounts[item.filter] = item.count
    }

    setFilterCounts(nextCounts)
  }, [roleConfig.filters])

  const applyFilter = useCallback(
    (filter: DashboardContractsFilter) => {
      setActiveFilter(filter)
      router.replace(`/dashboard?filter=${filter}`)
    },
    [router]
  )

  useEffect(() => {
    const requestedFilter = normalizeDashboardFilter(searchParams.get('filter'))
    const isAllowedFilter = roleConfig.filters.some((item) => item.value === requestedFilter)

    if (!requestedFilter || !isAllowedFilter) {
      return
    }

    const normalizedFilter = requestedFilter as DashboardContractsFilter
    if (normalizedFilter === activeFilter) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setActiveFilter(normalizedFilter)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeFilter, roleConfig.filters, searchParams])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void Promise.all([loadPendingApprovals(), loadFilterCounts()])
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [loadFilterCounts, loadPendingApprovals])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadContractsForFilter(activeFilter, { cursor: undefined, pageIndex: 0 })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeFilter, loadContractsForFilter])

  useEffect(() => {
    const reloadContracts = () => {
      void Promise.all([
        loadPendingApprovals(),
        loadContractsForFilter(activeFilter, { cursor: undefined, pageIndex: 0 }),
      ])
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }

      const now = Date.now()
      if (now - lastVisibilityRefreshAtRef.current < 15000) {
        return
      }

      lastVisibilityRefreshAtRef.current = now
      reloadContracts()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [activeFilter, loadContractsForFilter, loadPendingApprovals])

  const uploadIcon = (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 3l4 4m-4-4l-4 4m4-4v10m-6 4h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  const handleRowAction = useCallback(
    async (contractId: string, action: 'hod.approve' | 'hod.reject', noteText?: string): Promise<boolean> => {
      if (mutatingContractId) {
        return false
      }

      const resolvedNoteText = noteText?.trim()
      if (action === 'hod.reject' && !resolvedNoteText) {
        toast.error('Rejection reason is required.')
        return false
      }

      setMutatingContractId(contractId)

      try {
        const response = await contractsClient.action(contractId, {
          action,
          noteText: action === 'hod.reject' ? resolvedNoteText : undefined,
        })

        if (!response.ok) {
          toast.error(response.error?.message ?? 'Failed to complete contract action')
          return false
        }

        await Promise.all([
          loadPendingApprovals(),
          loadFilterCounts(),
          loadContractsForFilter(activeFilter, { cursor: pageCursors[pageIndex], pageIndex, isPageChange: true }),
        ])
        toast.success(action === 'hod.approve' ? 'Contract approved successfully' : 'Contract rejected successfully')
        return true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
        toast.error(errorMessage)
        return false
      } finally {
        setMutatingContractId(null)
      }
    },
    [
      activeFilter,
      loadContractsForFilter,
      loadFilterCounts,
      loadPendingApprovals,
      mutatingContractId,
      pageCursors,
      pageIndex,
    ]
  )

  const openRejectDialog = useCallback((contractId: string) => {
    setRejectingContractId(contractId)
    setRejectReasonDraft('')
  }, [])

  const openApproveDialog = useCallback((contractId: string) => {
    setApprovingContractId(contractId)
  }, [])

  const closeApproveDialog = useCallback(() => {
    if (mutatingContractId) {
      return
    }

    setApprovingContractId(null)
  }, [mutatingContractId])

  const submitApproveDialog = useCallback(async () => {
    if (!approvingContractId) {
      return
    }

    const didApprove = await handleRowAction(approvingContractId, 'hod.approve')
    if (didApprove) {
      setApprovingContractId(null)
    }
  }, [approvingContractId, handleRowAction])

  const closeRejectDialog = useCallback(() => {
    if (mutatingContractId) {
      return
    }

    setRejectingContractId(null)
    setRejectReasonDraft('')
  }, [mutatingContractId])

  const submitRejectDialog = useCallback(async () => {
    if (!rejectingContractId) {
      return
    }

    const reason = rejectReasonDraft.trim()
    if (!reason) {
      toast.error('Rejection reason is required.')
      return
    }

    const didReject = await handleRowAction(rejectingContractId, 'hod.reject', reason)
    if (didReject) {
      setRejectingContractId(null)
      setRejectReasonDraft('')
    }
  }, [handleRowAction, rejectReasonDraft, rejectingContractId])

  const handleRejectDialogSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitRejectDialog()
  }

  const rejectingContractTitle = useMemo(() => {
    if (!rejectingContractId) {
      return null
    }

    return contracts.find((contract) => contract.id === rejectingContractId)?.title ?? null
  }, [contracts, rejectingContractId])

  const approvingContractTitle = useMemo(() => {
    if (!approvingContractId) {
      return null
    }

    return contracts.find((contract) => contract.id === approvingContractId)?.title ?? null
  }, [approvingContractId, contracts])

  return (
    <ProtectedAppShell
      session={{ fullName: session.fullName, email: session.email, team: session.team, role: session.role }}
      activeNav="home"
      canAccessApproverHistory={session.canAccessApproverHistory}
    >
      <main className={styles.main}>
        <section className={styles.greeting}>
          <div>
            <div className={styles.greetingTitle}>
              {session.fullName ? `Welcome, ${session.fullName.split(' ')[0]}` : 'Dashboard'}
            </div>
            <div className={styles.greetingSubtitle}>Here&apos;s what needs your attention today</div>
          </div>
        </section>

        <section className={styles.tasksRow}>
          <div className={styles.tasksCardGroup}>
            <div className={styles.tasksHeader}>Tasks pending on you</div>
            <div className={styles.taskCards}>
              <DashboardActionCard
                title="Upload Third-Party Contract"
                count={activeFilterTotal}
                description="Upload third-party contracts for review"
                icon={uploadIcon}
                onClick={() => {
                  setUploadMode(contractUploadModes.default)
                  setIsUploadOpen(true)
                }}
              />
              {session.role === contractWorkflowRoles.legalTeam ? (
                <DashboardActionCard
                  title="Send for Signing"
                  count={activeFilterTotal}
                  description="Initiate legal signing workflow"
                  onClick={() => {
                    setUploadMode(contractUploadModes.legalSendForSigning)
                    setIsUploadOpen(true)
                  }}
                />
              ) : null}
              {roleConfig.showApproveCard ? (
                <DashboardActionCard
                  title="Approve"
                  count={pendingApprovalsCount}
                  description="Contracts waiting for approval"
                  onClick={() => {
                    applyFilter(roleConfig.approveFilter)
                    contractsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                />
              ) : null}
              <DashboardActionCard title="Review" count={0} description="Documents awaiting review" />
            </div>
          </div>
          <div className={styles.secondaryTasks}>
            <div className={styles.secondaryTaskCard}>
              <span className={styles.secondaryTaskTitle}>Setup Signatures</span>
              <span className={styles.secondaryTaskCount}>0</span>
            </div>
            <div className={styles.secondaryTaskCard}>
              <span className={styles.secondaryTaskTitle}>Custom Task</span>
              <span className={styles.secondaryTaskCount}>0</span>
            </div>
          </div>
        </section>

        {actionableAdditionalApprovals.length > 0 && (
          <section className={styles.approverInsightSection}>
            {actionableAdditionalApprovals.length > 0 ? (
              <div className={styles.approverInsightCard}>
                <div className={styles.approverInsightHeader}>
                  <span className={styles.approverInsightTitle}>Your Approval Needed</span>
                  <span className={styles.approverInsightCount}>{actionableAdditionalApprovals.length}</span>
                </div>
                <div className={styles.approverInsightList}>
                  {actionableAdditionalApprovals.map((contract) => (
                    <div key={contract.id} className={styles.approverInsightItem}>
                      <div className={styles.approverInsightContent}>
                        <div className={styles.contractTitleRow}>
                          <div className={styles.approverInsightItemTitle}>{contract.title}</div>
                          {contract.hasUnreadActivity ? (
                            <span className={styles.unreadDot} aria-label="Unread activity" />
                          ) : null}
                        </div>
                        <div className={styles.approverInsightItemMeta}>
                          {session.role === contractWorkflowRoles.hod
                            ? 'Pending additional approval'
                            : 'Assigned to you for additional approval'}
                        </div>
                        {contract.latestAdditionalApproverRejectionReason ? (
                          <div className={styles.approverInsightReason}>
                            Latest rejection reason: {contract.latestAdditionalApproverRejectionReason}
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.approverInsightActions}>
                        <span className={styles.approverNeededTag}>Your approval needed</span>
                        <ContractStatusBadge status={contract.status} displayLabel={contract.displayStatusLabel} />
                        <button
                          type="button"
                          className={`${styles.contractActionButton} ${styles.contractActionPrimary}`}
                          onClick={() =>
                            router.push(
                              contractsClient.resolveProtectedContractPath(contract.id, {
                                from: 'dashboard',
                                filter: activeFilter,
                              })
                            )
                          }
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        )}

        <section className={styles.contractsSection} ref={contractsSectionRef}>
          <div className={styles.contractsHeader}>
            <span className={styles.contractsHeaderTitle}>My Contracts</span>
            <button type="button" className={styles.repositoryLink} onClick={() => router.push('/repository')}>
              Looking for a specific contract? Open Repository →
            </button>
          </div>
          <div className={styles.contractsTabs}>
            {roleConfig.filters.map((filterOption) => (
              <button
                key={filterOption.value}
                type="button"
                className={`${styles.tab} ${activeFilter === filterOption.value ? styles.tabActive : ''}`}
                onClick={() => applyFilter(filterOption.value)}
              >
                {filterOption.label} ({filterCounts[filterOption.value] ?? 0})
              </button>
            ))}
          </div>

          <div className={styles.contractsBody}>
            {isLoadingContracts ? (
              <div className={styles.contractList}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={styles.shimmerRow}>
                    <div className={styles.shimmerAvatar} />
                    <div className={styles.shimmerContent}>
                      <div className={styles.shimmerLine} style={{ width: `${60 + i * 8}%` }} />
                      <div className={styles.shimmerLine} style={{ width: '40%', height: 10 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : contracts.length === 0 ? (
              <div className={styles.emptyBody}>
                <div className={styles.emptyTitle}>No contracts found</div>
                <div className={styles.emptySubtitle}>No contracts match the selected filter.</div>
              </div>
            ) : (
              <div className={styles.contractList}>
                <div className={styles.paginationRow}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => {
                      if (pageIndex === 0) {
                        return
                      }

                      const previousPageIndex = pageIndex - 1
                      void loadContractsForFilter(activeFilter, {
                        cursor: pageCursors[previousPageIndex],
                        pageIndex: previousPageIndex,
                        isPageChange: true,
                      })
                    }}
                    disabled={pageIndex === 0 || isLoadingPageChange}
                  >
                    ← Previous
                  </button>
                  <span className={styles.pageIndicator}>Page {pageIndex + 1}</span>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => {
                      if (!contractsCursor) {
                        return
                      }

                      const nextPageIndex = pageIndex + 1
                      void loadContractsForFilter(activeFilter, {
                        cursor: contractsCursor,
                        pageIndex: nextPageIndex,
                        isPageChange: true,
                      })
                    }}
                    disabled={!contractsCursor || isLoadingPageChange}
                  >
                    Next →
                  </button>
                </div>

                {contracts.map((contract) => (
                  <div key={contract.id} className={styles.contractItem}>
                    <div>
                      <div className={styles.contractTitleRow}>
                        <div className={styles.contractTitle}>{contract.title}</div>
                        {contract.hasUnreadActivity ? (
                          <span className={styles.unreadDot} aria-label="Unread activity" />
                        ) : null}
                      </div>
                      <div className={styles.contractMeta}>
                        Created by {contract.uploadedByEmail || contract.uploadedByEmployeeId}
                      </div>
                      <div className={styles.contractMeta}>
                        {dashboardTimestampFormatter.format(new Date(contract.createdAt))}
                      </div>
                    </div>
                    <div className={styles.contractActions}>
                      <ContractStatusBadge status={contract.status} displayLabel={contract.displayStatusLabel} />
                      {session.role !== contractWorkflowRoles.hod && contract.isAssignedToMe ? (
                        <span className={styles.assignedTag}>Assigned to you</span>
                      ) : null}
                      {contract.isAdditionalApproverActionable ? (
                        <span className={styles.approverNeededTag}>Your approval needed</span>
                      ) : null}
                      <button
                        type="button"
                        className={`${styles.contractActionButton} ${styles.contractActionPrimary}`}
                        onClick={() =>
                          router.push(
                            contractsClient.resolveProtectedContractPath(contract.id, {
                              from: 'dashboard',
                              filter: activeFilter,
                            })
                          )
                        }
                      >
                        Open
                      </button>
                      {session.role === contractWorkflowRoles.hod ? (
                        <>
                          {contract.canHodApprove ? (
                            <button
                              type="button"
                              className={styles.contractActionButton}
                              disabled={Boolean(mutatingContractId)}
                              onClick={() => openApproveDialog(contract.id)}
                            >
                              Approve
                            </button>
                          ) : null}
                          {contract.canHodReject ? (
                            <button
                              type="button"
                              className={styles.contractActionButton}
                              disabled={Boolean(mutatingContractId)}
                              onClick={() => openRejectDialog(contract.id)}
                            >
                              Reject
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.contractActionButton}
                          disabled={downloadingContractId === contract.id}
                          onClick={async () => {
                            setDownloadingContractId(contract.id)
                            const response = await contractsClient.download(contract.id)

                            if (response.ok && response.data?.signedUrl) {
                              window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
                              toast.success('Document download started')
                            } else {
                              toast.error(response.error?.message ?? 'Failed to download document')
                            }

                            setDownloadingContractId(null)
                          }}
                        >
                          <span className={styles.buttonContent}>
                            {downloadingContractId === contract.id ? <Spinner size={14} /> : null}
                            {downloadingContractId === contract.id ? 'Downloading…' : 'Download'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {rejectingContractId ? (
        <div
          className={styles.actionDialogOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Provide rejection reason"
        >
          <form className={styles.actionDialogModal} onSubmit={handleRejectDialogSubmit}>
            <div className={styles.actionDialogTitle}>Reject Contract</div>
            <div className={styles.actionDialogSubtitle}>{rejectingContractTitle ?? 'Selected contract'}</div>
            <textarea
              className={styles.actionDialogTextarea}
              value={rejectReasonDraft}
              onChange={(event) => setRejectReasonDraft(event.target.value)}
              placeholder="Enter rejection reason"
              rows={4}
              autoFocus
            />
            <div className={styles.actionDialogActions}>
              <button
                type="button"
                className={styles.contractActionButton}
                onClick={closeRejectDialog}
                disabled={Boolean(mutatingContractId)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.contractActionButton} ${styles.contractActionPrimary}`}
                disabled={Boolean(mutatingContractId)}
              >
                <span className={styles.buttonContent}>
                  {mutatingContractId === rejectingContractId ? <Spinner size={14} /> : null}
                  {mutatingContractId === rejectingContractId ? 'Rejecting…' : 'Confirm Reject'}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {approvingContractId ? (
        <div
          className={styles.actionDialogOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm contract approval"
        >
          <div className={styles.actionDialogModal}>
            <div className={styles.actionDialogTitle}>Approve Contract</div>
            <div className={styles.actionDialogSubtitle}>{approvingContractTitle ?? 'Selected contract'}</div>
            <div className={styles.actionDialogSubtitle}>Are you sure you want to approve this contract?</div>
            <div className={styles.actionDialogActions}>
              <button
                type="button"
                className={styles.contractActionButton}
                onClick={closeApproveDialog}
                disabled={Boolean(mutatingContractId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.contractActionButton} ${styles.contractActionPrimary}`}
                onClick={() => {
                  void submitApproveDialog()
                }}
                disabled={Boolean(mutatingContractId)}
              >
                <span className={styles.buttonContent}>
                  {mutatingContractId === approvingContractId ? <Spinner size={14} /> : null}
                  {mutatingContractId === approvingContractId ? 'Approving…' : 'Confirm Approve'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ThirdPartyUploadSidebar
        isOpen={isUploadOpen}
        mode={uploadMode}
        actorRole={session.role}
        onClose={() => {
          setIsUploadOpen(false)
          setUploadMode(contractUploadModes.default)
        }}
        onUploaded={async () => {
          await Promise.all([loadContractsForFilter(activeFilter), loadFilterCounts(), loadPendingApprovals()])
          router.refresh()
        }}
      />
    </ProtectedAppShell>
  )
}
