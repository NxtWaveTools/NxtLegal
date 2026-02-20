'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/theme/ThemeToggle'
import ThirdPartyUploadSidebar from '@/modules/contracts/ui/third-party-upload/ThirdPartyUploadSidebar'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import { contractsClient, type ContractRecord } from '@/core/client/contracts-client'
import { contractStatuses } from '@/core/constants/contracts'
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

export default function DashboardClient({ session }: DashboardClientProps) {
  const router = useRouter()
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [isLoadingContracts, setIsLoadingContracts] = useState(true)
  const [contractsError, setContractsError] = useState<string | null>(null)

  const loadContracts = useCallback(async () => {
    setIsLoadingContracts(true)
    const response = await contractsClient.list({ limit: 20 })

    if (!response.ok || !response.data) {
      setContracts([])
      setContractsError(response.error?.message ?? 'Failed to load contracts')
      setIsLoadingContracts(false)
      return
    }

    setContracts(response.data.contracts)
    setContractsError(null)
    setIsLoadingContracts(false)
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadInitialContracts = async () => {
      const response = await contractsClient.list({ limit: 20 })

      if (isCancelled) {
        return
      }

      if (!response.ok || !response.data) {
        setContracts([])
        setContractsError(response.error?.message ?? 'Failed to load contracts')
        setIsLoadingContracts(false)
        return
      }

      setContracts(response.data.contracts)
      setContractsError(null)
      setIsLoadingContracts(false)
    }

    void loadInitialContracts()

    return () => {
      isCancelled = true
    }
  }, [])

  const displayName = useMemo(() => {
    if (!session.fullName) {
      return 'there'
    }

    return session.fullName.split(' ')[0] || session.fullName
  }, [session.fullName])

  const executedContracts = useMemo(
    () =>
      contracts.filter(
        (contract) =>
          contract.status === contractStatuses.hodApproved || contract.status === contractStatuses.finalApproved
      ),
    [contracts]
  )

  const ongoingContracts = useMemo(
    () => contracts.filter((contract) => !executedContracts.some((executed) => executed.id === contract.id)),
    [contracts, executedContracts]
  )

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
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>N</div>
        <div className={styles.navList}>
          <button type="button" className={`${styles.navItem} ${styles.navItemActive}`} aria-label="Home">
            <span className={styles.navIcon}>H</span>
          </button>
          <button type="button" className={styles.navItem} aria-label="Repository">
            <span className={styles.navIcon}>R</span>
          </button>
          <button type="button" className={styles.navItem} aria-label="Manage">
            <span className={styles.navIcon}>M</span>
          </button>
          <button type="button" className={styles.navItem} aria-label="Analytics">
            <span className={styles.navIcon}>A</span>
          </button>
        </div>
        <div className={styles.bottomNav}>
          <button type="button" className={styles.navItem} aria-label="Settings">
            <span className={styles.navIcon}>S</span>
          </button>
          <button type="button" className={styles.navItem} aria-label="Chat">
            <span className={styles.navIcon}>C</span>
          </button>
        </div>
      </aside>

      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.searchBar}>
              <span>Search</span>
              <input type="text" className={styles.searchInput} placeholder="Shortcuts" aria-label="Search shortcuts" />
              <span>Ctrl+K</span>
            </div>
          </div>
          <div className={styles.topbarRight}>
            <ThemeToggle />
            <span className={styles.companyBadge}>NxtWave Disruptive Technologies Private Limited</span>
            <div className={styles.profileBadge}>{displayName.slice(0, 1).toUpperCase()}</div>
            <LogoutButton />
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.greeting}>
            <div>
              <div className={styles.greetingTitle}>Good afternoon, {displayName}</div>
              <div className={styles.greetingSubtitle}>Tasks pending on you</div>
            </div>
          </section>

          <section className={styles.tasksRow}>
            <div className={styles.tasksCardGroup}>
              <div className={styles.tasksHeader}>Tasks pending on you</div>
              <div className={styles.taskCards}>
                <DashboardActionCard
                  title="Upload Third-Party Contract"
                  count={contracts.length}
                  description="Upload third-party contracts for review"
                  icon={uploadIcon}
                  onClick={() => setIsUploadOpen(true)}
                />
                <DashboardActionCard
                  title="Approve"
                  count={
                    contracts.filter((contract) => contract.currentAssigneeEmployeeId === session.employeeId).length
                  }
                  description="Contracts waiting for approval"
                  onClick={() => router.push('/dashboard/contracts')}
                />
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

          <section className={styles.contractsSection}>
            <div className={styles.contractsHeader}>
              <span>Contracts owned by {session.fullName || session.employeeId}</span>
              <span>Looking for a specific contract? Search in Repository</span>
            </div>
            <div className={styles.contractsTabs}>
              <button
                type="button"
                className={`${styles.tab} ${styles.tabActive}`}
                onClick={() => router.push('/dashboard/contracts')}
              >
                Ongoing ({ongoingContracts.length})
              </button>
              <button type="button" className={styles.tab}>
                Without Activity (0)
              </button>
              <button type="button" className={styles.tab}>
                Executed ({executedContracts.length})
              </button>
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
                  <button type="button" className={styles.emptyAction} onClick={() => void loadContracts()}>
                    Retry
                  </button>
                </div>
              ) : contracts.length === 0 ? (
                <div>
                  <div className={styles.emptyTitle}>0</div>
                  <div className={styles.emptySubtitle}>No contracts here</div>
                  <button
                    type="button"
                    className={styles.emptyAction}
                    onClick={() => router.push('/dashboard/contracts')}
                  >
                    View Your Contracts
                  </button>
                </div>
              ) : (
                <div className={styles.contractList}>
                  {contracts.map((contract) => (
                    <div key={contract.id} className={styles.contractItem}>
                      <div>
                        <div className={styles.contractTitle}>{contract.title}</div>
                        <div className={styles.contractMeta}>
                          <ContractStatusBadge status={contract.status} />
                        </div>
                      </div>
                      <div className={styles.contractActions}>
                        <button
                          type="button"
                          className={styles.tab}
                          onClick={() => router.push(`/dashboard/contracts?contractId=${contract.id}`)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className={styles.tab}
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
      </div>

      <ThirdPartyUploadSidebar
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={async () => {
          await loadContracts()
        }}
      />
    </div>
  )
}
