import type { AdminUserOption } from '@/core/client/admin-client'
import Spinner from '@/components/ui/Spinner'
import styles from '../admin-console.module.css'

type UserManagementSectionProps = {
  newUserEmail: string
  newUserFullName: string
  users: AdminUserOption[]
  selectedUserId: string
  selectedUser: AdminUserOption | null
  canCreateUser: boolean
  isSubmittingUserCreate: boolean
  isSubmittingStatus: boolean
  onNewUserEmailChange: (value: string) => void
  onNewUserFullNameChange: (value: string) => void
  onSelectedUserChange: (value: string) => void
  onCreateUser: () => void
  onActivateUser: () => void
  onDeactivateUser: () => void
}

export default function UserManagementSection({
  newUserEmail,
  newUserFullName,
  users,
  selectedUserId,
  selectedUser,
  canCreateUser,
  isSubmittingUserCreate,
  isSubmittingStatus,
  onNewUserEmailChange,
  onNewUserFullNameChange,
  onSelectedUserChange,
  onCreateUser,
  onActivateUser,
  onDeactivateUser,
}: UserManagementSectionProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>User Management</h2>

      <label className={styles.field}>
        <span className={styles.label}>New User Email</span>
        <input
          className={styles.input}
          value={newUserEmail}
          onChange={(event) => onNewUserEmailChange(event.target.value)}
          placeholder="user@yourdomain.com"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Full Name</span>
        <input
          className={styles.input}
          value={newUserFullName}
          onChange={(event) => onNewUserFullNameChange(event.target.value)}
          placeholder="Legal Team Member"
        />
      </label>

      <div className={styles.preview}>Creates a user in the current tenant context.</div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onCreateUser}
          disabled={!canCreateUser}
        >
          <span className={styles.buttonContent}>
            {isSubmittingUserCreate ? <Spinner size={14} /> : null}
            {isSubmittingUserCreate ? 'Creating User...' : 'Create User'}
          </span>
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Select Existing User</span>
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

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={!selectedUser || isSubmittingStatus || selectedUser.isActive}
          onClick={onActivateUser}
        >
          <span className={styles.buttonContent}>
            {isSubmittingStatus && selectedUser && !selectedUser.isActive ? <Spinner size={14} /> : null}
            Activate User
          </span>
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!selectedUser || isSubmittingStatus || !selectedUser.isActive}
          onClick={onDeactivateUser}
        >
          <span className={styles.buttonContent}>
            {isSubmittingStatus && selectedUser && selectedUser.isActive ? <Spinner size={14} /> : null}
            Deactivate User
          </span>
        </button>
      </div>
    </div>
  )
}
