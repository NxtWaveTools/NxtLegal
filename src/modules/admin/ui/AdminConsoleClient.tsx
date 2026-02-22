'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminClient, type AdminUserOption, type AdminRoleOption } from '@/core/client/admin-client'
import ProtectedAppShell from '@/modules/dashboard/ui/ProtectedAppShell'
import styles from './admin-console.module.css'

type AdminConsoleClientProps = {
  session: {
    fullName?: string | null
    role?: string
  }
}

const sectionTitles = [
  'Team Management',
  'User Management',
  'Role Management',
  'HOD & POC Assignment Control',
  'Legal Team Assignment Matrix',
  'System Configuration',
  'Audit Logs Viewer',
] as const

export default function AdminConsoleClient({ session }: AdminConsoleClientProps) {
  const [users, setUsers] = useState<AdminUserOption[]>([])
  const [roles, setRoles] = useState<AdminRoleOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleKey, setSelectedRoleKey] = useState('')
  const [operation, setOperation] = useState<'grant' | 'revoke'>('grant')
  const [reason, setReason] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const [usersResponse, rolesResponse] = await Promise.all([adminClient.users(), adminClient.roles()])

      if (!usersResponse.ok || !usersResponse.data) {
        setToastMessage(usersResponse.error?.message ?? 'Failed to load users')
      } else {
        const nextUsers = usersResponse.data.users
        setUsers(nextUsers)
        setSelectedUserId((current) => current || nextUsers[0]?.id || '')
      }

      if (!rolesResponse.ok || !rolesResponse.data) {
        setToastMessage(rolesResponse.error?.message ?? 'Failed to load roles')
      } else {
        const nextRoles = rolesResponse.data.roles
        setRoles(nextRoles)
        setSelectedRoleKey((current) => current || nextRoles[0]?.roleKey || '')
      }

      setIsLoading(false)
    }

    void loadData()
  }, [])

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId])

  const roleImpactPreview = useMemo(() => {
    if (!selectedUser) {
      return 'Select a user to preview role impact.'
    }

    const hasRole = selectedUser.roles.includes(selectedRoleKey)
    const impactLine =
      operation === 'grant'
        ? hasRole
          ? 'No role change will occur because this user already has the selected role.'
          : `This action will add ${selectedRoleKey} to active roles.`
        : hasRole
          ? `This action will remove ${selectedRoleKey} from active roles and revoke active sessions.`
          : `No role change will occur because this user does not currently have ${selectedRoleKey}.`

    return impactLine
  }, [operation, selectedRoleKey, selectedUser])

  const hodWarning = operation === 'revoke' && selectedRoleKey === 'HOD'

  const handleConfirm = async () => {
    if (!selectedUser) {
      return
    }

    setIsSubmitting(true)
    const response = await adminClient.changeUserRole(selectedUser.id, {
      operation,
      roleKey: selectedRoleKey,
      reason: reason.trim() || undefined,
    })
    setIsSubmitting(false)
    setShowConfirmModal(false)

    if (!response.ok || !response.data) {
      setToastMessage(response.error?.message ?? 'Role update failed')
      return
    }

    const afterRolesRaw = response.data.roleChange.afterStateSnapshot.role_keys
    const afterRoles = Array.isArray(afterRolesRaw)
      ? afterRolesRaw.filter((item): item is string => typeof item === 'string')
      : selectedUser.roles

    setUsers((current) => current.map((user) => (user.id === selectedUser.id ? { ...user, roles: afterRoles } : user)))

    const resultLabel = response.data.roleChange.changed ? 'updated successfully' : 'had no changes'
    const messageParts = [`Role ${resultLabel}.`]

    if (response.data.reauthentication.required && response.data.reauthentication.message) {
      messageParts.push(response.data.reauthentication.message)
    }

    setToastMessage(messageParts.join(' '))
  }

  return (
    <ProtectedAppShell session={{ fullName: session.fullName }} activeNav="admin">
      <main className={styles.main}>
        <section className={styles.header}>
          <h1 className={styles.title}>Admin Console</h1>
          <p className={styles.subtitle}>
            Enterprise governance controls for roles, assignments, and integrity-safe access.
          </p>
        </section>

        <section className={styles.sections}>
          {sectionTitles.map((title) => (
            <div key={title} className={styles.sectionItem}>
              {title}
            </div>
          ))}
        </section>

        {toastMessage ? <div className={styles.toast}>{toastMessage}</div> : null}

        <section className={styles.workspace}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Role Management</h2>

            <label className={styles.field}>
              <span className={styles.label}>User</span>
              <select
                className={styles.select}
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Operation</span>
              <select
                className={styles.select}
                value={operation}
                onChange={(event) => setOperation(event.target.value as 'grant' | 'revoke')}
              >
                <option value="grant">Grant role</option>
                <option value="revoke">Revoke role</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Role</span>
              <select
                className={styles.select}
                value={selectedRoleKey}
                onChange={(event) => setSelectedRoleKey(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.roleKey} value={role.roleKey}>
                    {role.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Reason</span>
              <textarea
                className={styles.textarea}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Add optional governance reason"
              />
            </label>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => setShowConfirmModal(true)}
                disabled={isLoading || !selectedUser || !selectedRoleKey || isSubmitting}
              >
                Review & Confirm
              </button>
            </div>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Role Impact Preview</h2>

            <div className={styles.field}>
              <span className={styles.label}>Selected user</span>
              <input className={styles.input} value={selectedUser?.email ?? 'No user selected'} readOnly />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Current roles</span>
              <div className={styles.rolePills}>
                {(selectedUser?.roles ?? []).length === 0 ? (
                  <span className={styles.rolePill}>No active roles</span>
                ) : (
                  selectedUser?.roles.map((role) => (
                    <span key={role} className={styles.rolePill}>
                      {role}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className={styles.preview}>{roleImpactPreview}</div>

            {hodWarning ? (
              <div className={styles.warning}>Warning: Removing active HOD may interrupt pending approvals.</div>
            ) : null}
          </div>
        </section>
      </main>

      {showConfirmModal ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Confirm role change">
          <div className={styles.modal}>
            <div className={styles.modalTitle}>Confirm role replacement</div>
            <div className={styles.modalBody}>
              You are about to {operation} role <strong>{selectedRoleKey}</strong> for{' '}
              <strong>{selectedUser?.email ?? 'selected user'}</strong>. This action is audit logged and may force
              session re-authentication.
            </div>
            {hodWarning ? (
              <div className={styles.warning}>
                Warning: HOD removal should be coordinated with replacement planning.
              </div>
            ) : null}
            <div className={styles.modalActions}>
              <button type="button" className={styles.button} onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ProtectedAppShell>
  )
}
