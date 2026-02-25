import styles from '../admin-console.module.css'

type TeamManagementSectionProps = {
  teamName: string
  pocEmail: string
  hodEmail: string
  reason: string
  canCreate: boolean
  isSubmittingCreate: boolean
  arePrimaryEmailsDifferent: boolean
  normalizedPocEmail: string
  normalizedHodEmail: string
  onTeamNameChange: (value: string) => void
  onPocEmailChange: (value: string) => void
  onHodEmailChange: (value: string) => void
  onReasonChange: (value: string) => void
  onCreateTeam: () => void
}

export default function TeamManagementSection({
  teamName,
  pocEmail,
  hodEmail,
  reason,
  canCreate,
  isSubmittingCreate,
  arePrimaryEmailsDifferent,
  normalizedPocEmail,
  normalizedHodEmail,
  onTeamNameChange,
  onPocEmailChange,
  onHodEmailChange,
  onReasonChange,
  onCreateTeam,
}: TeamManagementSectionProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Team Management</h2>

      <label className={styles.field}>
        <span className={styles.label}>Team Name</span>
        <input
          className={styles.input}
          value={teamName}
          onChange={(event) => onTeamNameChange(event.target.value)}
          placeholder="Enter department/team name"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>POC Microsoft Email</span>
        <input
          className={styles.input}
          value={pocEmail}
          onChange={(event) => onPocEmailChange(event.target.value)}
          placeholder="poc@yourdomain.com"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>HOD Microsoft Email</span>
        <input
          className={styles.input}
          value={hodEmail}
          onChange={(event) => onHodEmailChange(event.target.value)}
          placeholder="hod@yourdomain.com"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Reason</span>
        <textarea
          className={styles.textarea}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Add optional governance reason"
        />
      </label>

      {!arePrimaryEmailsDifferent && normalizedPocEmail && normalizedHodEmail ? (
        <div className={styles.warning}>POC and HOD must use different email addresses.</div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onCreateTeam}
          disabled={!canCreate}
        >
          {isSubmittingCreate ? 'Creating...' : 'Create Team'}
        </button>
      </div>

      <div className={styles.preview}>Access will be granted when this email logs in via Microsoft SSO.</div>
    </div>
  )
}
