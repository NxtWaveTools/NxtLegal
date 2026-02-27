'use client'

import type { KeyboardEvent } from 'react'
import { contractCounterpartyValues } from '@/core/constants/contracts'
import { formatFileSize } from '@/lib/format-file-size'
import styles from '../third-party-upload.module.css'

type AdditionalDataStepProps = {
  isSendForSigningFlow?: boolean
  mainFileName: string | null
  contractType: string
  contractTypes: Array<{ id: string; name: string }>
  counterparties: Array<{
    counterpartyName: string
    supportingFiles: File[]
  }>
  counterpartyOptions: string[]
  showCounterpartyModal: boolean
  onContractTypeChange: (value: string) => void
  onCounterpartyNameChange: (index: number, value: string) => void
  onAddCounterparty: () => void
  onRemoveCounterparty: (index: number) => void
  signatoryName: string
  signatoryDesignation: string
  signatoryEmail: string
  backgroundOfRequest: string
  departmentId: string
  departments: Array<{ id: string; name: string }>
  isDepartmentLocked?: boolean
  lockedDepartmentName?: string
  budgetApproved: boolean
  bypassHodApproval?: boolean
  bypassReason?: string
  onSignatoryNameChange: (value: string) => void
  onSignatoryDesignationChange: (value: string) => void
  onSignatoryEmailChange: (value: string) => void
  onBackgroundOfRequestChange: (value: string) => void
  onDepartmentIdChange: (value: string) => void
  onBudgetApprovedChange: (value: boolean) => void
  onBypassHodApprovalChange?: (value: boolean) => void
  onBypassReasonChange?: (value: string) => void
  onSupportingFilesSelected: (counterpartyIndex: number, files: File[]) => void
  onSupportingFileRemoved: (counterpartyIndex: number, fileIndex: number) => void
}

