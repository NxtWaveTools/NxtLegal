import styles from '../admin-console.module.css'

type AdminPrimaryActionsSectionProps = {
  onCreateTeamClick: () => void
  onReplaceRoleClick: () => void
  onManageLegalTeamClick: () => void
  onSystemConfigClick: () => void
  onAuditLogsClick: () => void
}

export default function AdminPrimaryActionsSection({
  onCreateTeamClick,
  onReplaceRoleClick,
  onManageLegalTeamClick,
  onSystemConfigClick,
  onAuditLogsClick,
}: AdminPrimaryActionsSectionProps) {
  return (
    <div className={styles.primaryActionsGrid}>
      <button type="button" className={styles.primaryActionCard} onClick={onCreateTeamClick}>
        <span className={styles.primaryActionTitle}>Create a New Team</span>
        <span className={styles.primaryActionSubtitle}>Start guided team setup with POC and HOD email assignments</span>
      </button>

      <button type="button" className={styles.primaryActionCard} onClick={onReplaceRoleClick}>
        <span className={styles.primaryActionTitle}>Replace POC or HOD</span>
        <span className={styles.primaryActionSubtitle}>Safely transition primary role ownership by email</span>
      </button>

      <button type="button" className={styles.primaryActionCard} onClick={onManageLegalTeamClick}>
        <span className={styles.primaryActionTitle}>Manage Legal Team</span>
        <span className={styles.primaryActionSubtitle}>Add or revoke users for Legal and Compliance access</span>
      </button>

      <button type="button" className={styles.primaryActionCard} onClick={onSystemConfigClick}>
        <span className={styles.primaryActionTitle}>System Configuration</span>
        <span className={styles.primaryActionSubtitle}>
          Review and update governance defaults and security policies
        </span>
      </button>

      <button type="button" className={styles.primaryActionCard} onClick={onAuditLogsClick}>
        <span className={styles.primaryActionTitle}>View Audit Logs</span>
        <span className={styles.primaryActionSubtitle}>Inspect administrative actions and export activity records</span>
      </button>
    </div>
  )
}
