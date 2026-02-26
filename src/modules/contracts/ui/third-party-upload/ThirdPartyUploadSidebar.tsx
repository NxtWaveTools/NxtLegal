'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { contractsClient, type ContractTypeOption, type DepartmentOption } from '@/core/client/contracts-client'
import {
  contractUploadModes,
  contractWorkflowIdentities,
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

const COUNTERPARTIES = ['NA', 'Acme Corp', 'Orion Systems', 'Northwind Traders']
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
  const [mainFileError, setMainFileError] = useState<string | null>(null)
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
  const [stepError, setStepError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState<string | null>(null)
  const [bypassHodApproval, setBypassHodApproval] = useState(false)
  const [bypassReason, setBypassReason] = useState('')

  const showCounterpartyModal = counterpartyEntries.some(
    (entry) => entry.counterpartyName.trim() !== '' && !COUNTERPARTIES.includes(entry.counterpartyName.trim())
  )
  const legalDepartment = departments.find(
    (item) => item.name.trim().toLowerCase() === contractWorkflowIdentities.legalDepartmentName.toLowerCase()
  )
  const legalDepartmentId = legalDepartment?.id ?? ''
  const isLegalActor = actorRole === contractWorkflowRoles.legalTeam
  const effectiveDepartmentId = isLegalSendForSigningMode ? departmentId || legalDepartmentId : departmentId
  const selectedDepartmentName = isLegalSendForSigningMode
    ? contractWorkflowIdentities.legalDepartmentName
    : (departments.find((item) => item.id === departmentId)?.name ?? '')
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
    setMainFileError(null)
    setContractType('')
    setCounterpartyEntries([{ counterpartyName: '', supportingFiles: [] }])
    setSignatoryName('')
    setSignatoryDesignation('')
    setSignatoryEmail('')
    setBackgroundOfRequest('')
    setDepartmentId('')
    setBudgetApproved(false)
    setStepError(null)
    setUploadError(null)
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
      setMainFileError(
        isLegalSendForSigningMode ? 'Only PDF (.pdf) files allowed.' : 'Only Word (.docx) files allowed.'
      )
      return
    }

    setMainFile(file)
    setMainFileError(null)
  }

  const handleNext = () => {
    if (activeStep === 0) {
      if (!mainFile) {
        setMainFileError(
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

      if (
        !contractType ||
        normalizedCounterparties.length === 0 ||
        !signatoryName.trim() ||
        !signatoryDesignation.trim() ||
        !signatoryEmail.trim() ||
        !backgroundOfRequest.trim() ||
        !effectiveDepartmentId
      ) {
        setStepError('Please complete the required fields before continuing.')
        return
      }

      if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(signatoryEmail.trim())) {
        setStepError('Please enter a valid signatory email address.')
        return
      }

      if (departments.length === 0) {
        setStepError('No departments are configured for this tenant.')
        return
      }

      if (isLegalSendForSigningMode) {
        if (!isLegalActor) {
          setStepError('Only Legal Team can use Send for Signing mode.')
          return
        }

        if (!legalDepartmentId || effectiveDepartmentId !== legalDepartmentId) {
          setStepError('Legal and Compliance department is required for this workflow.')
          return
        }

        if (bypassHodApproval && !bypassReason.trim()) {
          setStepError('Bypass reason is required when bypassing HOD approval.')
          return
        }
      }

      for (const counterparty of normalizedCounterparties) {
        if (counterparty.counterpartyName.toUpperCase() !== 'NA' && counterparty.supportingFiles.length === 0) {
          setStepError(`Supporting documents are required for counterparty ${counterparty.counterpartyName}.`)
          return
        }
      }
    }

    setStepError(null)
    setActiveStep((current) => Math.min(current + 1, steps.length - 1))
  }

  const handleBack = () => {
    setStepError(null)
    setActiveStep((current) => Math.max(current - 1, 0))
  }

  const handleUpload = async () => {
    if (isSubmitting || uploadSuccess) {
      return
    }

    if (!mainFile) {
      setUploadError('Please upload a contract file before submitting.')
      return
    }

    const primaryCounterpartyName =
      counterpartyEntries.find((entry) => entry.counterpartyName.trim().length > 0)?.counterpartyName.trim() ??
      'Counterparty'
    const generatedTitle = `${selectedContractTypeName || 'Contract'} - ${primaryCounterpartyName}`

    setUploadError(null)
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
        counterparties: counterpartyEntries
          .map((entry) => ({
            counterpartyName: entry.counterpartyName.trim(),
            supportingFiles: entry.supportingFiles,
          }))
          .filter((entry) => entry.counterpartyName.length > 0),
        signatoryName: signatoryName.trim(),
        signatoryDesignation: signatoryDesignation.trim(),
        signatoryEmail: signatoryEmail.trim().toLowerCase(),
        backgroundOfRequest: backgroundOfRequest.trim(),
        departmentId: effectiveDepartmentId,
        budgetApproved,
        uploadMode: mode,
        bypassHodApproval: isLegalSendForSigningMode ? bypassHodApproval : false,
        bypassReason: isLegalSendForSigningMode ? bypassReason.trim() : undefined,
        file: mainFile,
        idempotencyKey,
      })

      if (!response.ok || !response.data?.contract) {
        setIsSubmitting(false)
        const failureMessage = response.error?.message ?? 'Failed to upload contract'
        setUploadError(failureMessage)
        toast.error(failureMessage)
        return
      }

      setIsSubmitting(false)
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
    } catch {
      setIsSubmitting(false)
      const failureMessage = 'Unexpected error while uploading contract. Please try again.'
      setUploadError(failureMessage)
      toast.error(failureMessage)
    }
  }

  const stepContent = () => {
    if (activeStep === 0) {
      return (
        <ChooseFilesStep
          mainFile={mainFile}
          errorMessage={mainFileError}
          isDragging={isDragging}
          acceptedFileTypes={acceptedFileTypes}
          acceptedExtensionsLabel={acceptedExtensionsLabel}
          onFileSelected={handleMainFile}
          onFileRemoved={() => {
            setMainFile(null)
            setMainFileError(null)
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
        <>
          {stepError && <div className={styles.errorText}>{stepError}</div>}
          <AdditionalDataStep
            mainFileName={mainFile?.name || null}
            contractType={contractType}
            contractTypes={contractTypes}
            counterparties={counterpartyEntries}
            counterpartyOptions={COUNTERPARTIES}
            showCounterpartyModal={showCounterpartyModal}
            onContractTypeChange={(value) => {
              setContractType(value)
              setStepError(null)
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
              setStepError(null)
            }}
            onAddCounterparty={() => {
              setCounterpartyEntries((current) => [...current, { counterpartyName: '', supportingFiles: [] }])
              setStepError(null)
            }}
            signatoryName={signatoryName}
            signatoryDesignation={signatoryDesignation}
            signatoryEmail={signatoryEmail}
            backgroundOfRequest={backgroundOfRequest}
            departmentId={effectiveDepartmentId}
            departments={departments}
            isDepartmentLocked={isLegalSendForSigningMode}
            lockedDepartmentName={contractWorkflowIdentities.legalDepartmentName}
            budgetApproved={budgetApproved}
            bypassHodApproval={bypassHodApproval}
            bypassReason={bypassReason}
            onSignatoryNameChange={(value) => {
              setSignatoryName(value)
              setStepError(null)
            }}
            onSignatoryDesignationChange={(value) => {
              setSignatoryDesignation(value)
              setStepError(null)
            }}
            onSignatoryEmailChange={(value) => {
              setSignatoryEmail(value)
              setStepError(null)
            }}
            onBackgroundOfRequestChange={(value) => {
              setBackgroundOfRequest(value)
              setStepError(null)
            }}
            onDepartmentIdChange={(value) => {
              setDepartmentId(value)
              setStepError(null)
            }}
            onBudgetApprovedChange={(value) => {
              setBudgetApproved(value)
              setStepError(null)
            }}
            onBypassHodApprovalChange={
              isLegalSendForSigningMode
                ? (value) => {
                    setBypassHodApproval(value)
                    if (!value) {
                      setBypassReason('')
                    }
                    setStepError(null)
                  }
                : undefined
            }
            onBypassReasonChange={
              isLegalSendForSigningMode
                ? (value) => {
                    setBypassReason(value)
                    setStepError(null)
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
              setStepError(null)
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
        </>
      )
    }

    if (activeStep === 2) {
      return (
        <ReviewStep
          mainFileName={mainFile?.name || null}
          contractType={selectedContractTypeName}
          counterparties={counterpartyEntries
            .map((entry) => ({
              counterpartyName: entry.counterpartyName.trim(),
              supportingCount: entry.supportingFiles.length,
            }))
            .filter((entry) => entry.counterpartyName.length > 0)}
          departmentName={selectedDepartmentName}
          signatoryName={signatoryName}
          signatoryDesignation={signatoryDesignation}
          signatoryEmail={signatoryEmail}
          backgroundOfRequest={backgroundOfRequest}
          budgetApproved={budgetApproved}
          bypassHodApproval={isLegalSendForSigningMode ? bypassHodApproval : false}
          bypassReason={isLegalSendForSigningMode ? bypassReason.trim() : undefined}
          organizationEntity={ORGANIZATION_ENTITY}
        />
      )
    }

    return <UploadStep isSubmitting={isSubmitting} errorMessage={uploadError} successMessage={uploadSuccess} />
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
      {stepContent()}
    </WorkflowSidebar>
  )
}
