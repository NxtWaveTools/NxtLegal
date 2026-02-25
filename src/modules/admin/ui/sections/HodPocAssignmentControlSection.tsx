import type { AdminDepartmentOption, AdminUserOption } from '@/core/client/admin-client'
import styles from '../admin-console.module.css'

type HodPocAssignmentControlSectionProps = {
  departments: AdminDepartmentOption[]
  users: AdminUserOption[]
  selectedTeamId: string
  selectedUserId: string
  assignmentDepartmentId: string
  assignmentDepartmentRole: 'POC' | 'HOD'
  replaceRoleType: 'POC' | 'HOD'
  newRoleEmail: string
  normalizedNewRoleEmail: string
  canReplace: boolean
  canAssignDepartmentRole: boolean
  isSubmittingReplace: boolean
  isSubmittingAssignment: boolean
  isReplacementDifferentFromOtherRole: boolean
  onSelectedTeamChange: (value: string) => void
  onReplaceRoleTypeChange: (value: 'POC' | 'HOD') => void
  onNewRoleEmailChange: (value: string) => void
  onAssignDepartmentChange: (value: string) => void
  onAssignDepartmentRoleChange: (value: 'POC' | 'HOD') => void
  onSelectedUserChange: (value: string) => void
  onReplacePrimaryRole: () => void
  onAssignDepartmentRole: () => void
}

export default function HodPocAssignmentControlSection({
  departments,
  users,
  selectedTeamId,
  selectedUserId,
  assignmentDepartmentId,
  assignmentDepartmentRole,
  replaceRoleType,
  newRoleEmail,
  normalizedNewRoleEmail,
  canReplace,
  canAssignDepartmentRole,
  isSubmittingReplace,
  isSubmittingAssignment,
  isReplacementDifferentFromOtherRole,
  onSelectedTeamChange,
  onReplaceRoleTypeChange,
  onNewRoleEmailChange,
  onAssignDepartmentChange,
  onAssignDepartmentRoleChange,
  onSelectedUserChange,
  onReplacePrimaryRole,
  onAssignDepartmentRole,
}: HodPocAssignmentControlSectionProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>HOD & POC Assignment Control</h2>

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
        <span className={styles.label}>Role To Replace</span>
        <select
          className={styles.select}
          value={replaceRoleType}
          onChange={(event) => onReplaceRoleTypeChange(event.target.value as 'POC' | 'HOD')}
        >
          <option value="POC">POC</option>
          <option value="HOD">HOD</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>New Microsoft Email</span>
        <input
          className={styles.input}
          value={newRoleEmail}
          onChange={(event) => onNewRoleEmailChange(event.target.value)}
          placeholder="new.owner@yourdomain.com"
        />
      </label>

      {!isReplacementDifferentFromOtherRole && normalizedNewRoleEmail ? (
        <div className={styles.warning}>Replacement email cannot match the other primary role email.</div>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onReplacePrimaryRole} disabled={!canReplace}>
          {isSubmittingReplace ? 'Replacing...' : 'Replace Primary Role'}
        </button>
      </div>

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
        <span className={styles.label}>Assign Department</span>
        <select
          className={styles.select}
          value={assignmentDepartmentId}
          onChange={(event) => onAssignDepartmentChange(event.target.value)}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Assign Department Role</span>
        <select
          className={styles.select}
          value={assignmentDepartmentRole}
          onChange={(event) => onAssignDepartmentRoleChange(event.target.value as 'POC' | 'HOD')}
        >
          <option value="POC">POC</option>
          <option value="HOD">HOD</option>
        </select>
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={onAssignDepartmentRole}
          disabled={!canAssignDepartmentRole}
        >
          {isSubmittingAssignment ? 'Assigning...' : 'Assign Department Role'}
        </button>
      </div>
    </div>
  )
}
