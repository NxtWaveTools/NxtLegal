'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef, type SortingState, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import ContractStatusBadge from '@/modules/contracts/ui/ContractStatusBadge'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import { contractStatuses } from '@/core/constants/contracts'
import { contractsClient, type ContractRecord, type RepositorySortBy } from '@/core/client/contracts-client'
import styles from './RepositoryWorkspace.module.css'

type RepositoryWorkspaceProps = {
  session: {
    fullName?: string | null
    role?: string | null
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

const sortableColumnMap: Record<string, RepositorySortBy> = {
  title: 'title',
  createdAt: 'created_at',
  hodApprovedAt: 'hod_approved_at',
  status: 'status',
}

export default function RepositoryWorkspace({ session }: RepositoryWorkspaceProps) {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([undefined])
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const activeCursor = cursorHistory[cursorHistory.length - 1]

  const activeSort = sorting[0]
  const sortBy = sortableColumnMap[activeSort?.id ?? 'createdAt'] ?? 'created_at'
  const sortDirection = activeSort?.desc ? 'desc' : 'asc'

  const loadContracts = useCallback(async () => {
    setIsLoading(true)

    const response = await contractsClient.repositoryList({
      cursor: activeCursor,
      limit: 15,
      search,
      status: statusFilter || undefined,
      sortBy,
      sortDirection,
    })

    if (!response.ok || !response.data) {
      setContracts([])
      setError(response.error?.message ?? 'Failed to load repository contracts')
      setNextCursor(null)
      setIsLoading(false)
      return
    }

    setContracts(response.data.contracts)
    setNextCursor(response.data.pagination.cursor)
    setError(null)
    setIsLoading(false)
  }, [activeCursor, search, statusFilter, sortBy, sortDirection])

  useEffect(() => {
    void loadContracts()
  }, [loadContracts])

  useEffect(() => {
    setCursorHistory([undefined])
  }, [search, statusFilter, sortBy, sortDirection])

  const columns = useMemo<ColumnDef<ContractRecord>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Name',
        cell: ({ row }) => row.original.title,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        cell: ({ row }) => timestampFormatter.format(new Date(row.original.createdAt)),
      },
      {
        accessorKey: 'hodApprovedAt',
        header: 'HOD Approved At',
        cell: ({ row }) =>
          row.original.hodApprovedAt ? timestampFormatter.format(new Date(row.original.hodApprovedAt)) : '—',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <ContractStatusBadge status={row.original.status} />,
      },
    ],
    []
  )

  // eslint-disable-next-line react-hooks/incompatible-library
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
    <ProtectedAppShell session={{ fullName: session.fullName, role: session.role }} activeNav="repository">
      <main className={styles.main}>
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
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className={styles.statusSelect}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value={contractStatuses.hodPending}>HOD Pending</option>
              <option value={contractStatuses.legalPending}>Legal Pending</option>
              <option value={contractStatuses.finalApproved}>Final Approved</option>
              <option value={contractStatuses.legalQuery}>Legal Query</option>
              <option value={contractStatuses.hodApproved}>HOD Approved</option>
              <option value={contractStatuses.uploaded}>Uploaded</option>
            </select>
          </div>
        </section>

        <section className={styles.tableWrap}>
          {isLoading ? (
            <div className={styles.empty}>Loading contracts...</div>
          ) : error ? (
            <div className={styles.empty}>{error}</div>
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
                    <td colSpan={4} className={styles.empty}>
                      No contracts found.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={styles.row}
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
      </main>
    </ProtectedAppShell>
  )
}
