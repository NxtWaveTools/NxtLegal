import { useMemo, useState } from 'react'
import type { AdminDepartmentOption } from '@/core/client/admin-client'
import Spinner from '@/components/ui/Spinner'
import styles from '../admin-console.module.css'

type ReplacePocOrHodWizardModalProps = {
  isOpen: boolean
  departments: AdminDepartmentOption[]
  selectedTeamId: string
  replaceRoleType: 'POC' | 'HOD'
  currentRoleEmail: string | null
  newRoleEmail: string
  newRoleName: string
  isReplacementDifferentFromOtherRole: boolean
  isRevokeConfirmed: boolean
  isSubmitting: boolean
  onClose: () => void
  onSelectedTeamChange: (value: string) => void
  onReplaceRoleTypeChange: (value: 'POC' | 'HOD') => void
  onNewRoleEmailChange: (value: string) => void
  onNewRoleNameChange: (value: string) => void
  onRevokeAccess: () => void
  onSubmit: () => void
}

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export default function ReplacePocOrHodWizardModal({
  isOpen,
  departments,
  selectedTeamId,
  replaceRoleType,
  currentRoleEmail,
  newRoleEmail,
  newRoleName,
  isReplacementDifferentFromOtherRole,
  isRevokeConfirmed,
  isSubmitting,
  onClose,
  onSelectedTeamChange,
  onReplaceRoleTypeChange,
  onNewRoleEmailChange,
  onNewRoleNameChange,
  onRevokeAccess,
  onSubmit,
}: ReplacePocOrHodWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const normalizedNewRoleEmail = newRoleEmail.trim().toLowerCase()
  const normalizedNewRoleName = newRoleName.trim()
  const isNewRoleEmailValid = useMemo(
    () => emailPattern.test(normalizedNewRoleEmail) && isReplacementDifferentFromOtherRole,
    [isReplacementDifferentFromOtherRole, normalizedNewRoleEmail]
  )
  const isNewRoleNameValid = normalizedNewRoleName.length >= 2

  const canMoveFromStepOne = selectedTeamId.length > 0
  const canMoveFromStepTwo = replaceRoleType === 'POC' || replaceRoleType === 'HOD'
  const canFinish =
    canMoveFromStepOne &&
    canMoveFromStepTwo &&
    isNewRoleEmailValid &&
    isNewRoleNameValid &&
    isRevokeConfirmed &&
    !isSubmitting

  const handleClose = () => {
    setStep(1)
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Replace POC or HOD">
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Replace POC or HOD</div>
        <div className={styles.modalBody}>Step {step} of 3</div>

        <div className={styles.wizardBody}>
          {step === 1 ? (
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
          ) : null}

          {step === 2 ? (
            <label className={styles.field}>
              <span className={styles.label}>Whom to Replace</span>
              <select
                className={styles.select}
                value={replaceRoleType}
                onChange={(event) => onReplaceRoleTypeChange(event.target.value as 'POC' | 'HOD')}
              >
                <option value="POC">POC</option>
                <option value="HOD">HOD</option>
              </select>
            </label>
          ) : null}

          {step === 3 ? (
            <>
              <div className={styles.field}>
                <span className={styles.label}>Current {replaceRoleType} Email</span>
                <div className={styles.wizardInlineRow}>
                  <div className={styles.preview}>{currentRoleEmail ?? 'No active email found for selected role'}</div>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={onRevokeAccess}
                    disabled={isSubmitting || !currentRoleEmail}
                  >
                    {isRevokeConfirmed ? 'Access Revoked' : 'Revoke Access'}
                  </button>
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>New {replaceRoleType} Email</span>
                <input
                  className={styles.input}
                  value={newRoleEmail}
                  onChange={(event) => onNewRoleEmailChange(event.target.value)}
                  placeholder="new.owner@yourdomain.com"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>New {replaceRoleType} Name</span>
                <input
                  className={styles.input}
                  value={newRoleName}
                  onChange={(event) => onNewRoleNameChange(event.target.value)}
                  placeholder="Full name"
                />
              </label>

              {!isReplacementDifferentFromOtherRole && normalizedNewRoleEmail ? (
                <div className={styles.warning}>Replacement email cannot match the other primary role email.</div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </button>

          {step > 1 ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => setStep((step - 1) as 1 | 2)}
              disabled={isSubmitting}
            >
              Back
            </button>
          ) : null}

          {step < 3 ? (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={() => setStep((step + 1) as 2 | 3)}
              disabled={(step === 1 && !canMoveFromStepOne) || (step === 2 && !canMoveFromStepTwo)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={onSubmit}
              disabled={!canFinish}
            >
              <span className={styles.buttonContent}>
                {isSubmitting ? <Spinner size={14} /> : null}
                {isSubmitting ? 'Replacing...' : 'Finish'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
