import Spinner from '@/components/ui/Spinner'
import styles from '../admin-console.module.css'

type AuditLogViewItem = {
  id: string
  userId: string
  action: string
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

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Audit Logs Viewer</h2>

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
        <button type="button" className={styles.button} onClick={onApplyFilters} disabled={isLoading}>
          <span className={styles.buttonContent}>
            {isLoading ? <Spinner size={14} /> : null}
            Apply Filters
          </span>
        </button>
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
        <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={onExportCsv}>
          Export CSV
        </button>
      </div>

      <div className={styles.preview}>
        {isLoading
          ? 'Loading audit logs...'
          : logs.length === 0
            ? 'No audit logs found for the selected filters.'
            : logs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.button} ${selectedLogId === item.id ? styles.buttonPrimary : ''}`}
                  onClick={() => onSelectLog(item.id)}
                >
                  {item.createdAt} | {item.action} | {item.resourceType} | {item.userId}
                </button>
              ))}
      </div>

      <div className={styles.preview}>
        Total: {total} | Limit: {limit} | Next Cursor: {cursor ?? 'none'}
      </div>

      <div className={styles.preview}>
        {selectedLog ? (
          <>
            <strong>Detail Payload</strong>
            <div>Log ID: {selectedLog.id}</div>
            <div>Action: {selectedLog.action}</div>
            <div>
              Resource: {selectedLog.resourceType} / {selectedLog.resourceId}
            </div>
            <div>Actor: {selectedLog.userId}</div>
            <div>Created At: {selectedLog.createdAt}</div>
            <div>Changes: {JSON.stringify(selectedLog.changes ?? {}, null, 2)}</div>
            <div>Metadata: {JSON.stringify(selectedLog.metadata ?? {}, null, 2)}</div>
          </>
        ) : (
          'Select a row to view detail payload.'
        )}
      </div>
    </div>
  )
}
