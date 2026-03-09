'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { contractsClient, type ContractTypeOption, type DepartmentOption } from '@/core/client/contracts-client'
import {
  contractCounterpartyValues,
  contractUploadModes,
  contractWorkflowRoles,
  type ContractUploadMode,
} from '@/core/constants/contracts'
import WorkflowSidebar from './WorkflowSidebar'
import ChooseFilesStep from './steps/ChooseFilesStep'
import AdditionalDataStep from './steps/AdditionalDataStep'
import ReviewStep from './steps/ReviewStep'
import UploadStep from './steps/UploadStep'
import styles from './third-party-upload.module.css'

type ThirdPartyUploadSidebarProps = {
  isOpen: boolean
  onClose: () => void
  mode?: ContractUploadMode
  actorRole?: string
  onUploaded?: () => Promise<void> | void
}

const ORGANIZATION_ENTITY = 'NxtWave Disruptive Technologies Pvt Ltd'
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

function isValidSignatoryEmail(value: string): boolean {
  const normalizedValue = value.trim()
  if (normalizedValue.toUpperCase() === 'NA') {
    return true
  }

  return EMAIL_PATTERN.test(normalizedValue)
}

type CounterpartyEntry = {
  counterpartyName: string
  supportingFiles: File[]
  signatories: Array<{
    name: string
    designation: string
    email: string
  }>
}

function createEmptySignatory() {
  return {
    name: '',
    designation: '',
    email: '',
  }
}

function createEmptyCounterpartyEntry(): CounterpartyEntry {
  return {
    counterpartyName: '',
    supportingFiles: [],
    signatories: [createEmptySignatory()],
  }
}

