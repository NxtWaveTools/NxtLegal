'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef, type SortingState, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { toast } from 'sonner'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import ThirdPartyUploadSidebar from '@/modules/contracts/ui/third-party-upload/ThirdPartyUploadSidebar'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import {
  contractUploadModes,
  contractRepositoryExportColumnLabels,
  contractRepositoryExportColumns,
  contractRepositoryStatusLabels,
} from '@/core/constants/contracts'
import {
  contractsClient,
  type ContractRecord,
  type LegalTeamMemberOption,
  type RepositoryDateBasis,
  type RepositoryExportColumn,
  type RepositoryStatusFilter,
  type RepositoryDatePreset,
  type RepositorySortBy,
} from '@/core/client/contracts-client'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import styles from './RepositoryWorkspace.module.css'

type RepositoryWorkspaceProps = {
  session: {
    fullName?: string | null
    email?: string | null
    team?: string | null
    role?: string | null
    canAccessApproverHistory?: boolean
  }
}

const timestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const legalDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const resolveFileExtension = (fileName: string): string => {
  const normalizedFileName = fileName.trim().toLowerCase()
  const lastDotIndex = normalizedFileName.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === normalizedFileName.length - 1) {
    return ''
  }

  return normalizedFileName.slice(lastDotIndex + 1)
}

const sortableColumnMap: Record<string, RepositorySortBy> = {
  title: 'title',
  requestDate: 'created_at',
  hodApprovedAt: 'hod_approved_at',
  status: 'status',
  contractAging: 'tat_deadline_at',
}

const repositoryDatePresetOptions: Array<{ value: RepositoryDatePreset; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'multiple_months', label: 'Multiple Months' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom Date Range' },
]

const repositoryDateBasisOptions: Array<{ value: RepositoryDateBasis; label: string }> = [
  { value: 'request_created_at', label: 'Request Date' },
  { value: 'hod_approved_at', label: 'HOD Approval Date' },
]

const agingPolicyText = '7 business days'
const defaultExportColumns = Object.values(contractRepositoryExportColumns) as RepositoryExportColumn[]
const stuckStateStatuses = new Set([
  'UNDER_REVIEW',
  'PENDING_WITH_INTERNAL_STAKEHOLDERS',
  'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
  'SIGNING',
])

function getDaysInStatus(updatedAt?: string): number | null {
  if (!updatedAt) {
    return null
  }

  const updatedAtDate = new Date(updatedAt)
  if (Number.isNaN(updatedAtDate.getTime())) {
    return null
  }

  const msDifference = Date.now() - updatedAtDate.getTime()
  return Math.max(0, Math.floor(msDifference / (1000 * 60 * 60 * 24)))
}

function getStuckTone(daysInStatus: number): 'green' | 'yellow' | 'red' {
  if (daysInStatus <= 3) {
    return 'green'
  }

  if (daysInStatus <= 7) {
    return 'yellow'
  }

  return 'red'
}

function getAgingTone(agingBusinessDays: number | null | undefined): 'green' | 'yellow' | 'red' | 'neutral' {
  if (typeof agingBusinessDays !== 'number') {
    return 'neutral'
  }

  if (agingBusinessDays <= 5) {
    return 'green'
  }

  if (agingBusinessDays <= 7) {
    return 'yellow'
  }

  return 'red'
}

