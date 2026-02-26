import Spinner from '@/components/ui/Spinner'
import styles from '../admin-console.module.css'

type SystemConfigurationSectionProps = {
  config: {
    featureFlags: {
      enableAdminGovernance: boolean
      enableContractWorkflow: boolean
    }
    securitySessionPolicies: {
      accessTokenDays: number
      refreshTokenDays: number
      maxLoginAttempts: number
    }
    defaults: {
      defaultDepartmentRole: 'POC' | 'HOD'
      defaultUserRole: 'USER' | 'LEGAL_TEAM'
    }
    updatedAt: string | null
    updatedByUserId: string | null
  } | null
  reason: string
  isLoading: boolean
  isSubmitting: boolean
  onReasonChange: (value: string) => void
  onToggleFlag: (key: 'enableAdminGovernance' | 'enableContractWorkflow', value: boolean) => void
  onSecurityPolicyChange: (key: 'accessTokenDays' | 'refreshTokenDays' | 'maxLoginAttempts', value: number) => void
  onDefaultChange: (
    key: 'defaultDepartmentRole' | 'defaultUserRole',
    value: 'POC' | 'HOD' | 'USER' | 'LEGAL_TEAM'
  ) => void
  onSave: () => void
}

export default function SystemConfigurationSection({
  config,
  reason,
  isLoading,
  isSubmitting,
  onReasonChange,
  onToggleFlag,
  onSecurityPolicyChange,
  onDefaultChange,
  onSave,
}: SystemConfigurationSectionProps) {
  if (isLoading || !config) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>System Configuration</h2>
        <div className={styles.preview}>Loading configuration...</div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>System Configuration</h2>

      <label className={styles.field}>
        <span className={styles.label}>Enable Admin Governance</span>
        <select
          className={styles.select}
          value={String(config.featureFlags.enableAdminGovernance)}
          onChange={(event) => onToggleFlag('enableAdminGovernance', event.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Enable Contract Workflow</span>
        <select
          className={styles.select}
          value={String(config.featureFlags.enableContractWorkflow)}
          onChange={(event) => onToggleFlag('enableContractWorkflow', event.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Access Token Days</span>
        <input
          type="number"
          min={1}
          max={30}
          className={styles.input}
          value={config.securitySessionPolicies.accessTokenDays}
          onChange={(event) => onSecurityPolicyChange('accessTokenDays', Number(event.target.value))}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Refresh Token Days</span>
        <input
          type="number"
          min={1}
          max={60}
          className={styles.input}
          value={config.securitySessionPolicies.refreshTokenDays}
          onChange={(event) => onSecurityPolicyChange('refreshTokenDays', Number(event.target.value))}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Max Login Attempts</span>
        <input
          type="number"
          min={1}
          max={20}
          className={styles.input}
          value={config.securitySessionPolicies.maxLoginAttempts}
          onChange={(event) => onSecurityPolicyChange('maxLoginAttempts', Number(event.target.value))}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Default Department Role</span>
        <select
          className={styles.select}
          value={config.defaults.defaultDepartmentRole}
          onChange={(event) => onDefaultChange('defaultDepartmentRole', event.target.value as 'POC' | 'HOD')}
        >
          <option value="POC">POC</option>
          <option value="HOD">HOD</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Default User Role</span>
        <select
          className={styles.select}
          value={config.defaults.defaultUserRole}
          onChange={(event) => onDefaultChange('defaultUserRole', event.target.value as 'USER' | 'LEGAL_TEAM')}
        >
          <option value="USER">USER</option>
          <option value="LEGAL_TEAM">LEGAL_TEAM</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Reason</span>
        <textarea
          className={styles.textarea}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Describe why this change is required"
        />
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onSave}
          disabled={isSubmitting}
        >
          <span className={styles.buttonContent}>
            {isSubmitting ? <Spinner size={14} /> : null}
            {isSubmitting ? 'Saving...' : 'Save Configuration'}
          </span>
        </button>
      </div>

      <div className={styles.preview}>
        Last updated: {config.updatedAt ?? 'Never'}
        <br />
        Last updated by: {config.updatedByUserId ?? 'N/A'}
      </div>
    </div>
  )
}
