'use client'

import { formatFileSize } from '@/lib/format-file-size'
import styles from '../third-party-upload.module.css'

type AdditionalDataStepProps = {
  mainFileName: string | null
  contractType: string
  contractTypes: Array<{ id: string; name: string }>
  counterparty: string
  counterparties: string[]
  showCounterpartyModal: boolean
  onContractTypeChange: (value: string) => void
  onCounterpartyChange: (value: string) => void
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  departmentId: string
  departments: Array<{ id: string; name: string }>
  budgetApproved: boolean
  onSignatoryNameChange: (value: string) => void
  onSignatoryDesignationChange: (value: string) => void
  onSignatoryEmailChange: (value: string) => void
  onBackgroundOfRequestChange: (value: string) => void
  onDepartmentIdChange: (value: string) => void
  onBudgetApprovedChange: (value: boolean) => void
  supportingFiles: File[]
  onSupportingFilesSelected: (files: File[]) => void
  onSupportingFileRemoved: (index: number) => void
  showSupportingUpload: boolean
}

export default function AdditionalDataStep({
  mainFileName,
  contractType,
  contractTypes,
  counterparty,
  counterparties,
  showCounterpartyModal,
  onContractTypeChange,
  onCounterpartyChange,
  signatoryName,
  signatoryDesignation,
  signatoryEmail,
  backgroundOfRequest,
  departmentId,
  departments,
  budgetApproved,
  onSignatoryNameChange,
  onSignatoryDesignationChange,
  onSignatoryEmailChange,
  onBackgroundOfRequestChange,
  onDepartmentIdChange,
  onBudgetApprovedChange,
  supportingFiles,
  onSupportingFilesSelected,
  onSupportingFileRemoved,
  showSupportingUpload,
}: AdditionalDataStepProps) {
  return (
    <div>
      <div className={styles.sectionTitle}>Additional Data</div>
      <div className={styles.columns}>
        <div className={styles.leftPanel}>
          <div className={styles.helperText}>Uploaded files</div>
          <div className={styles.fileCard}>
            <div className={styles.fileMeta}>
              <span className={styles.fileName}>{mainFileName || 'No document uploaded'}</span>
            </div>
          </div>
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="contract-type">
              Contract Type*
            </label>
            <select
              id="contract-type"
              className={styles.select}
              value={contractType}
              onChange={(event) => onContractTypeChange(event.target.value)}
            >
              <option value="">Select contract type</option>
              {contractTypes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="department-id">
              Department*
            </label>
            <select
              id="department-id"
              className={styles.select}
              value={departmentId}
              onChange={(event) => onDepartmentIdChange(event.target.value)}
            >
              <option value="">Select department</option>
              {departments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="signatory-name">
              Signatory Name*
            </label>
            <input
              id="signatory-name"
              className={styles.input}
              value={signatoryName}
              onChange={(event) => onSignatoryNameChange(event.target.value)}
              placeholder="Enter signatory name"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="signatory-designation">
              Signatory Designation*
            </label>
            <input
              id="signatory-designation"
              className={styles.input}
              value={signatoryDesignation}
              onChange={(event) => onSignatoryDesignationChange(event.target.value)}
              placeholder="Enter designation"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="signatory-email">
              Signatory Email*
            </label>
            <input
              id="signatory-email"
              className={styles.input}
              type="email"
              value={signatoryEmail}
              onChange={(event) => onSignatoryEmailChange(event.target.value)}
              placeholder="name@company.com"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="background-of-request">
              Background of Request*
            </label>
            <textarea
              id="background-of-request"
              className={styles.input}
              value={backgroundOfRequest}
              onChange={(event) => onBackgroundOfRequestChange(event.target.value)}
              placeholder="Describe the request context"
              rows={4}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="budget-approved">
              Budget Approved*
            </label>
            <select
              id="budget-approved"
              className={styles.select}
              value={budgetApproved ? 'true' : 'false'}
              onChange={(event) => onBudgetApprovedChange(event.target.value === 'true')}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="counterparty-name">
              Counterparty Name*
            </label>
            <input
              id="counterparty-name"
              className={styles.input}
              list="counterparty-options"
              placeholder="Select or type counterparty"
              value={counterparty}
              onChange={(event) => onCounterpartyChange(event.target.value)}
            />
            <datalist id="counterparty-options">
              {counterparties.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          {showCounterpartyModal && <div className={styles.inlineModal} />}

          {showSupportingUpload && (
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="supporting-docs">
                Supporting Document*
              </label>
              <div className={styles.dropzone}>
                <span>Add supporting documents</span>
                <label className={styles.dropzoneButton} htmlFor="supporting-docs">
                  Add files
                </label>
                <input
                  id="supporting-docs"
                  className={styles.hiddenInput}
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || [])
                    if (files.length) {
                      onSupportingFilesSelected(files)
                    }
                  }}
                />
              </div>
              <div className={styles.supportingList}>
                {supportingFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className={styles.fileCard}>
                    <div className={styles.fileMeta}>
                      <span className={styles.fileName}>{file.name}</span>
                      <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => onSupportingFileRemoved(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="org-entity">
              Organization Entity*
            </label>
            <input id="org-entity" className={styles.input} value="NxtWave Disruptive Technologies Pvt Ltd" readOnly />
          </div>
        </div>
      </div>
    </div>
  )
}