function formatOverdueLabel(record: ContractRecord): string | null {
  if (!record.isTatBreached || typeof record.agingBusinessDays !== 'number') {
    return null
  }

  const overdueDays = Math.max(record.agingBusinessDays - 7, 0)
  if (overdueDays === 0) {
    return 'TAT Breached'
  }

  return `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
}

function formatLegalDate(value?: string | null): string {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return legalDateFormatter.format(parsed).replace(/\//g, '-')
}

function resolveAssignedToDisplay(record: ContractRecord): {
  visibleAssignees: string
  hiddenCount: number
  fullAssignees: string
} {
  const assignees = (record.assignedToUsers ?? [record.currentAssigneeEmail]).filter((value): value is string =>
    Boolean(value)
  )

  if (assignees.length === 0) {
    return {
      visibleAssignees: '—',
      hiddenCount: 0,
      fullAssignees: '—',
    }
  }

  const visibleAssignees = assignees.slice(0, 2).join(', ')
  const hiddenCount = Math.max(assignees.length - 2, 0)

  return {
    visibleAssignees,
    hiddenCount,
    fullAssignees: assignees.join(', '),
  }
}

function toFallbackDisplayName(email: string): string {
  const localPart = email.split('@')[0] ?? email
  const normalized = localPart.replace(/[._-]+/g, ' ').trim()

  if (!normalized) {
    return email
  }

  return normalized
    .split(' ')
    .map((segment) => (segment.length > 0 ? `${segment[0].toUpperCase()}${segment.slice(1)}` : segment))
    .join(' ')
}

export default function RepositoryWorkspace({ session }: RepositoryWorkspaceProps) {
  const router = useRouter()
  const normalizedRole = (session.role ?? '').toUpperCase()
  const isLegalTeamRole = normalizedRole === 'LEGAL_TEAM'
  const canAccessRepositoryReporting =
    isLegalTeamRole ||
    normalizedRole === 'LEGAL_ADMIN' ||
    normalizedRole === 'ADMIN' ||
    normalizedRole === 'SUPER_ADMIN'

  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)
  const [statusFilter, setStatusFilter] = useState<RepositoryStatusFilter | ''>('')
  const [dateBasis, setDateBasis] = useState<RepositoryDateBasis>('request_created_at')
  const [datePreset, setDatePreset] = useState<RepositoryDatePreset | ''>('')
  const [customFromDate, setCustomFromDate] = useState('')
  const [customToDate, setCustomToDate] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'requestDate', desc: true }])
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([undefined])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [reportMetrics, setReportMetrics] = useState<{
    departmentMetrics: Array<{
      departmentId: string | null
      departmentName: string | null
      totalRequestsReceived: number
      approved: number
      rejected: number
      completed: number
      pending: number
    }>
    statusMetrics: Array<{ key: string; label: string; count: number }>
  } | null>(null)
  const [isReportLoading, setIsReportLoading] = useState(false)
  const [selectedExportColumns, setSelectedExportColumns] = useState<RepositoryExportColumn[]>(defaultExportColumns)
  const [activeExportFormat, setActiveExportFormat] = useState<'csv' | 'excel' | null>(null)
  const [activePreview, setActivePreview] = useState<{
    url: string
    fileName: string
    fileMimeType: string
    externalUrl: string
  } | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [legalTeamMembers, setLegalTeamMembers] = useState<LegalTeamMemberOption[]>([])
  const [legalTeamMembersError, setLegalTeamMembersError] = useState<string | null>(null)
  const [openAssignmentDropdownContractId, setOpenAssignmentDropdownContractId] = useState<string | null>(null)
  const [assignmentSavingByContractId, setAssignmentSavingByContractId] = useState<Record<string, boolean>>({})
  const [assignmentErrorByContractId, setAssignmentErrorByContractId] = useState<Record<string, string>>({})
  const tableWrapRef = useRef<HTMLElement | null>(null)
  const tableAutoScrollFrameRef = useRef<number | null>(null)
  const tableAutoScrollVelocityRef = useRef(0)

  const stopTableAutoScroll = useCallback(() => {
    tableAutoScrollVelocityRef.current = 0
    if (tableAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(tableAutoScrollFrameRef.current)
      tableAutoScrollFrameRef.current = null
    }
  }, [])

  const runTableAutoScroll = useCallback(() => {
    const tableWrap = tableWrapRef.current
    if (!tableWrap) {
      stopTableAutoScroll()
      return
    }

    const velocity = tableAutoScrollVelocityRef.current
    if (Math.abs(velocity) < 0.1) {
      stopTableAutoScroll()
      return
    }

    tableWrap.scrollLeft += velocity
    tableAutoScrollFrameRef.current = window.requestAnimationFrame(runTableAutoScroll)
  }, [stopTableAutoScroll])

  const handleTableWrapMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const tableWrap = event.currentTarget
      if (tableWrap.scrollWidth <= tableWrap.clientWidth) {
        stopTableAutoScroll()
        return
      }

      const bounds = tableWrap.getBoundingClientRect()
      const edgeThreshold = Math.min(96, bounds.width * 0.2)
      const maxSpeed = 14

      let velocity = 0
      const distanceFromLeftEdge = event.clientX - bounds.left
      const distanceFromRightEdge = bounds.right - event.clientX

      if (distanceFromLeftEdge <= edgeThreshold) {
        const ratio = (edgeThreshold - distanceFromLeftEdge) / edgeThreshold
        velocity = -Math.max(1, maxSpeed * ratio)
      } else if (distanceFromRightEdge <= edgeThreshold) {
        const ratio = (edgeThreshold - distanceFromRightEdge) / edgeThreshold
        velocity = Math.max(1, maxSpeed * ratio)
      }

      tableAutoScrollVelocityRef.current = velocity

      if (velocity !== 0 && tableAutoScrollFrameRef.current === null) {
        tableAutoScrollFrameRef.current = window.requestAnimationFrame(runTableAutoScroll)
      }

      if (velocity === 0) {
        stopTableAutoScroll()
      }
    },
    [runTableAutoScroll, stopTableAutoScroll]
  )

  const activeCursor = cursorHistory[cursorHistory.length - 1]

  const activeSort = sorting[0]
  const sortBy = sortableColumnMap[activeSort?.id ?? 'requestDate'] ?? 'created_at'
  const sortDirection = activeSort?.desc ? 'desc' : 'asc'

  // Fires list and report as two *parallel* browser requests rather than a single
  // combined server-side request.  The server's Promise.all approach caused internal
  const loadContractsAndReport = useCallback(async () => {
    setIsLoading(true)
    if (canAccessRepositoryReporting) {
      setIsReportLoading(true)
    }

    try {
      const response = await contractsClient.repositoryList({
        cursor: activeCursor,
        limit: 15,
        sortBy,
        sortDirection,
        search: debouncedSearch,
        repositoryStatus: statusFilter || undefined,
        dateBasis,
        datePreset: datePreset || undefined,
        fromDate: datePreset === 'custom' && customFromDate ? customFromDate : undefined,
        toDate: datePreset === 'custom' && customToDate ? customToDate : undefined,
        includeReport: canAccessRepositoryReporting,
      })

      if (!response.ok || !response.data) {
        setContracts([])
        setNextCursor(null)
        toast.error(response.error?.message ?? 'Failed to load repository contracts')
        return
      }

      setContracts(response.data.contracts)
      setNextCursor(response.data.pagination.cursor)

      if (canAccessRepositoryReporting) {
        setReportMetrics(response.data.report ?? null)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
      if (canAccessRepositoryReporting) {
        setIsReportLoading(false)
      }
    }
  }, [
    canAccessRepositoryReporting,
    activeCursor,
    customFromDate,
    customToDate,
    dateBasis,
    datePreset,
    debouncedSearch,
    statusFilter,
    sortBy,
    sortDirection,
  ])

  useEffect(() => {
    void loadContractsAndReport()
  }, [loadContractsAndReport])

  useEffect(() => {
    if (!isLegalTeamRole) {
      setLegalTeamMembers([])
      setLegalTeamMembersError(null)
      return
    }

    const loadLegalTeamMembers = async () => {
      const response = await contractsClient.legalTeamMembers()

      if (!response.ok || !response.data) {
        setLegalTeamMembers([])
        setLegalTeamMembersError(response.error?.message ?? 'Failed to load legal team members')
        return
      }

      setLegalTeamMembers(response.data.members)
      setLegalTeamMembersError(null)
    }

    void loadLegalTeamMembers()
  }, [isLegalTeamRole])

  useEffect(() => {
    setCursorHistory([undefined])
  }, [customFromDate, customToDate, dateBasis, datePreset, debouncedSearch, statusFilter, sortBy, sortDirection])

  const handleStatusFilterChange = (value: RepositoryStatusFilter | '') => {
    setStatusFilter(value)
  }

  const handleDateBasisChange = (value: RepositoryDateBasis) => {
    setDateBasis(value)
  }

  const handleDatePresetChange = (value: RepositoryDatePreset | '') => {
    setDatePreset(value)
    if (value !== 'custom') {
      setCustomFromDate('')
      setCustomToDate('')
    }
  }

  const closePreview = useCallback(() => {
    setActivePreview(null)
  }, [])

  useEffect(() => {
    if (!activePreview) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreview()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePreview, closePreview])

  useEffect(() => () => stopTableAutoScroll(), [stopTableAutoScroll])

  const handleOpenCurrentDocument = useCallback(async (contract: ContractRecord) => {
    const response = await contractsClient.download(contract.id, {
      documentId: contract.currentDocumentId ?? undefined,
    })

    if (!response.ok || !response.data?.signedUrl) {
      toast.error(response.error?.message ?? 'Failed to generate document view link')
      return
    }

    const resolvedFileName = (response.data.fileName ?? contract.fileName?.trim()) || contract.title
    const resolvedMimeType = (contract.fileMimeType ?? '').trim().toLowerCase()
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
    const renderAsHtml = isDocx || isLegacyDoc || isPresentation || isSpreadsheet || isTextPreview

    const previewUrl = contractsClient.previewUrl(contract.id, {
      documentId: contract.currentDocumentId ?? undefined,
      renderAs: renderAsHtml ? 'html' : 'binary',
    })

    setActivePreview({
      url: previewUrl,
      fileName: resolvedFileName,
      fileMimeType: resolvedMimeType,
      externalUrl: response.data.signedUrl,
    })
  }, [])

  const resolveContractAssignedEmails = useCallback((contract: ContractRecord): string[] => {
    const assignees = (contract.assignedToUsers ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)
    return Array.from(new Set(assignees))
  }, [])

  const resolveEmailDisplayName = useCallback(
    (email: string): string => {
      const member = legalTeamMembers.find((item) => item.email.toLowerCase() === email.toLowerCase())
      if (member?.fullName?.trim()) {
        return member.fullName
      }

      return toFallbackDisplayName(email)
    },
    [legalTeamMembers]
  )

  const handleContractAssignmentChange = useCallback(
    async (contractId: string, selectedEmails: string[]) => {
      if (!isLegalTeamRole) {
        return
      }

      const targetContract = contracts.find((contract) => contract.id === contractId)
      if (!targetContract) {
        return
      }

      const previousEmails = resolveContractAssignedEmails(targetContract)
      const nextEmails = Array.from(new Set(selectedEmails.map((value) => value.trim().toLowerCase()).filter(Boolean)))

      if (previousEmails.length === nextEmails.length && previousEmails.every((email) => nextEmails.includes(email))) {
        return
      }

      const emailsToAdd = nextEmails.filter((email) => !previousEmails.includes(email))
      const emailsToRemove = previousEmails.filter((email) => !nextEmails.includes(email))

      setAssignmentSavingByContractId((current) => ({ ...current, [contractId]: true }))
      setAssignmentErrorByContractId((current) => {
        const next = { ...current }
        delete next[contractId]
        return next
      })

      try {
        for (const email of emailsToAdd) {
          const response = await contractsClient.manageAssignment(contractId, {
            operation: 'add_collaborator',
            collaboratorEmail: email,
          })

          if (!response.ok) {
            throw new Error(response.error?.message ?? 'Failed to add collaborator')
          }
        }

        for (const email of emailsToRemove) {
          const response = await contractsClient.manageAssignment(contractId, {
            operation: 'remove_collaborator',
            collaboratorEmail: email,
          })

          if (!response.ok) {
            throw new Error(response.error?.message ?? 'Failed to remove collaborator')
          }
        }

        setContracts((current) =>
          current.map((contract) =>
            contract.id === contractId ? { ...contract, assignedToUsers: nextEmails } : contract
          )
        )
        setOpenAssignmentDropdownContractId(contractId)
      } catch (assignmentError) {
        setAssignmentErrorByContractId((current) => ({
          ...current,
          [contractId]: assignmentError instanceof Error ? assignmentError.message : 'Failed to update assignment',
        }))
      } finally {
        setAssignmentSavingByContractId((current) => ({ ...current, [contractId]: false }))
      }
    },
    [contracts, isLegalTeamRole, resolveContractAssignedEmails]
  )

  const columns = useMemo<ColumnDef<ContractRecord>[]>(
    () => [
      {
        accessorKey: 'requestDate',
        header: 'Request Date',
        cell: ({ row }) => {
          const requestDate = row.original.requestCreatedAt ?? row.original.createdAt
          return requestDate ? timestampFormatter.format(new Date(requestDate)) : '—'
        },
      },
      {
        accessorKey: 'creator',
        header: 'Creator',
        cell: ({ row }) => {
          const creatorName = row.original.creatorName?.trim()
          const creatorEmail = row.original.uploadedByEmail?.trim()

          if (creatorName && creatorEmail) {
            return `${creatorName} (${creatorEmail})`
          }

          return creatorName || creatorEmail || '—'
        },
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ row }) => row.original.departmentName ?? '—',
      },
      {
        accessorKey: 'createdAt',
        header: 'Contract',
        cell: ({ row }) => (
          <button
            type="button"
            className={styles.contractTitleAction}
            onClick={(event) => {
              event.stopPropagation()
              void handleOpenCurrentDocument(row.original)
            }}
            title="Open current document"
          >
            {row.original.title}
          </button>
        ),
      },
      {
        accessorKey: 'hodApprovedAt',
        header: 'HOD Approval',
        cell: ({ row }) =>
          row.original.hodApprovedAt ? (
            <div className={styles.hodApprovalWrap}>
              <span className={styles.hodApproved}>Yes</span>
              <span className={styles.muted}>{timestampFormatter.format(new Date(row.original.hodApprovedAt))}</span>
            </div>
          ) : (
            <span className={styles.hodPending}>No</span>
          ),
      },
      {
        accessorKey: 'tatPolicy',
        header: 'TAT',
        cell: () => agingPolicyText,
      },
      {
        accessorKey: 'contractAging',
        header: 'Contract Aging',
        cell: ({ row }) => {
          const tone = getAgingTone(row.original.agingBusinessDays)
          const overdueLabel = formatOverdueLabel(row.original)

          return (
            <div className={styles.agingWrap}>
              <span className={styles[`agingTone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`]}>
                {typeof row.original.agingBusinessDays === 'number' ? `${row.original.agingBusinessDays} days` : '—'}
              </span>
              {overdueLabel ? <span className={styles.overdueLabel}>{overdueLabel}</span> : null}
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const daysInStatus = getDaysInStatus(row.original.updatedAt)
          const shouldShowStuckBadge = stuckStateStatuses.has(row.original.status) && typeof daysInStatus === 'number'
          const stuckTone = typeof daysInStatus === 'number' ? getStuckTone(daysInStatus) : 'green'

          return (
            <div className={styles.statusWrap}>
              <ContractStatusBadge
                status={row.original.status}
                displayLabel={row.original.repositoryStatusLabel ?? row.original.displayStatusLabel}
              />
              {shouldShowStuckBadge ? (
                <span className={styles[`stuckTone${stuckTone.charAt(0).toUpperCase()}${stuckTone.slice(1)}`]}>
                  {daysInStatus} day{daysInStatus === 1 ? '' : 's'} in status
                </span>
              ) : null}
              {row.original.status === 'VOID' && row.original.voidReason ? (
                <span className={styles.voidReason}>Void: {row.original.voidReason}</span>
              ) : null}
            </div>
          )
        },
      },
      {
        accessorKey: 'assignedTo',
        header: 'Assigned To',
        cell: ({ row }) => {
          if (isLegalTeamRole) {
            const selectedEmails = resolveContractAssignedEmails(row.original)
            const selectedDisplayNames = selectedEmails.map((email) => resolveEmailDisplayName(email))
            const isSaving = Boolean(assignmentSavingByContractId[row.original.id])
            const assignmentError = assignmentErrorByContractId[row.original.id]
            const isDropdownOpen = openAssignmentDropdownContractId === row.original.id
            const triggerLabel = selectedDisplayNames.length > 0 ? selectedDisplayNames.join(', ') : 'Assign Contract'

            return (
              <div
                className={styles.assignedToEditor}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className={styles.assignedToTrigger}
                  disabled={isSaving || legalTeamMembers.length === 0}
                  onClick={() =>
                    setOpenAssignmentDropdownContractId((current) =>
                      current === row.original.id ? null : row.original.id
                    )
                  }
                  title={triggerLabel}
                >
                  <span className={styles.assignedToTriggerLabel}>{triggerLabel}</span>
                  <span className={styles.assignedToTriggerCaret}>{isDropdownOpen ? '▴' : '▾'}</span>
                </button>
                {isDropdownOpen ? (
                  <div className={styles.assignedToDropdown}>
                    {selectedEmails.length > 0 ? (
                      <button
                        type="button"
                        className={styles.assignedToClearAll}
                        disabled={isSaving}
                        onClick={() => {
                          void handleContractAssignmentChange(row.original.id, [])
                        }}
                      >
                        Clear all
                      </button>
                    ) : null}
                    {legalTeamMembers.map((member) => {
                      const memberEmail = member.email.toLowerCase()
                      const isSelected = selectedEmails.includes(memberEmail)
                      const memberDisplayName = member.fullName?.trim() || toFallbackDisplayName(member.email)

                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={`${styles.assignedToOption} ${isSelected ? styles.assignedToOptionSelected : ''}`}
                          disabled={isSaving}
                          onClick={() => {
                            const nextSelected = isSelected
                              ? selectedEmails.filter((email) => email !== memberEmail)
                              : [...selectedEmails, memberEmail]
                            void handleContractAssignmentChange(row.original.id, nextSelected)
                          }}
                        >
                          <span>{memberDisplayName}</span>
                          {isSelected ? <span className={styles.assignedToOptionCheck}>✓</span> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {legalTeamMembersError ? <span className={styles.assignmentError}>{legalTeamMembersError}</span> : null}
                {assignmentError ? <span className={styles.assignmentError}>{assignmentError}</span> : null}
                {isSaving ? <span className={styles.assignmentSaving}>Saving…</span> : null}
              </div>
            )
          }

          const display = resolveAssignedToDisplay(row.original)

          return (
            <div className={styles.assignedToWrap} title={display.fullAssignees}>
              <span className={styles.assignedToPrimary}>{display.visibleAssignees}</span>
              {display.hiddenCount > 0 ? (
                <span className={styles.assignedToMore}>+{display.hiddenCount} more</span>
              ) : null}
            </div>
          )
        },
      },
      {
        accessorKey: 'executedAt',
        header: 'Executed Date & Time',
        cell: ({ row }) =>
          row.original.executedAt ? timestampFormatter.format(new Date(row.original.executedAt)) : '—',
      },
      ...(isLegalTeamRole
        ? [
            {
              accessorKey: 'legalEffectiveDate',
              header: () => <span className={styles.legalMetadataHeader}>Effective Date</span>,
              cell: ({ row }: { row: { original: ContractRecord } }) => (
                <span className={styles.legalMetadataValue}>{formatLegalDate(row.original.legalEffectiveDate)}</span>
              ),
            },
            {
              accessorKey: 'legalTerminationDate',
              header: () => <span className={styles.legalMetadataHeader}>Termination Date</span>,
              cell: ({ row }: { row: { original: ContractRecord } }) => (
                <span className={styles.legalMetadataValue}>{formatLegalDate(row.original.legalTerminationDate)}</span>
              ),
            },
            {
              accessorKey: 'legalNoticePeriod',
              header: () => <span className={styles.legalMetadataHeader}>Notice Period</span>,
              cell: ({ row }: { row: { original: ContractRecord } }) => {
                const value = row.original.legalNoticePeriod?.trim()
                return <span className={styles.legalMetadataValue}>{value && value.length > 0 ? value : '-'}</span>
              },
            },
            {
              accessorKey: 'legalAutoRenewal',
              header: () => <span className={styles.legalMetadataHeader}>Auto-renewal</span>,
              cell: ({ row }: { row: { original: ContractRecord } }) => (
                <span className={styles.legalMetadataValue}>
                  {row.original.legalAutoRenewal === true
                    ? 'Yes'
                    : row.original.legalAutoRenewal === false
                      ? 'No'
                      : '-'}
                </span>
              ),
            },
          ]
        : []),
    ],
    [
      assignmentErrorByContractId,
      assignmentSavingByContractId,
      handleContractAssignmentChange,
      handleOpenCurrentDocument,
      isLegalTeamRole,
      legalTeamMembers,
      legalTeamMembersError,
      openAssignmentDropdownContractId,
      resolveEmailDisplayName,
      resolveContractAssignedEmails,
    ]
  )

  const toggleExportColumn = (column: RepositoryExportColumn) => {
    setSelectedExportColumns((previous) => {
      if (previous.includes(column)) {
        return previous.filter((entry) => entry !== column)
      }

      return [...previous, column]
    })
  }

  const downloadExport = (format: 'csv' | 'excel' | 'pdf') => {
    const exportUrl = contractsClient.repositoryExportUrl({
      search: debouncedSearch,
      repositoryStatus: statusFilter || undefined,
      dateBasis,
      datePreset: datePreset || undefined,
      fromDate: datePreset === 'custom' && customFromDate ? customFromDate : undefined,
      toDate: datePreset === 'custom' && customToDate ? customToDate : undefined,
      format,
      columns: selectedExportColumns,
    })

    window.open(exportUrl, '_blank', 'noopener,noreferrer')
    setActiveExportFormat(null)
  }

  const table = useReactTable({
    data: contracts,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(next)
    },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <ProtectedAppShell
      session={{ fullName: session.fullName, email: session.email, team: session.team, role: session.role }}
      activeNav="repository"
      canAccessApproverHistory={session.canAccessApproverHistory}
      quickAction={
        normalizedRole === 'HOD'
          ? {
              ariaLabel: 'Upload third-party contract',
              onClick: () => setIsUploadOpen(true),
              isActive: isUploadOpen,
            }
          : undefined
      }
    >
      <main className={styles.main}>
        <ErrorBoundary sectionLabel="contract repository">
          <section className={styles.header}>
            <div>
              <h1 className={styles.title}>Repository</h1>
              <p className={styles.subtitle}>Search and browse all accessible contracts</p>
            </div>
            <div className={styles.controls}>
              <input
                className={styles.searchInput}
                placeholder="Search by contract name"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                }}
              />
              <select
                className={styles.statusSelect}
                value={statusFilter}
                onChange={(event) => handleStatusFilterChange(event.target.value as RepositoryStatusFilter | '')}
              >
                <option value="">All statuses</option>
                {Object.entries(contractRepositoryStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className={styles.statusSelect}
                value={dateBasis}
                onChange={(event) => handleDateBasisChange(event.target.value as RepositoryDateBasis)}
              >
                {repositoryDateBasisOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className={styles.statusSelect}
                value={datePreset}
                onChange={(event) => handleDatePresetChange(event.target.value as RepositoryDatePreset | '')}
              >
                <option value="">All time</option>
                {repositoryDatePresetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {datePreset === 'custom' ? (
                <>
                  <input
                    type="date"
                    className={styles.searchInput}
                    value={customFromDate}
                    onChange={(event) => setCustomFromDate(event.target.value)}
                  />
                  <input
                    type="date"
                    className={styles.searchInput}
                    value={customToDate}
                    onChange={(event) => setCustomToDate(event.target.value)}
                  />
                </>
              ) : null}
            </div>
          </section>

          {canAccessRepositoryReporting ? (
            <section className={styles.reportingSection}>
              <div className={styles.reportingHeader}>
                <h2 className={styles.reportingTitle}>Repository Reporting</h2>
                <div className={styles.exportActions}>
                  <button type="button" className={styles.pageButton} onClick={() => setActiveExportFormat('csv')}>
                    Export CSV
                  </button>
                  <button type="button" className={styles.pageButton} onClick={() => setActiveExportFormat('excel')}>
                    Export Excel
                  </button>
                </div>
              </div>
              {activeExportFormat ? (
                <div className={styles.exportConfigurator}>
                  <div className={styles.exportConfiguratorHeader}>
                    <div>
                      <h3 className={styles.exportConfiguratorTitle}>
                        Choose columns for {activeExportFormat === 'csv' ? 'CSV' : 'Excel'} export
                      </h3>
                      <p className={styles.exportConfiguratorHint}>
                        Select the fields you want to include in the file.
                      </p>
                    </div>
                    <div className={styles.exportConfiguratorActions}>
                      <button type="button" className={styles.pageButton} onClick={() => setActiveExportFormat(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={`${styles.pageButton} ${styles.primaryButton}`}
                        onClick={() => downloadExport(activeExportFormat)}
                      >
                        Download {activeExportFormat === 'csv' ? 'CSV' : 'Excel'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.exportColumnsGrid}>
                    {defaultExportColumns.map((column) => (
                      <label key={column} className={styles.exportColumnItem}>
                        <input
                          type="checkbox"
                          checked={selectedExportColumns.includes(column)}
                          onChange={() => toggleExportColumn(column)}
                        />
                        <span>{contractRepositoryExportColumnLabels[column]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {isReportLoading ? (
                <div className={styles.empty}>Loading report...</div>
              ) : reportMetrics ? (
                <div className={styles.reportingGrid}>
                  <div className={styles.metricCard}>
                    <h3 className={styles.metricTitle}>Department-wise Reporting</h3>
                    {reportMetrics.departmentMetrics.length === 0 ? (
                      <p className={styles.muted}>No department metrics available.</p>
                    ) : (
                      <ul className={`${styles.metricList} ${styles.metricListScrollable}`}>
                        {reportMetrics.departmentMetrics.map((metric) => (
                          <li key={metric.departmentId ?? 'unassigned'} className={styles.metricListItem}>
                            <span className={styles.metricName}>{metric.departmentName ?? 'Unassigned'}</span>
                            <span className={styles.metricMeta}>
                              Total {metric.totalRequestsReceived} · Approved {metric.approved} · Rejected{' '}
                              {metric.rejected} · Completed {metric.completed} · Pending {metric.pending}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className={styles.metricCard}>
                    <h3 className={styles.metricTitle}>Status-wise Reporting</h3>
                    {reportMetrics.statusMetrics.length === 0 ? (
                      <p className={styles.muted}>No status metrics available.</p>
                    ) : (
                      <ul className={styles.metricList}>
                        {reportMetrics.statusMetrics.map((metric) => (
                          <li key={metric.key} className={styles.metricListItem}>
                            <span className={styles.metricName}>{metric.label}</span>
                            <span className={styles.metricValue}>{metric.count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className={styles.pagination}>
            <button
              type="button"
              className={styles.pageButton}
              disabled={cursorHistory.length <= 1}
              onClick={() => {
                setCursorHistory((previous) => previous.slice(0, previous.length - 1))
              }}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.pageButton}
              disabled={!nextCursor}
              onClick={() => {
                if (!nextCursor) {
                  return
                }

                setCursorHistory((previous) => [...previous, nextCursor])
              }}
            >
              Next
            </button>
          </section>

          <section
            ref={tableWrapRef}
            className={styles.tableWrap}
            onMouseMove={handleTableWrapMouseMove}
            onMouseLeave={stopTableAutoScroll}
          >
            {isLoading ? (
              <div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={styles.shimmerTableRow}>
                    <div className={styles.shimmerCell} style={{ width: `${50 + i * 8}%` }} />
                    <div className={styles.shimmerCell} style={{ width: '70%' }} />
                    <div className={styles.shimmerCell} style={{ width: '65%' }} />
                    <div className={styles.shimmerCell} style={{ width: '50%' }} />
                  </div>
                ))}
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort()
                        const sortedState = header.column.getIsSorted()

                        return (
                          <th key={header.id}>
                            {canSort ? (
                              <button
                                type="button"
                                className={styles.sortButton}
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {sortedState === 'asc' ? ' ↑' : sortedState === 'desc' ? ' ↓' : ''}
                              </button>
                            ) : (
                              flexRender(header.column.columnDef.header, header.getContext())
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className={styles.empty}>
                        No contracts found.
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`${styles.row} ${row.original.isTatBreached ? styles.rowBreached : ''}`}
                        onClick={() =>
                          router.push(
                            contractsClient.resolveProtectedContractPath(row.original.id, {
                              from: 'repository',
                            })
                          )
                        }
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </section>

          {activePreview ? (
            <div
              className={styles.viewerOverlay}
              role="dialog"
              aria-modal="true"
              aria-label="Contract document preview"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closePreview()
                }
              }}
            >
              <div className={styles.viewerModal}>
                <div className={styles.viewerHeader}>
                  <div className={styles.viewerTitle}>{activePreview.fileName}</div>
                  <button type="button" className={styles.pageButton} onClick={closePreview}>
                    Close
                  </button>
                </div>
                <div className={styles.viewerBody}>
                  {activePreview.fileMimeType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activePreview.url} alt={activePreview.fileName} className={styles.viewerFrame} />
                  ) : (
                    <iframe src={activePreview.url} title={activePreview.fileName} className={styles.viewerFrame} />
                  )}
                </div>
                <div className={styles.viewerFooter}>
                  <span className={styles.muted}>If preview is not available, open in a new tab.</span>
                  <button
                    type="button"
                    className={`${styles.pageButton} ${styles.primaryButton}`}
                    onClick={() => window.open(activePreview.externalUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Open in New Tab
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <ThirdPartyUploadSidebar
            isOpen={isUploadOpen}
            mode={contractUploadModes.default}
            actorRole={session.role ?? undefined}
            onClose={() => setIsUploadOpen(false)}
            onUploaded={async () => {
              await loadContractsAndReport()
              router.refresh()
            }}
          />
        </ErrorBoundary>
      </main>
    </ProtectedAppShell>
  )
}
