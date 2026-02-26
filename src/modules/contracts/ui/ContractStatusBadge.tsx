import { contractStatusLabels, type ContractStatus } from '@/core/constants/contracts'
import styles from './ContractStatusBadge.module.css'

type ContractStatusBadgeProps = {
  status: ContractStatus | string
  displayLabel?: string
}

const statusClassName: Record<ContractStatus, string> = {
  DRAFT: styles.draft,
  UPLOADED: styles.uploaded,
  HOD_PENDING: styles.hodPending,
  UNDER_REVIEW: styles.underReview,
  PENDING_WITH_INTERNAL_STAKEHOLDERS: styles.pendingInternal,
  PENDING_WITH_EXTERNAL_STAKEHOLDERS: styles.pendingExternal,
  OFFLINE_EXECUTION: styles.offlineExecution,
  ON_HOLD: styles.onHold,
  COMPLETED: styles.completed,
  EXECUTED: styles.executed,
  VOID: styles.voided,
  REJECTED: styles.rejected,
}

export default function ContractStatusBadge({ status, displayLabel }: ContractStatusBadgeProps) {
  const normalized = status as ContractStatus
  const label = displayLabel ?? contractStatusLabels[normalized] ?? status
  const className = statusClassName[normalized] ?? styles.uploaded

  return <span className={`${styles.badge} ${className}`}>{label}</span>
}
