import { useMemo, useState, type FormEvent } from 'react'
import Spinner from '@/components/ui/Spinner'
import styles from '../admin-console.module.css'

type CreateNewTeamWizardModalProps = {
  isOpen: boolean
  teamName: string
  pocEmail: string
  pocName: string
  hodEmail: string
  hodName: string
  isSubmitting: boolean
  arePrimaryEmailsDifferent: boolean
  onClose: () => void
  onTeamNameChange: (value: string) => void
  onPocEmailChange: (value: string) => void
  onPocNameChange: (value: string) => void
  onHodEmailChange: (value: string) => void
  onHodNameChange: (value: string) => void
  onSubmit: () => void
}

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export default function CreateNewTeamWizardModal({
  isOpen,
  teamName,
  pocEmail,
  pocName,
  hodEmail,
  hodName,
  isSubmitting,
  arePrimaryEmailsDifferent,
  onClose,
  onTeamNameChange,
  onPocEmailChange,
  onPocNameChange,
  onHodEmailChange,
  onHodNameChange,
  onSubmit,
}: CreateNewTeamWizardModalProps) {
  const [step, setStep] = useState<1 | 2>(1)

  const normalizedPocEmail = pocEmail.trim().toLowerCase()
  const normalizedHodEmail = hodEmail.trim().toLowerCase()

  const isStepOneValid = teamName.trim().length >= 2

  const isStepTwoValid = useMemo(() => {
    return (
      emailPattern.test(normalizedPocEmail) &&
      emailPattern.test(normalizedHodEmail) &&
      pocName.trim().length >= 2 &&
      hodName.trim().length >= 2 &&
      arePrimaryEmailsDifferent
    )
  }, [arePrimaryEmailsDifferent, hodName, normalizedHodEmail, normalizedPocEmail, pocName])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isStepTwoValid || isSubmitting) {
      return
    }
    onSubmit()
  }

  const handleClose = () => {
    setStep(1)
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Create a New Team">
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Create a New Team</div>
        <div className={styles.modalBody}>Step {step} of 2</div>

        {step === 1 ? (
          <div className={styles.wizardBody}>
            <label className={styles.field}>
              <span className={styles.label}>Team Name</span>
              <input
                className={styles.input}
                value={teamName}
                onChange={(event) => onTeamNameChange(event.target.value)}
                placeholder="Enter department/team name"
              />
            </label>
          </div>
        ) : (
          <form className={styles.wizardBody} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>POC Email</span>
              <input
                className={styles.input}
                value={pocEmail}
                onChange={(event) => onPocEmailChange(event.target.value)}
                placeholder="poc@yourdomain.com"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>POC Name</span>
              <input
                className={styles.input}
                value={pocName}
                onChange={(event) => onPocNameChange(event.target.value)}
                placeholder="Point of contact name"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>HOD Email</span>
              <input
                className={styles.input}
                value={hodEmail}
                onChange={(event) => onHodEmailChange(event.target.value)}
                placeholder="hod@yourdomain.com"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>HOD Name</span>
              <input
                className={styles.input}
                value={hodName}
                onChange={(event) => onHodNameChange(event.target.value)}
                placeholder="Head of department name"
              />
            </label>

            {!arePrimaryEmailsDifferent && normalizedPocEmail && normalizedHodEmail ? (
              <div className={styles.warning}>POC and HOD must use different email addresses.</div>
            ) : null}
          </form>
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </button>

          {step === 2 ? (
            <button type="button" className={styles.button} onClick={() => setStep(1)} disabled={isSubmitting}>
              Back
            </button>
          ) : null}

          {step === 1 ? (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={() => setStep(2)}
              disabled={!isStepOneValid}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={onSubmit}
              disabled={!isStepTwoValid || isSubmitting}
            >
              <span className={styles.buttonContent}>
                {isSubmitting ? <Spinner size={14} /> : null}
                {isSubmitting ? 'Creating...' : 'Finish'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
