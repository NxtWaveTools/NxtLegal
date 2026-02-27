'use client'

import styles from '../third-party-upload.module.css'

type UploadStepProps = {
  isSubmitting: boolean
  successMessage: string | null
}

export default function UploadStep({ isSubmitting, successMessage }: UploadStepProps) {
  return (
    <div>
      <div className={styles.sectionTitle}>Upload</div>
      <p className={styles.helperText}>Submit the contract and initialize workflow routing.</p>
      {isSubmitting && <p className={styles.helperText}>Uploading contract...</p>}
      {successMessage && <p className={styles.helperText}>{successMessage}</p>}
    </div>
  )
}
