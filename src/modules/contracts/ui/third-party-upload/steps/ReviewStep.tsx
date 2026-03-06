'use client'

import styles from '../third-party-upload.module.css'

type ReviewStepProps = {
  isSendForSigningFlow?: boolean
  mainFileName: string | null
  contractType: string
  counterparties: Array<{
    counterpartyName: string
    supportingCount: number
    supportingFileNames: string[]
    backgroundOfRequest: string
    budgetApproved: boolean
    signatories: Array<{
      name: string
      designation: string
      email: string
    }>
  }>
  departmentName: string
  signatoryName: string
  bypassHodApproval?: boolean
  bypassReason?: string
  organizationEntity: string
}

export default function ReviewStep({
  isSendForSigningFlow = false,
  mainFileName,
  contractType,
  counterparties,
  departmentName,
  signatoryName,
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
        <span>{isSendForSigningFlow ? 'Counterparty Name' : 'Counterparty Count'}</span>
        <span>
          {isSendForSigningFlow ? counterparties[0]?.counterpartyName || 'Not set' : counterparties.length || 0}
        </span>
      </div>
      {!isSendForSigningFlow
        ? counterparties.map((counterparty, index) => (
            <div key={`${counterparty.counterpartyName}-${index}`}>
              <div className={styles.summaryRow}>
                <span>{`Counterparty ${index + 1}`}</span>
                <span>{`${counterparty.counterpartyName || 'Not set'} (${counterparty.supportingCount} docs)`}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{`Counterparty ${index + 1} Supporting Docs`}</span>
                <span>
                  {counterparty.supportingFileNames.length > 0
                    ? counterparty.supportingFileNames.join(', ')
                    : 'Not provided'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>{`Counterparty ${index + 1} Background`}</span>
                <span>{counterparty.backgroundOfRequest || 'Not set'}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{`Counterparty ${index + 1} Budget Approved`}</span>
                <span>{counterparty.budgetApproved ? 'Yes' : 'No'}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{`Counterparty ${index + 1} Signatories`}</span>
                <span>{counterparty.signatories.length || 0}</span>
              </div>
              {counterparty.signatories.map((signatory, signatoryIndex) => (
                <div key={`${counterparty.counterpartyName}-${index}-signatory-${signatoryIndex}`}>
                  <div className={styles.summaryRow}>
                    <span>{`Counterparty ${index + 1} Signatory ${signatoryIndex + 1} Name`}</span>
                    <span>{signatory.name || 'Not set'}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>{`Counterparty ${index + 1} Signatory ${signatoryIndex + 1} Designation`}</span>
                    <span>{signatory.designation || 'Not set'}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>{`Counterparty ${index + 1} Signatory ${signatoryIndex + 1} Email`}</span>
                    <span>{signatory.email || 'Not set'}</span>
                  </div>
                </div>
              ))}
            </div>
          ))
        : null}
      <div className={styles.summaryRow}>
        <span>Department</span>
        <span>{departmentName || 'Not set'}</span>
      </div>
      {isSendForSigningFlow ? (
        <div className={styles.summaryRow}>
          <span>Counterparty Name</span>
          <span>{signatoryName || 'Not set'}</span>
        </div>
      ) : (
        <>
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
        </>
      )}
      <div className={styles.summaryRow}>
        <span>Organization Entity</span>
        <span>{organizationEntity}</span>
      </div>
    </div>
  )
}
