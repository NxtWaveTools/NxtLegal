import type { AdminRoleOption, AdminUserOption } from '@/core/client/admin-client'
import styles from '../admin-console.module.css'

type RoleManagementSectionProps = {
  users: AdminUserOption[]
  roles: AdminRoleOption[]
  selectedUserId: string
  selectedRoleKey: string
  roleOperation: 'grant' | 'revoke'
  canChangeRole: boolean
  isSubmittingRoleChange: boolean
  onSelectedUserChange: (value: string) => void
  onSelectedRoleKeyChange: (value: string) => void
  onRoleOperationChange: (value: 'grant' | 'revoke') => void
  onSubmitRoleChange: () => void
}

export default function RoleManagementSection({
  users,
  roles,
  selectedUserId,
  selectedRoleKey,
  roleOperation,
  canChangeRole,
  isSubmittingRoleChange,
  onSelectedUserChange,
  onSelectedRoleKeyChange,
  onRoleOperationChange,
  onSubmitRoleChange,
}: RoleManagementSectionProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Role Management</h2>

      <label className={styles.field}>
        <span className={styles.label}>Select User</span>
        <select
          className={styles.select}
          value={selectedUserId}
          onChange={(event) => onSelectedUserChange(event.target.value)}
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Select Role</span>
        <select
          className={styles.select}
          value={selectedRoleKey}
          onChange={(event) => onSelectedRoleKeyChange(event.target.value)}
        >
          {roles.map((role) => (
            <option key={role.roleKey} value={role.roleKey}>
              {role.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Operation</span>
        <select
          className={styles.select}
          value={roleOperation}
          onChange={(event) => onRoleOperationChange(event.target.value as 'grant' | 'revoke')}
        >
          <option value="grant">Grant</option>
          <option value="revoke">Revoke</option>
        </select>
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={!canChangeRole}
          onClick={onSubmitRoleChange}
        >
          {isSubmittingRoleChange ? 'Updating Role...' : 'Apply Role Change'}
        </button>
      </div>
    </div>
  )
}
