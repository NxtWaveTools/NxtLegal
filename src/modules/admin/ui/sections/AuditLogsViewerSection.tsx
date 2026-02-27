import type { FormEvent } from 'react'
import Spinner from '@/components/ui/Spinner'
import {
  formatAuditAction,
  formatAuditActor,
  formatAuditDate,
  formatAuditMetadataEntries,
  formatAuditResource,
} from '@/modules/admin/lib/audit-log-formatters'
import styles from '../admin-console.module.css'

type AuditLogViewItem = {
  id: string
  userId: string
  action: string
  eventType: string | null
  actorEmail: string | null
  actorRole: string | null
  targetEmail: string | null
  noteText: string | null
  actorName: string | null
  actorResolvedEmail: string | null
  resourceType: string
  resourceId: string
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

type AuditLogsViewerSectionProps = {
  logs: AuditLogViewItem[]
  selectedLogId: string | null
  isLoading: boolean
  isExporting: boolean
  cursor: string | null
  total: number
  limit: number
  filters: {
    query: string
    action: string
    resourceType: string
    userId: string
    from: string
    to: string
  }
  onFilterChange: (key: 'query' | 'action' | 'resourceType' | 'userId' | 'from' | 'to', value: string) => void
  onApplyFilters: () => void
  onNextPage: () => void
  onResetPaging: () => void
  onSelectLog: (logId: string) => void
  onExportCsv: () => void
}

export default function AuditLogsViewerSection({
  logs,
  selectedLogId,
  isLoading,
  isExporting,
  cursor,
  total,
  limit,
  filters,
  onFilterChange,
  onApplyFilters,
  onNextPage,
  onResetPaging,
  onSelectLog,
  onExportCsv,
}: AuditLogsViewerSectionProps) {
  const selectedLog = logs.find((item) => item.id === selectedLogId) ?? null

  const handleApplyFiltersSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onApplyFilters()
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Audit Logs Viewer</h2>

      <form onSubmit={handleApplyFiltersSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Search</span>
          <input
            className={styles.input}
            value={filters.query}
            onChange={(event) => onFilterChange('query', event.target.value)}
            placeholder="action, resource, or actor"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Action</span>
          <input
            className={styles.input}
            value={filters.action}
            onChange={(event) => onFilterChange('action', event.target.value)}
            placeholder="admin.system_configuration.updated"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Resource Type</span>
          <input
            className={styles.input}
            value={filters.resourceType}
            onChange={(event) => onFilterChange('resourceType', event.target.value)}
            placeholder="system_configuration"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Actor User ID</span>
          <input
            className={styles.input}
            value={filters.userId}
            onChange={(event) => onFilterChange('userId', event.target.value)}
            placeholder="user id"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>From (ISO timestamp)</span>
          <input
            className={styles.input}
            value={filters.from}
            onChange={(event) => onFilterChange('from', event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>To (ISO timestamp)</span>
          <input
            className={styles.input}
            value={filters.to}
            onChange={(event) => onFilterChange('to', event.target.value)}
          />
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={isLoading}>
            <span className={styles.buttonContent}>
              {isLoading ? <Spinner size={14} /> : null}
              Apply Filters
            </span>
          </button>
        </div>
      </form>

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onResetPaging} disabled={isLoading}>
          <span className={styles.buttonContent}>
            {isLoading ? <Spinner size={14} /> : null}
            First Page
          </span>
        </button>
        <button type="button" className={styles.button} onClick={onNextPage} disabled={isLoading || !cursor}>
          <span className={styles.buttonContent}>
            {isLoading ? <Spinner size={14} /> : null}
            Next Page
          </span>
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onExportCsv}
          disabled={isExporting}
        >
          <span className={styles.buttonContent}>
            {isExporting ? <Spinner size={14} /> : null}
            {isExporting ? 'Downloading...' : 'Export CSV'}
          </span>
        </button>
      </div>

      <div className={styles.preview}>
        {isLoading ? (
          'Loading audit logs...'
        ) : logs.length === 0 ? (
          'No audit logs found for the selected filters.'
        ) : (
          <div className={styles.auditTableWrap}>
            <table className={styles.auditTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((item) => {
                  const resource = formatAuditResource(item)

                  return (
                    <tr
                      key={item.id}
                      className={selectedLogId === item.id ? styles.auditRowSelected : undefined}
                      onClick={() => onSelectLog(item.id)}
                    >
                      <td>{formatAuditDate(item.createdAt)}</td>
                      <td>{formatAuditAction(item.action)}</td>
                      <td title={resource.fullId}>{resource.display}</td>
                      <td>{formatAuditActor(item)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={styles.preview}>
        Total: {total} | Limit: {limit} | Next Cursor: {cursor ?? 'none'}
      </div>

      <div className={styles.preview}>
        {selectedLog ? (
          <>
            <strong>Detail Payload</strong>
            <div>Log ID: {selectedLog.id}</div>
            <div>Action: {formatAuditAction(selectedLog.action)}</div>
            <div>
              {(() => {
                const resource = formatAuditResource(selectedLog)
                return <span title={resource.fullId}>Resource: {resource.display}</span>
              })()}
            </div>
            <div>Actor: {formatAuditActor(selectedLog)}</div>
            <div>Created At: {formatAuditDate(selectedLog.createdAt)}</div>
            <div>Event Type: {selectedLog.eventType ?? '—'}</div>
            <div className={styles.rolePills}>
              {formatAuditMetadataEntries(selectedLog).map((entry, index) => (
                <span key={`${entry.label}-${index}`} className={styles.rolePill}>
                  {entry.label}: {entry.value}
                </span>
              ))}
            </div>
          </>
        ) : (
          'Select a row to view detail payload.'
        )}
      </div>
    </div>
  )
}
