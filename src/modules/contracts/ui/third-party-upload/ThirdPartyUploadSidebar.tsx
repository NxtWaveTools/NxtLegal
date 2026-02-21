'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { contractsClient, type ContractTypeOption, type DepartmentOption } from '@/core/client/contracts-client'
import WorkflowSidebar from './WorkflowSidebar'
import ChooseFilesStep from './steps/ChooseFilesStep'
import AdditionalDataStep from './steps/AdditionalDataStep'
import ReviewStep from './steps/ReviewStep'
import UploadStep from './steps/UploadStep'
import styles from './third-party-upload.module.css'

type ThirdPartyUploadSidebarProps = {
  isOpen: boolean
  onClose: () => void
  onUploaded?: () => Promise<void> | void
}

const COUNTERPARTIES = ['NA', 'Acme Corp', 'Orion Systems', 'Northwind Traders']
const ORGANIZATION_ENTITY = 'NxtWave Disruptive Technologies Pvt Ltd'

export default function ThirdPartyUploadSidebar({ isOpen, onClose, onUploaded }: ThirdPartyUploadSidebarProps) {
  const router = useRouter()
  const steps = useMemo(() => ['Choose Files', 'Additional Data', 'Review', 'Upload'], [])
  const [activeStep, setActiveStep] = useState(0)
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [mainFileError, setMainFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [contractType, setContractType] = useState('')
  const [counterparty, setCounterparty] = useState('')
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
  const [supportingFiles, setSupportingFiles] = useState<File[]>([])
  const [stepError, setStepError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState<string | null>(null)

  const requiresSupportingDocs = counterparty.trim() !== '' && counterparty.trim().toUpperCase() !== 'NA'
  const showCounterpartyModal = counterparty.trim() !== '' && !COUNTERPARTIES.includes(counterparty.trim())
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
    setMainFileError(null)
    setContractType('')
    setCounterparty('')
    setSignatoryName('')
    setSignatoryDesignation('')
    setSignatoryEmail('')
    setBackgroundOfRequest('')
    setDepartmentId('')
    setBudgetApproved(false)
    setSupportingFiles([])
    setStepError(null)
    setUploadError(null)
    setUploadSuccess(null)
    setIsSubmitting(false)
    setUploadIdempotencyKey(null)
  }

  const handleMainFile = (file: File) => {
    const isDocx = file.name.toLowerCase().endsWith('.docx')
    if (!isDocx) {
      setMainFile(null)
      setMainFileError('Only Word (.docx) files allowed.')
      return
    }

    setMainFile(file)
    setMainFileError(null)
  }

  const handleNext = () => {
    if (activeStep === 0) {
      if (!mainFile) {
        setMainFileError('Please upload a .docx contract to continue.')
        return
      }
    }

    if (activeStep === 1) {
      if (
        !contractType ||
        !counterparty ||
        !signatoryName.trim() ||
        !signatoryDesignation.trim() ||
        !signatoryEmail.trim() ||
        !backgroundOfRequest.trim() ||
        !departmentId
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

      if (requiresSupportingDocs && supportingFiles.length === 0) {
        setStepError('Supporting documents are required for this counterparty.')
        return
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

    const generatedTitle = `${selectedContractTypeName || 'Contract'} - ${counterparty || 'Counterparty'}`

    setUploadError(null)
    setUploadSuccess(null)
    setIsSubmitting(true)

    const idempotencyKey = uploadIdempotencyKey ?? crypto.randomUUID()
    if (!uploadIdempotencyKey) {
      setUploadIdempotencyKey(idempotencyKey)
    }

    const response = await contractsClient.upload({
      title: generatedTitle,
      contractTypeId: contractType,
      signatoryName: signatoryName.trim(),
      signatoryDesignation: signatoryDesignation.trim(),
      signatoryEmail: signatoryEmail.trim().toLowerCase(),
      backgroundOfRequest: backgroundOfRequest.trim(),
      departmentId,
      budgetApproved,
      file: mainFile,
      idempotencyKey,
    })

    if (!response.ok || !response.data?.contract) {
      setIsSubmitting(false)
      setUploadError(response.error?.message ?? 'Failed to upload contract')
      return
    }

    setIsSubmitting(false)
    setUploadSuccess(`Uploaded ${response.data.contract.title} successfully.`)
    setUploadIdempotencyKey(null)

    if (onUploaded) {
      await onUploaded()
    }

    onClose()
    resetAll()
    router.push('/dashboard')
    router.refresh()
  }

  const stepContent = () => {
    if (activeStep === 0) {
      return (
        <ChooseFilesStep
          mainFile={mainFile}
          errorMessage={mainFileError}
          isDragging={isDragging}
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
            counterparty={counterparty}
            counterparties={COUNTERPARTIES}
            showCounterpartyModal={showCounterpartyModal}
            onContractTypeChange={(value) => {
              setContractType(value)
              setStepError(null)
            }}
            onCounterpartyChange={(value) => {
              setCounterparty(value)
              setStepError(null)
            }}
            signatoryName={signatoryName}
            signatoryDesignation={signatoryDesignation}
            signatoryEmail={signatoryEmail}
            backgroundOfRequest={backgroundOfRequest}
            departmentId={departmentId}
            departments={departments}
            budgetApproved={budgetApproved}
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
            supportingFiles={supportingFiles}
            onSupportingFilesSelected={(files) => {
              setSupportingFiles((current) => [...current, ...files])
              setStepError(null)
            }}
            onSupportingFileRemoved={(index) =>
              setSupportingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
            }
            showSupportingUpload={requiresSupportingDocs}
          />
        </>
      )
    }

    if (activeStep === 2) {
      return (
        <ReviewStep
          mainFileName={mainFile?.name || null}
          contractType={selectedContractTypeName}
          counterparty={counterparty}
          departmentName={selectedDepartmentName}
          signatoryName={signatoryName}
          signatoryDesignation={signatoryDesignation}
          signatoryEmail={signatoryEmail}
          backgroundOfRequest={backgroundOfRequest}
          budgetApproved={budgetApproved}
          supportingCount={supportingFiles.length}
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
      title="Upload third party contract"
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
