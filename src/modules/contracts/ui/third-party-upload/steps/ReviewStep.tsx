'use client'

import styles from '../third-party-upload.module.css'

type ReviewStepProps = {
  mainFileName: string | null
  contractType: string
  counterparties: Array<{
    counterpartyName: string
    supportingCount: number
  }>
  departmentName: string
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  budgetApproved: boolean
  bypassHodApproval?: boolean
  bypassReason?: string
  organizationEntity: string
}

export default function ReviewStep({
  mainFileName,
  contractType,
  counterparties,
  departmentName,
  signatoryName,
  signatoryDesignation,
  signatoryEmail,
  backgroundOfRequest,
  budgetApproved,
  bypassHodApproval = false,
  bypassReason,
  organizationEntity,
}: ReviewStepProps) {
  return (
    <div>
      <div className={styles.sectionTitle}>Review</div>
      <p className={styles.helperText}>Confirm the details before upload.</p>
      <div className={styles.summaryRow}>
        <span>Main Document</span>
        <span>{mainFileName || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Contract Type</span>
        <span>{contractType || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Counterparties</span>
        <span>{counterparties.length || 0}</span>
      </div>
      {counterparties.map((counterparty, index) => (
        <div className={styles.summaryRow} key={`${counterparty.counterpartyName}-${index}`}>
          <span>{`Counterparty ${index + 1}`}</span>
          <span>{`${counterparty.counterpartyName || 'Not set'} (${counterparty.supportingCount} docs)`}</span>
        </div>
      ))}
      <div className={styles.summaryRow}>
        <span>Department</span>
        <span>{departmentName || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Counterparty Signatory Name</span>
        <span>{signatoryName || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Counterparty Signatory Designation</span>
        <span>{signatoryDesignation || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Counterparty Signatory Email</span>
        <span>{signatoryEmail || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Budget Approved</span>
        <span>{budgetApproved ? 'Yes' : 'No'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Bypass HOD Approval</span>
        <span>{bypassHodApproval ? 'Yes' : 'No'}</span>
      </div>
      {bypassHodApproval ? (
        <div className={styles.summaryRow}>
          <span>Bypass Reason</span>
          <span>{bypassReason || 'Not set'}</span>
        </div>
      ) : null}
      <div className={styles.summaryRow}>
        <span>Background</span>
        <span>{backgroundOfRequest || 'Not set'}</span>
      </div>
      <div className={styles.summaryRow}>
        <span>Organization Entity</span>
        <span>{organizationEntity}</span>
      </div>
    </div>
  )
}