export default function AdditionalDataStep({
  isSendForSigningFlow = false,
  mainFileName,
  contractType,
  contractTypes,
  counterparties,
  counterpartyOptions,
  showCounterpartyModal,
  onContractTypeChange,
  onCounterpartyNameChange,
  onAddCounterparty,
  onRemoveCounterparty,
  signatoryName,
  signatoryDesignation,
  signatoryEmail,
  backgroundOfRequest,
  departmentId,
  departments,
  isDepartmentLocked = false,
  lockedDepartmentName,
  budgetApproved,
  bypassHodApproval = false,
  bypassReason = '',
  onSignatoryNameChange,
  onSignatoryDesignationChange,
  onSignatoryEmailChange,
  onBackgroundOfRequestChange,
  onDepartmentIdChange,
  onBudgetApprovedChange,
  onBypassHodApprovalChange,
  onBypassReasonChange,
  onSupportingFilesSelected,
  onSupportingFileRemoved,
}: AdditionalDataStepProps) {
  const isCounterpartyNa = (value: string) => value.trim().toUpperCase() === contractCounterpartyValues.notApplicable

  const canAddCounterparty = (index: number) => {
    if (index !== counterparties.length - 1) {
      return false
    }

    return !isCounterpartyNa(counterparties[index]?.counterpartyName ?? '')
  }

  const handleCounterpartyNameKeyDown = (event: KeyboardEvent<HTMLInputElement>, counterpartyIndex: number) => {
    if (event.key !== 'Enter') {
      return
    }

    if (counterpartyIndex !== counterparties.length - 1) {
      return
    }

    if (!canAddCounterparty(counterpartyIndex)) {
      return
    }

    event.preventDefault()
    onAddCounterparty()
  }

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
            {isDepartmentLocked ? (
              <input id="department-id" className={styles.input} value={lockedDepartmentName || 'Locked'} readOnly />
            ) : (
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
            )}
          </div>

          {onBypassHodApprovalChange ? (
            !isSendForSigningFlow ? (
              <>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="bypass-hod-approval">
                    Bypass HOD Approval
                  </label>
                  <select
                    id="bypass-hod-approval"
                    className={styles.select}
                    value={bypassHodApproval ? 'true' : 'false'}
                    onChange={(event) => onBypassHodApprovalChange(event.target.value === 'true')}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>

                {bypassHodApproval && onBypassReasonChange ? (
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="bypass-reason">
                      Bypass Reason*
                    </label>
                    <textarea
                      id="bypass-reason"
                      className={styles.input}
                      value={bypassReason}
                      onChange={(event) => onBypassReasonChange(event.target.value)}
                      placeholder="Enter mandatory bypass justification"
                      rows={3}
                    />
                  </div>
                ) : null}
              </>
            ) : null
          ) : null}

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="signatory-name">
              {isSendForSigningFlow ? 'Counterparty Name*' : 'Counterparty Signatory Name*'}
            </label>
            <input
              id="signatory-name"
              className={styles.input}
              value={signatoryName}
              onChange={(event) => onSignatoryNameChange(event.target.value)}
              placeholder={isSendForSigningFlow ? 'Enter counterparty name' : 'Enter signatory name'}
            />
          </div>

          {!isSendForSigningFlow ? (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="signatory-designation">
                  Counterparty Signatory Designation*
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
                  Counterparty Signatory Email*
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
            </>
          ) : null}

          {!isSendForSigningFlow
            ? counterparties.map((counterparty, counterpartyIndex) => {
                const requiresSupportingDocs =
                  counterparty.counterpartyName.trim() !== '' && !isCounterpartyNa(counterparty.counterpartyName)

                return (
                  <div key={`counterparty-${counterpartyIndex}`} className={styles.counterpartyCard}>
                    <div className={styles.counterpartyHeader}>
                      <label className={styles.label} htmlFor={`counterparty-name-${counterpartyIndex}`}>
                        Counterparty Name* {counterparties.length > 1 ? `(${counterpartyIndex + 1})` : ''}
                      </label>
                      <div className={styles.counterpartyActions}>
                        {counterpartyIndex > 0 ? (
                          <button
                            type="button"
                            className={styles.counterpartyRemoveButton}
                            onClick={() => onRemoveCounterparty(counterpartyIndex)}
                            aria-label={`Remove counterparty ${counterpartyIndex + 1}`}
                          >
                            −
                          </button>
                        ) : null}
                        {canAddCounterparty(counterpartyIndex) ? (
                          <button type="button" className={styles.counterpartyAddButton} onClick={onAddCounterparty}>
                            +
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      id={`counterparty-name-${counterpartyIndex}`}
                      className={styles.input}
                      list="counterparty-options"
                      placeholder="Select or type counterparty"
                      value={counterparty.counterpartyName}
                      onChange={(event) => onCounterpartyNameChange(counterpartyIndex, event.target.value)}
                      onKeyDown={(event) => handleCounterpartyNameKeyDown(event, counterpartyIndex)}
                    />
                    {requiresSupportingDocs && (
                      <div className={styles.fieldGroup}>
                        <label className={styles.label} htmlFor={`supporting-docs-${counterpartyIndex}`}>
                          Supporting Document*
                        </label>
                        <div className={styles.dropzone}>
                          <span>Add supporting documents</span>
                          <label className={styles.dropzoneButton} htmlFor={`supporting-docs-${counterpartyIndex}`}>
                            Add files
                          </label>
                          <input
                            id={`supporting-docs-${counterpartyIndex}`}
                            className={styles.hiddenInput}
                            type="file"
                            multiple
                            onChange={(event) => {
                              const files = Array.from(event.target.files || [])
                              if (files.length) {
                                onSupportingFilesSelected(counterpartyIndex, files)
                              }
                            }}
                          />
                        </div>
                        <div className={styles.supportingList}>
                          {counterparty.supportingFiles.map((file, fileIndex) => (
                            <div key={`${file.name}-${counterpartyIndex}-${fileIndex}`} className={styles.fileCard}>
                              <div className={styles.fileMeta}>
                                <span className={styles.fileName}>{file.name}</span>
                                <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                              </div>
                              <button
                                type="button"
                                className={styles.removeButton}
                                onClick={() => onSupportingFileRemoved(counterpartyIndex, fileIndex)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            : null}

          {!isSendForSigningFlow ? (
            <datalist id="counterparty-options">
              {counterpartyOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          ) : null}

          {!isSendForSigningFlow && showCounterpartyModal ? <div className={styles.inlineModal} /> : null}

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