export default function ThirdPartyUploadSidebar({
  isOpen,
  onClose,
  mode = contractUploadModes.default,
  actorRole,
  onUploaded,
}: ThirdPartyUploadSidebarProps) {
  const router = useRouter()
  const isLegalSendForSigningMode = mode === contractUploadModes.legalSendForSigning
  const acceptedFileTypes = isLegalSendForSigningMode ? '.pdf' : '.docx'
  const acceptedExtensionsLabel = isLegalSendForSigningMode ? 'PDF (.pdf)' : 'Word (.docx)'
  const steps = useMemo(() => ['Choose Files', 'Additional Data', 'Review', 'Upload'], [])
  const [activeStep, setActiveStep] = useState(0)
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [contractType, setContractType] = useState('')
  const [backgroundOfRequest, setBackgroundOfRequest] = useState('')
  const [budgetApproved, setBudgetApproved] = useState(false)
  const [budgetSupportingFiles, setBudgetSupportingFiles] = useState<File[]>([])
  const [counterpartyEntries, setCounterpartyEntries] = useState<CounterpartyEntry[]>([createEmptyCounterpartyEntry()])
  const [departmentId, setDepartmentId] = useState('')
  const [contractTypes, setContractTypes] = useState<ContractTypeOption[]>([])
  const [contractTypesLoaded, setContractTypesLoaded] = useState(false)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [departmentsLoaded, setDepartmentsLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState<string | null>(null)
  const [bypassHodApproval, setBypassHodApproval] = useState(false)
  const [bypassReason, setBypassReason] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)

  const showCounterpartyModal = false
  const isLegalActor = actorRole === contractWorkflowRoles.legalTeam
  const effectiveDepartmentId = departmentId
  const selectedDepartmentName = departments.find((item) => item.id === departmentId)?.name ?? ''
  const selectedContractTypeName = contractTypes.find((item) => item.id === contractType)?.name ?? ''

  useEffect(() => {
    if (!isOpen || (departmentsLoaded && contractTypesLoaded)) {
      return
    }

    let isMounted = true

    void (async () => {
      const [departmentsResponse, contractTypesResponse] = await Promise.all([
        contractsClient.departments(),
        contractsClient.contractTypes(),
      ])
      if (!isMounted) {
        return
      }

      if (departmentsResponse.ok && departmentsResponse.data?.departments) {
        setDepartments(departmentsResponse.data.departments)
      }

      if (contractTypesResponse.ok && contractTypesResponse.data?.contractTypes) {
        setContractTypes(contractTypesResponse.data.contractTypes)
      }

      setContractTypesLoaded(true)

      setDepartmentsLoaded(true)
    })()

    return () => {
      isMounted = false
    }
  }, [isOpen, contractTypesLoaded, departmentsLoaded])

  const resetAll = () => {
    setActiveStep(0)
    setMainFile(null)
    setContractType('')
    setBackgroundOfRequest('')
    setBudgetApproved(false)
    setBudgetSupportingFiles([])
    setCounterpartyEntries([createEmptyCounterpartyEntry()])
    setDepartmentId('')
    setUploadSuccess(null)
    setIsSubmitting(false)
    setUploadIdempotencyKey(null)
    setBypassHodApproval(false)
    setBypassReason('')
    setUploadProgress(null)
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort()
      uploadAbortRef.current = null
    }
  }

  const handleMainFile = (file: File) => {
    const isValidFile = isLegalSendForSigningMode
      ? file.name.toLowerCase().endsWith('.pdf')
      : file.name.toLowerCase().endsWith('.docx')

    if (!isValidFile) {
      setMainFile(null)
      toast.error(isLegalSendForSigningMode ? 'Only PDF (.pdf) files allowed.' : 'Only Word (.docx) files allowed.')
      return
    }

    setMainFile(file)
  }

  const handleNext = () => {
    if (activeStep === 0) {
      if (!mainFile) {
        toast.error(
          isLegalSendForSigningMode
            ? 'Please upload a .pdf contract to continue.'
            : 'Please upload a .docx contract to continue.'
        )
        return
      }
    }

    if (activeStep === 1) {
      const normalizedCounterparties = counterpartyEntries
        .map((entry) => ({
          counterpartyName: entry.counterpartyName.trim(),
          backgroundOfRequest:
            entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
              ? contractCounterpartyValues.notApplicable
              : backgroundOfRequest.trim(),
          budgetApproved:
            entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
              ? false
              : budgetApproved,
          supportingFiles:
            entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
              ? []
              : entry.supportingFiles,
          signatories:
            entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
              ? []
              : entry.signatories.map((signatory) => ({
                  name: signatory.name.trim(),
                  designation: signatory.designation.trim(),
                  email: signatory.email.trim().toLowerCase(),
                })),
        }))
        .filter((entry) => entry.counterpartyName.length > 0)

      if (!contractType || normalizedCounterparties.length === 0 || !effectiveDepartmentId) {
        toast.error('Please complete the required fields before continuing.')
        return
      }

      if (!backgroundOfRequest.trim()) {
        toast.error('Please provide background of request before continuing.')
        return
      }

      if (budgetApproved && budgetSupportingFiles.length === 0) {
        toast.error('Please upload a supporting document when budget approved is Yes.')
        return
      }

      for (const counterparty of normalizedCounterparties) {
        const isNotApplicableCounterparty =
          counterparty.counterpartyName.toUpperCase() === contractCounterpartyValues.notApplicable
        if (isNotApplicableCounterparty) {
          continue
        }

        if (counterparty.signatories.length === 0) {
          toast.error(`Please add at least one signatory for ${counterparty.counterpartyName}.`)
          return
        }

        if (counterparty.supportingFiles.length === 0) {
          toast.error(`Supporting documents are required for counterparty ${counterparty.counterpartyName}.`)
          return
        }

        const seenEmails = new Set<string>()
        for (const signatory of counterparty.signatories) {
          if (!signatory.name || !signatory.designation || !signatory.email) {
            toast.error(`Please complete all signatory details for ${counterparty.counterpartyName}.`)
            return
          }

          if (!isValidSignatoryEmail(signatory.email)) {
            toast.error(`Please enter valid signatory email(s) for ${counterparty.counterpartyName}.`)
            return
          }

          if (seenEmails.has(signatory.email)) {
            toast.error(`Signatory emails must be unique for ${counterparty.counterpartyName}.`)
            return
          }

          seenEmails.add(signatory.email)
        }
      }

      if (departments.length === 0) {
        toast.error('No departments are configured for this tenant.')
        return
      }

      if (isLegalSendForSigningMode) {
        if (!isLegalActor) {
          toast.error('Only Legal Team can use Send for Signing mode.')
          return
        }
      }
    }

    setActiveStep((current) => Math.min(current + 1, steps.length - 1))
  }

  const handleBack = () => {
    setActiveStep((current) => Math.max(current - 1, 0))
  }

  const handleUpload = async () => {
    if (isSubmitting || uploadSuccess) {
      return
    }

    if (!mainFile) {
      toast.error('Please upload a contract file before submitting.')
      return
    }

    const normalizedCounterparties = counterpartyEntries
      .map((entry) => ({
        counterpartyName: entry.counterpartyName.trim(),
        supportingFiles:
          entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
            ? []
            : entry.supportingFiles,
        backgroundOfRequest:
          entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
            ? contractCounterpartyValues.notApplicable
            : backgroundOfRequest.trim(),
        budgetApproved:
          entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
            ? false
            : budgetApproved,
        signatories:
          entry.counterpartyName.trim().toUpperCase() === contractCounterpartyValues.notApplicable
            ? []
            : entry.signatories
                .map((signatory) => ({
                  name: signatory.name.trim(),
                  designation: signatory.designation.trim(),
                  email: signatory.email.trim().toLowerCase(),
                }))
                .filter((signatory) => signatory.name || signatory.designation || signatory.email),
      }))
      .filter((entry) => entry.counterpartyName.length > 0)

    const effectiveCounterparties = normalizedCounterparties
    const primarySignatoryName =
      effectiveCounterparties[0]?.signatories[0]?.name?.trim() ||
      effectiveCounterparties[0]?.counterpartyName ||
      'Counterparty'

    const primaryCounterpartyName = effectiveCounterparties[0]?.counterpartyName ?? 'Counterparty'
    const generatedCounterpartySuffix =
      effectiveCounterparties.map((entry) => entry.counterpartyName).join(', ') || primaryCounterpartyName
    const generatedTitle = `${selectedContractTypeName || 'Contract'} - ${generatedCounterpartySuffix}`

    setUploadSuccess(null)
    setIsSubmitting(true)
    setUploadProgress(0)

    const idempotencyKey = uploadIdempotencyKey ?? crypto.randomUUID()
    if (!uploadIdempotencyKey) {
      setUploadIdempotencyKey(idempotencyKey)
    }

    const abortController = new AbortController()
    uploadAbortRef.current = abortController

    try {
      const response = await contractsClient.upload({
        title: generatedTitle,
        contractTypeId: contractType,
        counterpartyName: primaryCounterpartyName,
        counterparties: effectiveCounterparties,
        signatoryName: primarySignatoryName,
        departmentId: effectiveDepartmentId,
        uploadMode: mode,
        bypassHodApproval: false,
        bypassReason: undefined,
        backgroundOfRequest: backgroundOfRequest.trim(),
        budgetApproved,
        file: mainFile,
        supportingFiles: budgetApproved ? budgetSupportingFiles : [],
        idempotencyKey,
        onProgress: (percent) => setUploadProgress(percent),
        signal: abortController.signal,
      })

      if (!response.ok || !response.data?.contract) {
        const failureMessage = response.error?.message ?? 'Failed to upload contract'
        toast.error(failureMessage)
        return
      }

      const successMessage = `Uploaded ${response.data.contract.title} successfully.`
      setUploadSuccess(successMessage)
      toast.success(successMessage)
      setUploadIdempotencyKey(null)

      if (onUploaded) {
        await onUploaded()
      }

      onClose()
      resetAll()
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
      uploadAbortRef.current = null
    }
  }

  const handleStepKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || activeStep >= steps.length - 1) {
      return
    }

    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return
    }

    if (target instanceof HTMLInputElement && (target.type === 'file' || target.type === 'checkbox')) {
      return
    }

    event.preventDefault()
    handleNext()
  }

  const stepContent = () => {
    if (activeStep === 0) {
      return (
        <ChooseFilesStep
          mainFile={mainFile}
          isDragging={isDragging}
          acceptedFileTypes={acceptedFileTypes}
          acceptedExtensionsLabel={acceptedExtensionsLabel}
          onFileSelected={handleMainFile}
          onFileRemoved={() => {
            setMainFile(null)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) {
              handleMainFile(file)
            }
          }}
        />
      )
    }

    if (activeStep === 1) {
      return (
        <AdditionalDataStep
          isSendForSigningFlow={isLegalSendForSigningMode}
          mainFileName={mainFile?.name || null}
          contractType={contractType}
          contractTypes={contractTypes}
          backgroundOfRequest={backgroundOfRequest}
          budgetApproved={budgetApproved}
          budgetSupportingFiles={budgetSupportingFiles}
          counterparties={counterpartyEntries}
          counterpartyOptions={[contractCounterpartyValues.notApplicable]}
          showCounterpartyModal={showCounterpartyModal}
          onContractTypeChange={(value) => {
            setContractType(value)
          }}
          onBackgroundOfRequestChange={(value) => {
            setBackgroundOfRequest(value)
          }}
          onBudgetApprovedChange={(value) => {
            setBudgetApproved(value)
            if (!value) {
              setBudgetSupportingFiles([])
            }
          }}
          onCounterpartyNameChange={(index, value) => {
            setCounterpartyEntries((current) =>
              current.map((entry, currentIndex) =>
                currentIndex === index
                  ? {
                      ...entry,
                      counterpartyName: value,
                      ...(value.trim().toUpperCase() === contractCounterpartyValues.notApplicable
                        ? {
                            signatories: [],
                            supportingFiles: [],
                          }
                        : {
                            signatories: entry.signatories.length > 0 ? entry.signatories : [createEmptySignatory()],
                            supportingFiles: entry.supportingFiles,
                          }),
                    }
                  : entry
              )
            )
          }}
          onCounterpartySignatoryChange={(counterpartyIndex, signatoryIndex, field, value) => {
            setCounterpartyEntries((current) =>
              current.map((entry, entryIndex) => {
                if (entryIndex !== counterpartyIndex) {
                  return entry
                }

                return {
                  ...entry,
                  signatories: entry.signatories.map((signatory, currentSignatoryIndex) =>
                    currentSignatoryIndex === signatoryIndex
                      ? {
                          ...signatory,
                          [field]: value,
                        }
                      : signatory
                  ),
                }
              })
            )
          }}
          onCounterpartySignatoryAdd={(counterpartyIndex) => {
            setCounterpartyEntries((current) =>
              current.map((entry, entryIndex) =>
                entryIndex === counterpartyIndex
                  ? {
                      ...entry,
                      signatories: [...entry.signatories, createEmptySignatory()],
                    }
                  : entry
              )
            )
          }}
          onCounterpartySignatoryRemove={(counterpartyIndex, signatoryIndex) => {
            setCounterpartyEntries((current) =>
              current.map((entry, entryIndex) => {
                if (entryIndex !== counterpartyIndex) {
                  return entry
                }

                const nextSignatories = entry.signatories.filter((_, index) => index !== signatoryIndex)
                return {
                  ...entry,
                  signatories: nextSignatories.length > 0 ? nextSignatories : [createEmptySignatory()],
                }
              })
            )
          }}
          onCounterpartyAutofill={(counterpartyIndex, value) => {
            setCounterpartyEntries((current) =>
              current.map((entry, entryIndex) =>
                entryIndex === counterpartyIndex
                  ? {
                      ...entry,
                      signatories: value.signatories.length > 0 ? value.signatories : [createEmptySignatory()],
                    }
                  : entry
              )
            )
          }}
          onAddCounterparty={() => {
            setCounterpartyEntries((current) => [...current, createEmptyCounterpartyEntry()])
          }}
          onRemoveCounterparty={(indexToRemove) => {
            setCounterpartyEntries((current) => {
              const next = current.filter((_, index) => index !== indexToRemove)
              if (next.length === 0) {
                return [createEmptyCounterpartyEntry()]
              }

              return next
            })
          }}
          departmentId={effectiveDepartmentId}
          departments={departments}
          isDepartmentLocked={false}
          bypassHodApproval={bypassHodApproval}
          bypassReason={bypassReason}
          onDepartmentIdChange={setDepartmentId}
          onBypassHodApprovalChange={
            isLegalSendForSigningMode
              ? (value) => {
                  setBypassHodApproval(value)
                  if (!value) {
                    setBypassReason('')
                  }
                }
              : undefined
          }
          onBypassReasonChange={
            isLegalSendForSigningMode
              ? (value) => {
                  setBypassReason(value)
                }
              : undefined
          }
          onSupportingFilesSelected={(counterpartyIndex, files) => {
            setCounterpartyEntries((current) =>
              current.map((entry, currentIndex) =>
                currentIndex === counterpartyIndex
                  ? {
                      ...entry,
                      supportingFiles: [...entry.supportingFiles, ...files],
                    }
                  : entry
              )
            )
          }}
          onSupportingFileRemoved={(counterpartyIndex, fileIndex) =>
            setCounterpartyEntries((current) =>
              current.map((entry, currentIndex) =>
                currentIndex === counterpartyIndex
                  ? {
                      ...entry,
                      supportingFiles: entry.supportingFiles.filter((_, index) => index !== fileIndex),
                    }
                  : entry
              )
            )
          }
          onBudgetSupportingFilesSelected={(files) => {
            setBudgetSupportingFiles((current) => [...current, ...files])
          }}
          onBudgetSupportingFileRemoved={(fileIndex) =>
            setBudgetSupportingFiles((current) => current.filter((_, index) => index !== fileIndex))
          }
        />
      )
    }

    if (activeStep === 2) {
      return (
        <ReviewStep
          isSendForSigningFlow={isLegalSendForSigningMode}
          mainFileName={mainFile?.name || null}
          contractType={selectedContractTypeName}
          counterparties={counterpartyEntries
            .map((entry) => ({
              counterpartyName: entry.counterpartyName.trim(),
              supportingCount: entry.supportingFiles.length,
              supportingFileNames: entry.supportingFiles.map((file) => file.name),
              signatories: entry.signatories.map((signatory) => ({
                name: signatory.name.trim(),
                designation: signatory.designation.trim(),
                email: signatory.email.trim(),
              })),
            }))
            .filter((entry) => entry.counterpartyName.length > 0)}
          backgroundOfRequest={backgroundOfRequest.trim()}
          budgetApproved={budgetApproved}
          budgetSupportingFileNames={budgetSupportingFiles.map((file) => file.name)}
          departmentName={selectedDepartmentName}
          bypassHodApproval={false}
          bypassReason={undefined}
          organizationEntity={ORGANIZATION_ENTITY}
        />
      )
    }

    return (
      <UploadStep
        isSubmitting={isSubmitting}
        successMessage={uploadSuccess}
        uploadProgress={uploadProgress}
        onCancel={() => {
          if (uploadAbortRef.current) {
            uploadAbortRef.current.abort()
            uploadAbortRef.current = null
          }
        }}
      />
    )
  }

  const footer = (
    <>
      <button type="button" className={styles.button} onClick={resetAll}>
        Clear
      </button>
      <div className={styles.uploadActions}>
        {activeStep > 0 && (
          <button type="button" className={styles.button} onClick={handleBack}>
            Back
          </button>
        )}
        {activeStep < steps.length - 1 && (
          <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}>
            Next
          </button>
        )}
        {activeStep === steps.length - 1 && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={isSubmitting || Boolean(uploadSuccess)}
            onClick={handleUpload}
          >
            {isSubmitting ? `Uploading${uploadProgress !== null ? ` ${uploadProgress}%` : '…'}` : 'Upload'}
          </button>
        )}
      </div>
    </>
  )

  return (
    <WorkflowSidebar
      isOpen={isOpen}
      title={isLegalSendForSigningMode ? 'Send for signing' : 'Upload third party contract'}
      steps={steps}
      activeStep={activeStep}
      onStepChange={(stepIndex) => setActiveStep(stepIndex)}
      onClose={onClose}
      footer={footer}
    >
      <div onKeyDown={handleStepKeyDown}>{stepContent()}</div>
    </WorkflowSidebar>
  )
}
