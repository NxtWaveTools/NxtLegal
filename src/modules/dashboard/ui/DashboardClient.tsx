'use client'

import type { ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ThirdPartyUploadSidebar from '@/modules/contracts/ui/third-party-upload/ThirdPartyUploadSidebar'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import { contractsClient, type ContractRecord, type DashboardContractsFilter } from '@/core/client/contracts-client'
import { contractWorkflowRoles } from '@/core/constants/contracts'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import styles from './dashboard.module.css'

type DashboardClientProps = {
  session: {
    employeeId: string
    fullName?: string | null
    email?: string | null
    role?: string
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

const dashboardTimestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

function getRoleConfig(role?: string): DashboardRoleConfig {
  if (role === contractWorkflowRoles.admin) {
    return {
      defaultFilter: 'ALL',
      approveFilter: 'HOD_PENDING',
      showApproveCard: true,
      filters: [
        { value: 'ALL', label: 'All' },
        { value: 'HOD_PENDING', label: 'HOD Pending' },
        { value: 'LEGAL_PENDING', label: 'Legal Pending' },
        { value: 'FINAL_APPROVED', label: 'Final Approved' },
        { value: 'LEGAL_QUERY', label: 'Legal Query' },
      ],
    }
  }

  if (role === contractWorkflowRoles.legalTeam) {
    return {
      defaultFilter: 'LEGAL_PENDING',
      approveFilter: 'LEGAL_PENDING',
      showApproveCard: true,
      filters: [
        { value: 'LEGAL_PENDING', label: 'Legal Pending' },
        { value: 'HOD_PENDING', label: 'HOD Pending' },
        { value: 'FINAL_APPROVED', label: 'Final Approved' },
        { value: 'LEGAL_QUERY', label: 'Legal Query' },
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
        { value: 'LEGAL_PENDING', label: 'Legal Pending' },
        { value: 'FINAL_APPROVED', label: 'Final Approved' },
        { value: 'LEGAL_QUERY', label: 'Legal Query' },
      ],
    }
  }

  return {
    defaultFilter: 'HOD_PENDING',
    approveFilter: 'HOD_PENDING',
    showApproveCard: false,
    filters: [
      { value: 'HOD_PENDING', label: 'HOD Pending' },
      { value: 'LEGAL_PENDING', label: 'Legal Pending' },
      { value: 'FINAL_APPROVED', label: 'Final Approved' },
      { value: 'LEGAL_QUERY', label: 'Legal Query' },
    ],
  }
}

export default function DashboardClient({ session }: DashboardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleConfig = useMemo(() => getRoleConfig(session.role), [session.role])
  const contractsSectionRef = useRef<HTMLElement | null>(null)
  const initialLoadPromiseRef = useRef<Promise<void> | null>(null)

  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [isLoadingContracts, setIsLoadingContracts] = useState(true)
  const [contractsError, setContractsError] = useState<string | null>(null)
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<DashboardContractsFilter>(() => {
    const requestedFilter = searchParams.get('filter')
    const isAllowedFilter = roleConfig.filters.some((item) => item.value === requestedFilter)

    if (requestedFilter && isAllowedFilter) {
      return requestedFilter as DashboardContractsFilter
    }

    return roleConfig.defaultFilter
  })
  const [filterCounts, setFilterCounts] = useState<Partial<Record<DashboardContractsFilter, number>>>({})
  const [activeFilterTotal, setActiveFilterTotal] = useState(0)

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

  const loadContractsForFilter = useCallback(async (filter: DashboardContractsFilter) => {
    setIsLoadingContracts(true)

    const response = await contractsClient.dashboardContracts({
      filter,
      limit: 20,
    })

    if (!response.ok || !response.data) {
      setContracts([])
      setContractsError(response.error?.message ?? 'Failed to load contracts')
      setActiveFilterTotal(0)
      setIsLoadingContracts(false)
      return
    }

    setContracts(response.data.contracts)
    setActiveFilterTotal(response.data.pagination.total)
    setContractsError(null)
    setIsLoadingContracts(false)
  }, [])

  const loadFilterCounts = useCallback(async () => {
    const results = await Promise.all(
      roleConfig.filters.map(async (filterOption) => {
        const response = await contractsClient.dashboardContracts({
          filter: filterOption.value,
          limit: 50,
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
      void loadContractsForFilter(filter)
    },
    [loadContractsForFilter, router]
  )

  if (initialLoadPromiseRef.current === null) {
    initialLoadPromiseRef.current = Promise.all([
      loadPendingApprovals(),
      loadFilterCounts(),
      loadContractsForFilter(activeFilter),
    ]).then(() => undefined)
  }

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

  return (
    <ProtectedAppShell session={{ fullName: session.fullName, role: session.role }} activeNav="home">
      <main className={styles.main}>
        <section className={styles.greeting}>
          <div>
            <div className={styles.greetingTitle}>Dashboard</div>
            <div className={styles.greetingSubtitle}>Tasks pending on you</div>
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
                onClick={() => setIsUploadOpen(true)}
              />
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

        <section className={styles.contractsSection} ref={contractsSectionRef}>
          <div className={styles.contractsHeader}>
            <span>My Contracts</span>
            <span>Looking for a specific contract? Open Repository</span>
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
              <div>
                <div className={styles.emptyTitle}>...</div>
                <div className={styles.emptySubtitle}>Loading contracts</div>
              </div>
            ) : contractsError ? (
              <div>
                <div className={styles.emptyTitle}>!</div>
                <div className={styles.emptySubtitle}>{contractsError}</div>
                <button
                  type="button"
                  className={styles.emptyAction}
                  onClick={() => {
                    void loadContractsForFilter(activeFilter)
                  }}
                >
                  Retry
                </button>
              </div>
            ) : contracts.length === 0 ? (
              <div>
                <div className={styles.emptyTitle}>No contracts found</div>
                <div className={styles.emptySubtitle}>No contracts match the selected filter.</div>
              </div>
            ) : (
              <div className={styles.contractList}>
                {contracts.map((contract) => (
                  <div key={contract.id} className={styles.contractItem}>
                    <div>
                      <div className={styles.contractTitle}>{contract.title}</div>
                      <div className={styles.contractMeta}>
                        Created by {contract.uploadedByEmail || contract.uploadedByEmployeeId}
                      </div>
                      <div className={styles.contractMeta}>
                        {dashboardTimestampFormatter.format(new Date(contract.createdAt))}
                      </div>
                    </div>
                    <div className={styles.contractActions}>
                      <ContractStatusBadge status={contract.status} />
                      <button
                        type="button"
                        className={styles.emptyAction}
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
                      <button
                        type="button"
                        className={styles.emptyAction}
                        onClick={async () => {
                          const response = await contractsClient.download(contract.id)

                          if (response.ok && response.data?.signedUrl) {
                            window.open(response.data.signedUrl, '_blank', 'noopener,noreferrer')
                          }
                        }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <ThirdPartyUploadSidebar
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={async () => {
          await Promise.all([loadContractsForFilter(activeFilter), loadFilterCounts(), loadPendingApprovals()])
          router.refresh()
        }}
      />
    </ProtectedAppShell>
  )
}
