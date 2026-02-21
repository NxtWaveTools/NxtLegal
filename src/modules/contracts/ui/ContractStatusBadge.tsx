import { contractStatusLabels, type ContractStatus } from '@/core/constants/contracts'
import styles from './ContractStatusBadge.module.css'

type ContractStatusBadgeProps = {
  status: ContractStatus | string
}

const statusClassName: Record<ContractStatus, string> = {
  DRAFT: styles.uploaded,
  UPLOADED: styles.uploaded,
  HOD_PENDING: styles.hodPending,
  HOD_APPROVED: styles.hodApproved,
  LEGAL_PENDING: styles.legalPending,
  LEGAL_QUERY: styles.legalQuery,
  FINAL_APPROVED: styles.finalApproved,
  REJECTED: styles.legalQuery,
}

export default function ContractStatusBadge({ status }: ContractStatusBadgeProps) {
  const normalized = status as ContractStatus
  const label = contractStatusLabels[normalized] ?? status
  const className = statusClassName[normalized] ?? styles.uploaded

  return <span className={`${styles.badge} ${className}`}>{label}</span>
}
