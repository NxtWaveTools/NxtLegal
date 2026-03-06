'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import { contractsClient } from '@/core/client/contracts-client'
import { contractCounterpartyValues } from '@/core/constants/contracts'
import { formatFileSize } from '@/lib/format-file-size'
import styles from '../third-party-upload.module.css'

type CounterpartySignatoryEntry = {
  name: string
  designation: string
  email: string
}

type CounterpartyEntry = {
  counterpartyName: string
  supportingFiles: File[]
  backgroundOfRequest: string
  budgetApproved: boolean
  signatories: CounterpartySignatoryEntry[]
}

type AdditionalDataStepProps = {
  isSendForSigningFlow?: boolean
  mainFileName: string | null
  contractType: string
  contractTypes: Array<{ id: string; name: string }>
  counterparties: CounterpartyEntry[]
  counterpartyOptions: string[]
  showCounterpartyModal: boolean
  onContractTypeChange: (value: string) => void
  onCounterpartyNameChange: (index: number, value: string) => void
  onCounterpartyBackgroundOfRequestChange: (index: number, value: string) => void
  onCounterpartyBudgetApprovedChange: (index: number, value: boolean) => void
  onCounterpartySignatoryChange: (
    counterpartyIndex: number,
    signatoryIndex: number,
    field: keyof CounterpartySignatoryEntry,
    value: string
  ) => void
  onCounterpartySignatoryAdd: (counterpartyIndex: number) => void
  onCounterpartySignatoryRemove: (counterpartyIndex: number, signatoryIndex: number) => void
  onCounterpartyAutofill: (
    counterpartyIndex: number,
    value: {
      backgroundOfRequest: string
      budgetApproved: boolean
      signatories: CounterpartySignatoryEntry[]
    }
  ) => void
  onAddCounterparty: () => void
  onRemoveCounterparty: (index: number) => void
  legalCounterpartyName: string
  departmentId: string
  departments: Array<{ id: string; name: string }>
  isDepartmentLocked?: boolean
  lockedDepartmentName?: string
  bypassHodApproval?: boolean
  bypassReason?: string
  onLegalCounterpartyNameChange: (value: string) => void
  onDepartmentIdChange: (value: string) => void
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
  onCounterpartyBackgroundOfRequestChange,
  onCounterpartyBudgetApprovedChange,
  onCounterpartySignatoryChange,
  onCounterpartySignatoryAdd,
  onCounterpartySignatoryRemove,
  onCounterpartyAutofill,
  onAddCounterparty,
  onRemoveCounterparty,
  legalCounterpartyName,
  departmentId,
  departments,
  isDepartmentLocked = false,
  lockedDepartmentName,
  bypassHodApproval = false,
  bypassReason = '',
  onLegalCounterpartyNameChange,
  onDepartmentIdChange,
  onBypassHodApprovalChange,
  onBypassReasonChange,
  onSupportingFilesSelected,
  onSupportingFileRemoved,
}: AdditionalDataStepProps) {
  const [loadedCounterpartyOptions, setLoadedCounterpartyOptions] = useState<string[]>(counterpartyOptions)
  const [counterpartyMetadataByName, setCounterpartyMetadataByName] = useState<
    Record<
      string,
      {
        backgroundOfRequest: string
        budgetApproved: boolean
        signatories: CounterpartySignatoryEntry[]
      }
    >
  >({})

  useEffect(() => {
    setLoadedCounterpartyOptions(counterpartyOptions)
  }, [counterpartyOptions])

  useEffect(() => {
    if (isSendForSigningFlow) {
      return
    }

    let isMounted = true

    void (async () => {
      const response = await contractsClient.counterparties()
      if (!isMounted || !response.ok || !response.data?.counterparties) {
        return
      }

      const validCounterparties = response.data.counterparties
        .map((item) => ({
          name: item.name.trim(),
          backgroundOfRequest: item.backgroundOfRequest?.trim() ?? '',
          budgetApproved: Boolean(item.budgetApproved),
          signatories: (item.signatories ?? [])
            .map((signatory) => ({
              name: signatory.name.trim(),
              designation: signatory.designation.trim(),
              email: signatory.email.trim().toLowerCase(),
            }))
            .filter((signatory) => signatory.name && signatory.designation && signatory.email),
        }))
        .filter((counterparty) => {
          return (
            counterparty.name.length > 0 && counterparty.name.toUpperCase() !== contractCounterpartyValues.notApplicable
          )
        })

      const names = validCounterparties.map((item) => item.name)
      const nextMetadataByName = validCounterparties.reduce<
        Record<
          string,
          {
            backgroundOfRequest: string
            budgetApproved: boolean
            signatories: CounterpartySignatoryEntry[]
          }
        >
      >((accumulator, item) => {
        accumulator[item.name.toLowerCase()] = {
          backgroundOfRequest: item.backgroundOfRequest,
          budgetApproved: item.budgetApproved,
          signatories: item.signatories,
        }
        return accumulator
      }, {})

      setLoadedCounterpartyOptions([contractCounterpartyValues.notApplicable, ...names])
      setCounterpartyMetadataByName(nextMetadataByName)
    })()

    return () => {
      isMounted = false
    }
  }, [isSendForSigningFlow])

  const isCounterpartyNa = (value: string) => value.trim().toUpperCase() === contractCounterpartyValues.notApplicable

  const canAddCounterparty = (index: number) => {
    if (index !== counterparties.length - 1) {
      return false
    }

    return !isCounterpartyNa(counterparties[index]?.counterpartyName ?? '')
  }

  const maybeAutofillCounterparty = (counterpartyIndex: number, rawValue: string) => {
    const normalizedValue = rawValue.trim().toLowerCase()
    if (!normalizedValue) {
      return
    }

    if (normalizedValue === contractCounterpartyValues.notApplicable.toLowerCase()) {
      return
    }

    const metadata = counterpartyMetadataByName[normalizedValue]
    if (!metadata) {
      return
    }

    onCounterpartyAutofill(counterpartyIndex, metadata)
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

          {!isSendForSigningFlow
            ? counterparties.map((counterparty, counterpartyIndex) => {
                const isNotApplicableCounterparty = isCounterpartyNa(counterparty.counterpartyName)
                const requiresSupportingDocs =
                  counterparty.counterpartyName.trim() !== '' && !isNotApplicableCounterparty

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
                      onChange={(event) => {
                        const value = event.target.value
                        onCounterpartyNameChange(counterpartyIndex, value)
                        maybeAutofillCounterparty(counterpartyIndex, value)
                      }}
                      onBlur={(event) => maybeAutofillCounterparty(counterpartyIndex, event.target.value)}
                      onKeyDown={(event) => handleCounterpartyNameKeyDown(event, counterpartyIndex)}
                    />

                    <div className={styles.fieldGroup}>
                      <label
                        className={styles.label}
                        htmlFor={`counterparty-background-of-request-${counterpartyIndex}`}
                      >
                        Background of Request*
                      </label>
                      <textarea
                        id={`counterparty-background-of-request-${counterpartyIndex}`}
                        className={styles.input}
                        value={counterparty.backgroundOfRequest}
                        disabled={isNotApplicableCounterparty}
                        onChange={(event) =>
                          onCounterpartyBackgroundOfRequestChange(counterpartyIndex, event.target.value)
                        }
                        placeholder="Describe the request context"
                        rows={4}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.label} htmlFor={`counterparty-budget-approved-${counterpartyIndex}`}>
                        Budget Approved*
                      </label>
                      <select
                        id={`counterparty-budget-approved-${counterpartyIndex}`}
                        className={styles.select}
                        value={counterparty.budgetApproved ? 'true' : 'false'}
                        disabled={isNotApplicableCounterparty}
                        onChange={(event) =>
                          onCounterpartyBudgetApprovedChange(counterpartyIndex, event.target.value === 'true')
                        }
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </div>

                    {counterparty.signatories.map((signatory, signatoryIndex) => (
                      <div
                        key={`counterparty-${counterpartyIndex}-signatory-${signatoryIndex}`}
                        className={styles.counterpartyCard}
                      >
                        <div className={styles.counterpartyHeader}>
                          <label
                            className={styles.label}
                            htmlFor={`counterparty-${counterpartyIndex}-signatory-name-${signatoryIndex}`}
                          >
                            Counterparty Signatory {counterparty.signatories.length > 1 ? `${signatoryIndex + 1}` : ''}
                          </label>
                          <div className={styles.counterpartyActions}>
                            {signatoryIndex > 0 ? (
                              <button
                                type="button"
                                className={styles.counterpartyRemoveButton}
                                disabled={isNotApplicableCounterparty}
                                onClick={() => onCounterpartySignatoryRemove(counterpartyIndex, signatoryIndex)}
                                aria-label={`Remove signatory ${signatoryIndex + 1}`}
                              >
                                −
                              </button>
                            ) : null}
                            {signatoryIndex === counterparty.signatories.length - 1 ? (
                              <button
                                type="button"
                                className={styles.counterpartyAddButton}
                                disabled={isNotApplicableCounterparty}
                                onClick={() => onCounterpartySignatoryAdd(counterpartyIndex)}
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label
                            className={styles.label}
                            htmlFor={`counterparty-${counterpartyIndex}-signatory-name-${signatoryIndex}`}
                          >
                            Counterparty Signatory Name*
                          </label>
                          <input
                            id={`counterparty-${counterpartyIndex}-signatory-name-${signatoryIndex}`}
                            className={styles.input}
                            value={signatory.name}
                            disabled={isNotApplicableCounterparty}
                            onChange={(event) =>
                              onCounterpartySignatoryChange(
                                counterpartyIndex,
                                signatoryIndex,
                                'name',
                                event.target.value
                              )
                            }
                            placeholder="Enter signatory name"
                          />
                        </div>

                        <div className={styles.fieldGroup}>
                          <label
                            className={styles.label}
                            htmlFor={`counterparty-${counterpartyIndex}-signatory-designation-${signatoryIndex}`}
                          >
                            Counterparty Signatory Designation*
                          </label>
                          <input
                            id={`counterparty-${counterpartyIndex}-signatory-designation-${signatoryIndex}`}
                            className={styles.input}
                            value={signatory.designation}
                            disabled={isNotApplicableCounterparty}
                            onChange={(event) =>
                              onCounterpartySignatoryChange(
                                counterpartyIndex,
                                signatoryIndex,
                                'designation',
                                event.target.value
                              )
                            }
                            placeholder="Enter designation"
                          />
                        </div>

                        <div className={styles.fieldGroup}>
                          <label
                            className={styles.label}
                            htmlFor={`counterparty-${counterpartyIndex}-signatory-email-${signatoryIndex}`}
                          >
                            Counterparty Signatory Email*
                          </label>
                          <input
                            id={`counterparty-${counterpartyIndex}-signatory-email-${signatoryIndex}`}
                            className={styles.input}
                            type="email"
                            value={signatory.email}
                            disabled={isNotApplicableCounterparty}
                            onChange={(event) =>
                              onCounterpartySignatoryChange(
                                counterpartyIndex,
                                signatoryIndex,
                                'email',
                                event.target.value
                              )
                            }
                            placeholder="name@company.com"
                          />
                        </div>
                      </div>
                    ))}

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

          {isSendForSigningFlow ? (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="signatory-name">
                  Counterparty Name*
                </label>
                <input
                  id="signatory-name"
                  className={styles.input}
                  value={legalCounterpartyName}
                  onChange={(event) => onLegalCounterpartyNameChange(event.target.value)}
                  placeholder="Enter counterparty name"
                />
              </div>
            </>
          ) : null}

          {!isSendForSigningFlow ? (
            <datalist id="counterparty-options">
              {loadedCounterpartyOptions.map((option) => (
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
