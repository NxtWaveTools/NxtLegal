import { useMemo, useState, type FormEvent } from 'react'
import Spinner from '@/components/ui/Spinner'
import styles from '../admin-console.module.css'

type LegalAssignment = {
  userId: string
  email: string
  fullName: string | null
}

type ManageLegalTeamModalProps = {
  isOpen: boolean
  legalDepartmentName: string
  legalAssignments: LegalAssignment[]
  isLegalDepartmentConfigured: boolean
  newUserFullName: string
  newUserEmail: string
  isSubmitting: boolean
  revokingUserId: string | null
  onClose: () => void
  onNewUserFullNameChange: (value: string) => void
  onNewUserEmailChange: (value: string) => void
  onAddUser: () => void
  onRevokeUser: (userId: string) => void
}

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export default function ManageLegalTeamModal({
  isOpen,
  legalDepartmentName,
  legalAssignments,
  isLegalDepartmentConfigured,
  newUserFullName,
  newUserEmail,
  isSubmitting,
  revokingUserId,
  onClose,
  onNewUserFullNameChange,
  onNewUserEmailChange,
  onAddUser,
  onRevokeUser,
}: ManageLegalTeamModalProps) {
  const [view, setView] = useState<'list' | 'add'>('list')

  const canSubmitAdd = useMemo(() => {
    return newUserFullName.trim().length >= 2 && emailPattern.test(newUserEmail.trim().toLowerCase()) && !isSubmitting
  }, [isSubmitting, newUserEmail, newUserFullName])
  const isBusy = isSubmitting || Boolean(revokingUserId)

  const handleAddUserSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAddUser()
  }

  const handleClose = () => {
    setView('list')
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Manage Legal Team">
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Manage Legal Team</div>
        <div className={styles.modalBody}>{view === 'list' ? 'Current Legal and Compliance members' : 'Add user'}</div>

        {!isLegalDepartmentConfigured ? (
          <div className={styles.warning}>{legalDepartmentName} department is not configured.</div>
        ) : null}

        {view === 'list' ? (
          <>
            <div className={styles.preview}>
              {legalAssignments.length === 0
                ? 'No legal users assigned yet.'
                : legalAssignments.map((assignment) => (
                    <div key={assignment.userId} className={styles.wizardInlineRow}>
                      <div>
                        <div>{assignment.fullName ?? 'Unnamed user'}</div>
                        <div>{assignment.email}</div>
                      </div>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => onRevokeUser(assignment.userId)}
                        disabled={isBusy || !isLegalDepartmentConfigured}
                      >
                        <span className={styles.buttonContent}>
                          {revokingUserId === assignment.userId ? <Spinner size={14} /> : null}
                          Revoke
                        </span>
                      </button>
                    </div>
                  ))}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => setView('add')}
                disabled={isBusy || !isLegalDepartmentConfigured}
              >
                Add User
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleAddUserSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Full Name</span>
              <input
                className={styles.input}
                value={newUserFullName}
                onChange={(event) => onNewUserFullNameChange(event.target.value)}
                placeholder="Legal Team Member"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <input
                className={styles.input}
                value={newUserEmail}
                onChange={(event) => onNewUserEmailChange(event.target.value)}
                placeholder="legal.user@yourdomain.com"
              />
            </label>

            <div className={styles.modalActions}>
              <button type="button" className={styles.button} onClick={() => setView('list')} disabled={isBusy}>
                Back
              </button>
              <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`} disabled={!canSubmitAdd}>
                <span className={styles.buttonContent}>{isSubmitting ? <Spinner size={14} /> : null}Add User</span>
              </button>
            </div>
          </form>
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={handleClose} disabled={isBusy}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
