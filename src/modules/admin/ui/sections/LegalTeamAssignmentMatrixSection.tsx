import type { AdminDepartmentOption, AdminDepartmentUserGroup, AdminUserOption } from '@/core/client/admin-client'
import styles from '../admin-console.module.css'

type LegalTeamAssignmentMatrixSectionProps = {
  selectedTeamId: string
  selectedUserId: string
  departments: AdminDepartmentOption[]
  users: AdminUserOption[]
  usersByDepartment: AdminDepartmentUserGroup[]
  canAssignLegalMatrix: boolean
  isSubmittingLegalMatrix: boolean
  onSelectedTeamChange: (value: string) => void
  onSelectedUserChange: (value: string) => void
  onAssignLegalMatrix: () => void
}

export default function LegalTeamAssignmentMatrixSection({
  selectedTeamId,
  selectedUserId,
  departments,
  users,
  usersByDepartment,
  canAssignLegalMatrix,
  isSubmittingLegalMatrix,
  onSelectedTeamChange,
  onSelectedUserChange,
  onAssignLegalMatrix,
}: LegalTeamAssignmentMatrixSectionProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Legal Team Assignment Matrix</h2>

      <label className={styles.field}>
        <span className={styles.label}>Select Team</span>
        <select
          className={styles.select}
          value={selectedTeamId}
          onChange={(event) => onSelectedTeamChange(event.target.value)}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Select Legal User</span>
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
        <button type="button" className={styles.button} onClick={onAssignLegalMatrix} disabled={!canAssignLegalMatrix}>
          {isSubmittingLegalMatrix ? 'Updating Legal Matrix...' : 'Add Selected User To Legal Matrix'}
        </button>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Users Grouped by Department</span>
        <div className={styles.preview}>
          {usersByDepartment.length === 0 ? (
            <div>No user department assignments found.</div>
          ) : (
            usersByDepartment.map((group) => (
              <div key={group.departmentId}>
                <strong>{group.departmentName}</strong>
                <div>
                  {group.users.length === 0
                    ? 'No users assigned'
                    : group.users
                        .map(
                          (user) => `${user.email} (${user.departmentRole}) ${user.isActive ? 'Active' : 'Inactive'}`
                        )
                        .join(', ')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
