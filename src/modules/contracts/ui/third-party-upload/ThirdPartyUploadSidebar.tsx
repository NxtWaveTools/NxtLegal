'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
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

const COUNTERPARTIES = [contractCounterpartyValues.notApplicable, 'Acme Corp', 'Orion Systems', 'Northwind Traders']
const ORGANIZATION_ENTITY = 'NxtWave Disruptive Technologies Pvt Ltd'

type CounterpartyEntry = {
  counterpartyName: string
  supportingFiles: File[]
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
  const [counterpartyEntries, setCounterpartyEntries] = useState<CounterpartyEntry[]>([
    { counterpartyName: '', supportingFiles: [] },
  ])
  const [signatoryName, setSignatoryName] = useState('')
  const [signatoryDesignation, setSignatoryDesignation] = useState('')
  const [signatoryEmail, setSignatoryEmail] = useState('')
  const [backgroundOfRequest, setBackgroundOfRequest] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [budgetApproved, setBudgetApproved] = useState(false)
  const [contractTypes, setContractTypes] = useState<ContractTypeOption[]>([])
  const [contractTypesLoaded, setContractTypesLoaded] = useState(false)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [departmentsLoaded, setDepartmentsLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState<string | null>(null)
  const [bypassHodApproval, setBypassHodApproval] = useState(false)
  const [bypassReason, setBypassReason] = useState('')

  const showCounterpartyModal = counterpartyEntries.some(
    (entry) => entry.counterpartyName.trim() !== '' && !COUNTERPARTIES.includes(entry.counterpartyName.trim())
  )
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
    setCounterpartyEntries([{ counterpartyName: '', supportingFiles: [] }])
    setSignatoryName('')
    setSignatoryDesignation('')
    setSignatoryEmail('')
    setBackgroundOfRequest('')
    setDepartmentId('')
    setBudgetApproved(false)
    setUploadSuccess(null)
    setIsSubmitting(false)
    setUploadIdempotencyKey(null)
    setBypassHodApproval(false)
    setBypassReason('')
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
          supportingFiles: entry.supportingFiles,
        }))
        .filter((entry) => entry.counterpartyName.length > 0)

      if (isLegalSendForSigningMode) {
        if (!contractType || !signatoryName.trim() || !effectiveDepartmentId) {
          toast.error('Please complete the required fields before continuing.')
          return
        }
      } else {
        if (
          !contractType ||
          normalizedCounterparties.length === 0 ||
          !signatoryName.trim() ||
          !signatoryDesignation.trim() ||
          !signatoryEmail.trim() ||
          !backgroundOfRequest.trim() ||
          !effectiveDepartmentId
        ) {
          toast.error('Please complete the required fields before continuing.')
          return
        }

        if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(signatoryEmail.trim())) {
          toast.error('Please enter a valid signatory email address.')
          return
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

      if (!isLegalSendForSigningMode) {
        for (const counterparty of normalizedCounterparties) {
          if (
            counterparty.counterpartyName.toUpperCase() !== contractCounterpartyValues.notApplicable &&
            counterparty.supportingFiles.length === 0
          ) {
            toast.error(`Supporting documents are required for counterparty ${counterparty.counterpartyName}.`)
            return
          }
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
        supportingFiles: entry.supportingFiles,
      }))
      .filter((entry) => entry.counterpartyName.length > 0)

    const effectiveCounterparties = isLegalSendForSigningMode
      ? signatoryName.trim()
        ? [
            {
              counterpartyName: signatoryName.trim(),
              supportingFiles: [] as File[],
            },
          ]
        : []
      : normalizedCounterparties

    const primaryCounterpartyName = effectiveCounterparties[0]?.counterpartyName ?? 'Counterparty'
    const generatedCounterpartySuffix =
      effectiveCounterparties.map((entry) => entry.counterpartyName).join(', ') || primaryCounterpartyName
    const generatedTitle = `${selectedContractTypeName || 'Contract'} - ${generatedCounterpartySuffix}`

    setUploadSuccess(null)
    setIsSubmitting(true)

    const idempotencyKey = uploadIdempotencyKey ?? crypto.randomUUID()
    if (!uploadIdempotencyKey) {
      setUploadIdempotencyKey(idempotencyKey)
    }

    try {
      const response = await contractsClient.upload({
        title: generatedTitle,
        contractTypeId: contractType,
        counterpartyName: primaryCounterpartyName,
        counterparties: effectiveCounterparties,
        signatoryName: signatoryName.trim(),
        signatoryDesignation: isLegalSendForSigningMode ? undefined : signatoryDesignation.trim(),
        signatoryEmail: isLegalSendForSigningMode ? undefined : signatoryEmail.trim().toLowerCase(),
        backgroundOfRequest: isLegalSendForSigningMode ? undefined : backgroundOfRequest.trim(),
        departmentId: effectiveDepartmentId,
        budgetApproved: isLegalSendForSigningMode ? undefined : budgetApproved,
        uploadMode: mode,
        bypassHodApproval: false,
        bypassReason: undefined,
        file: mainFile,
        idempotencyKey,
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
          counterparties={counterpartyEntries}
          counterpartyOptions={COUNTERPARTIES}
          showCounterpartyModal={showCounterpartyModal}
          onContractTypeChange={(value) => {
            setContractType(value)
          }}
          onCounterpartyNameChange={(index, value) => {
            setCounterpartyEntries((current) =>
              current.map((entry, currentIndex) =>
                currentIndex === index
                  ? {
                      ...entry,
                      counterpartyName: value,
                    }
                  : entry
              )
            )
          }}
          onAddCounterparty={() => {
            setCounterpartyEntries((current) => [...current, { counterpartyName: '', supportingFiles: [] }])
          }}
          onRemoveCounterparty={(indexToRemove) => {
            setCounterpartyEntries((current) => {
              const next = current.filter((_, index) => index !== indexToRemove)
              if (next.length === 0) {
                return [{ counterpartyName: '', supportingFiles: [] }]
              }

              return next
            })
          }}
          signatoryName={signatoryName}
          signatoryDesignation={signatoryDesignation}
          signatoryEmail={signatoryEmail}
          backgroundOfRequest={backgroundOfRequest}
          departmentId={effectiveDepartmentId}
          departments={departments}
          isDepartmentLocked={false}
          budgetApproved={budgetApproved}
          bypassHodApproval={bypassHodApproval}
          bypassReason={bypassReason}
          onSignatoryNameChange={setSignatoryName}
          onSignatoryDesignationChange={setSignatoryDesignation}
          onSignatoryEmailChange={setSignatoryEmail}
          onBackgroundOfRequestChange={setBackgroundOfRequest}
          onDepartmentIdChange={setDepartmentId}
          onBudgetApprovedChange={setBudgetApproved}
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
        />
      )
    }

    if (activeStep === 2) {
      return (
        <ReviewStep
          isSendForSigningFlow={isLegalSendForSigningMode}
          mainFileName={mainFile?.name || null}
          contractType={selectedContractTypeName}
          counterparties={
            isLegalSendForSigningMode
              ? signatoryName.trim()
                ? [
                    {
                      counterpartyName: signatoryName.trim(),
                      supportingCount: 0,
                      supportingFileNames: [],
                    },
                  ]
                : []
              : counterpartyEntries
                  .map((entry) => ({
                    counterpartyName: entry.counterpartyName.trim(),
                    supportingCount: entry.supportingFiles.length,
                    supportingFileNames: entry.supportingFiles.map((file) => file.name),
                  }))
                  .filter((entry) => entry.counterpartyName.length > 0)
          }
          departmentName={selectedDepartmentName}
          signatoryName={signatoryName}
          signatoryDesignation={signatoryDesignation}
          signatoryEmail={signatoryEmail}
          backgroundOfRequest={backgroundOfRequest}
          budgetApproved={budgetApproved}
          bypassHodApproval={false}
          bypassReason={undefined}
          organizationEntity={ORGANIZATION_ENTITY}
        />
      )
    }

    return <UploadStep isSubmitting={isSubmitting} successMessage={uploadSuccess} />
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
            {isSubmitting ? 'Uploading...' : 'Upload'}
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
