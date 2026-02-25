'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { contractsClient, type ContractDetailResponse } from '@/core/client/contracts-client'
import { contractStatuses } from '@/core/constants/contracts'
import styles from './prepare-for-signing-modal.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type RecipientType = 'INTERNAL' | 'EXTERNAL'
type FieldType = 'SIGNATURE' | 'INITIAL' | 'STAMP' | 'NAME' | 'DATE' | 'TIME' | 'TEXT'

type DraftRecipient = {
  id: string
  name: string
  email: string
  recipientType: RecipientType
  routingOrder: number
}

type DraftField = {
  id: string
  fieldType: FieldType
  pageNumber?: number
  xPosition?: number
  yPosition?: number
  anchorString?: string
  assignedSignerEmail: string
}

type PrepareForSigningModalProps = {
  isOpen: boolean
  contractId: string
  contractStatus: string
  pdfUrl: string
  onClose: () => void
  onSent: (contractView: ContractDetailResponse) => void
}

const fieldPalette: FieldType[] = ['SIGNATURE', 'INITIAL', 'STAMP', 'NAME', 'DATE', 'TIME', 'TEXT']

const createDraftId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export default function PrepareForSigningModal({
  isOpen,
  contractId,
  contractStatus,
  pdfUrl,
  onClose,
  onSent,
}: PrepareForSigningModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('SIGNATURE')
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState('')
  const [recipients, setRecipients] = useState<DraftRecipient[]>([])
  const [fields, setFields] = useState<DraftField[]>([])

  const pageContainerRef = useRef<HTMLDivElement | null>(null)

  const isLocked = contractStatus === contractStatuses.inSignature
  const canEdit = !isLocked && !isSending

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const loadDraft = async () => {
      setIsLoadingDraft(true)
      setError(null)
      const response = await contractsClient.getSigningPreparationDraft(contractId)
      setIsLoadingDraft(false)

      if (!response.ok) {
        setError(response.error?.message ?? 'Failed to load signing draft')
        return
      }

      const data = response.data
      if (!data) {
        setRecipients([])
        setFields([])
        setSelectedRecipientEmail('')
        return
      }

      const mappedRecipients: DraftRecipient[] = data.recipients.map((recipient) => ({
        id: createDraftId(),
        name: recipient.name,
        email: recipient.email,
        recipientType: recipient.recipientType,
        routingOrder: recipient.routingOrder,
      }))

      const mappedFields: DraftField[] = data.fields.map((field) => ({
        id: createDraftId(),
        fieldType: field.fieldType,
        pageNumber: field.pageNumber ?? undefined,
        xPosition: field.xPosition ?? undefined,
        yPosition: field.yPosition ?? undefined,
        anchorString: field.anchorString ?? undefined,
        assignedSignerEmail: field.assignedSignerEmail,
      }))

      setRecipients(mappedRecipients)
      setFields(mappedFields)
      setSelectedRecipientEmail(mappedRecipients[0]?.email ?? '')
    }

    void loadDraft()
  }, [contractId, isOpen])

  const activeRecipientEmail = selectedRecipientEmail || recipients[0]?.email || ''

  const fieldsForCurrentPage = useMemo(
    () => fields.filter((field) => (field.pageNumber ?? 1) === currentPage),
    [currentPage, fields]
  )

  const validateDraft = () => {
    if (recipients.length === 0) {
      return 'At least one recipient is required'
    }

    for (const recipient of recipients) {
      if (!recipient.name.trim() || !recipient.email.trim() || recipient.routingOrder < 1) {
        return 'Each recipient needs name, email, type, and routing order'
      }
    }

    return null
  }

  const validateSend = () => {
    const draftError = validateDraft()
    if (draftError) {
      return draftError
    }

    for (const recipient of recipients) {
      const hasSignature = fields.some(
        (field) =>
          field.assignedSignerEmail.trim().toLowerCase() === recipient.email.trim().toLowerCase() &&
          field.fieldType === 'SIGNATURE'
      )

      if (!hasSignature) {
        return `At least one SIGNATURE field is required for ${recipient.email}`
      }
    }

    for (const field of fields) {
      const hasAnchor = Boolean(field.anchorString?.trim())
      const hasCoordinates =
        typeof field.pageNumber === 'number' &&
        typeof field.xPosition === 'number' &&
        typeof field.yPosition === 'number'

      if (!hasAnchor && !hasCoordinates) {
        return 'Each field must include anchor_string OR page/x/y coordinates'
      }
    }

    return null
  }

  const handleAddRecipient = () => {
    setRecipients((current) => [
      ...current,
      {
        id: createDraftId(),
        name: '',
        email: '',
        recipientType: 'EXTERNAL',
        routingOrder: 1,
      },
    ])
  }

  const handleRecipientChange = (recipientId: string, patch: Partial<DraftRecipient>) => {
    setRecipients((current) =>
      current.map((recipient) => (recipient.id === recipientId ? { ...recipient, ...patch } : recipient))
    )
  }

  const handleRemoveRecipient = (recipientId: string) => {
    const target = recipients.find((recipient) => recipient.id === recipientId)
    setRecipients((current) => current.filter((recipient) => recipient.id !== recipientId))

    if (target?.email) {
      setFields((current) =>
        current.filter((field) => field.assignedSignerEmail.trim().toLowerCase() !== target.email.trim().toLowerCase())
      )
    }
  }

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || !activeRecipientEmail || step < 2) {
      return
    }

    const container = pageContainerRef.current
    if (!container) {
      return
    }

    const rect = container.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100

    setFields((current) => [
      ...current,
      {
        id: createDraftId(),
        fieldType: selectedFieldType,
        pageNumber: currentPage,
        xPosition: Number(x.toFixed(2)),
        yPosition: Number(y.toFixed(2)),
        assignedSignerEmail: activeRecipientEmail.trim().toLowerCase(),
      },
    ])
  }

  const handleSaveDraft = async () => {
    if (!canEdit || isSavingDraft) {
      return
    }

    const validationError = validateDraft()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSavingDraft(true)
    setError(null)

    const draftPayload = {
      recipients: recipients.map((recipient) => ({
        name: recipient.name.trim(),
        email: recipient.email.trim().toLowerCase(),
        recipient_type: recipient.recipientType,
        routing_order: recipient.routingOrder,
      })),
      fields: fields.map((field) => ({
        field_type: field.fieldType,
        page_number: field.pageNumber,
        x_position: field.xPosition,
        y_position: field.yPosition,
        anchor_string: field.anchorString,
        assigned_signer_email: field.assignedSignerEmail.trim().toLowerCase(),
      })),
    }

    const response = await contractsClient.saveSigningPreparationDraft(contractId, draftPayload)

    setIsSavingDraft(false)

    if (!response.ok) {
      setError(response.error?.message ?? 'Failed to save draft')
      return
    }
  }

  const handleReviewSend = async () => {
    if (!canEdit || isSending) {
      return
    }

    const validationError = validateSend()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSending(true)
    setError(null)

    const draftPayload = {
      recipients: recipients.map((recipient) => ({
        name: recipient.name.trim(),
        email: recipient.email.trim().toLowerCase(),
        recipient_type: recipient.recipientType,
        routing_order: recipient.routingOrder,
      })),
      fields: fields.map((field) => ({
        field_type: field.fieldType,
        page_number: field.pageNumber,
        x_position: field.xPosition,
        y_position: field.yPosition,
        anchor_string: field.anchorString,
        assigned_signer_email: field.assignedSignerEmail.trim().toLowerCase(),
      })),
    }

    const draftSaveResponse = await contractsClient.saveSigningPreparationDraft(contractId, draftPayload)
    if (!draftSaveResponse.ok) {
      setIsSending(false)
      setError(draftSaveResponse.error?.message ?? 'Failed to save draft before sending')
      return
    }

    const response = await contractsClient.sendSigningPreparationDraft(contractId)

    if (!response.ok || !response.data) {
      setIsSending(false)
      setError(response.error?.message ?? 'Failed to send for signing')
      return
    }

    onSent(response.data.contractView)
    setIsSending(false)
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Prepare for signing">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Prepare For Signing</div>
            <div className={styles.stepper}>Step {step} of 3</div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.steps}>
          <button type="button" className={step === 1 ? styles.stepActive : styles.step} onClick={() => setStep(1)}>
            1. Add Recipients
          </button>
          <button type="button" className={step === 2 ? styles.stepActive : styles.step} onClick={() => setStep(2)}>
            2. Assign Fields
          </button>
          <button type="button" className={step === 3 ? styles.stepActive : styles.step} onClick={() => setStep(3)}>
            3. Review & Send
          </button>
        </div>

        <div className={styles.body}>
          <aside className={styles.leftPanel}>
            <div className={styles.panelTitle}>Recipients</div>
            <button type="button" className={styles.smallButton} onClick={handleAddRecipient} disabled={!canEdit}>
              + Add Recipient
            </button>

            <div className={styles.recipientList}>
              {recipients.map((recipient) => (
                <div key={recipient.id} className={styles.recipientCard}>
                  <input
                    className={styles.input}
                    placeholder="Name"
                    value={recipient.name}
                    disabled={!canEdit}
                    onChange={(event) => handleRecipientChange(recipient.id, { name: event.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Email"
                    value={recipient.email}
                    disabled={!canEdit}
                    onChange={(event) => handleRecipientChange(recipient.id, { email: event.target.value })}
                  />
                  <div className={styles.row}>
                    <select
                      className={styles.input}
                      value={recipient.recipientType}
                      disabled={!canEdit}
                      onChange={(event) =>
                        handleRecipientChange(recipient.id, { recipientType: event.target.value as RecipientType })
                      }
                    >
                      <option value="INTERNAL">INTERNAL</option>
                      <option value="EXTERNAL">EXTERNAL</option>
                    </select>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={recipient.routingOrder}
                      disabled={!canEdit}
                      onChange={(event) =>
                        handleRecipientChange(recipient.id, {
                          routingOrder: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => handleRemoveRecipient(recipient.id)}
                    disabled={!canEdit}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <main className={styles.previewArea}>
            <div className={styles.palette}>
              {fieldPalette.map((fieldType) => (
                <button
                  key={fieldType}
                  type="button"
                  className={selectedFieldType === fieldType ? styles.paletteItemActive : styles.paletteItem}
                  onClick={() => setSelectedFieldType(fieldType)}
                  disabled={!canEdit}
                >
                  {fieldType}
                </button>
              ))}
              <select
                className={styles.input}
                value={activeRecipientEmail}
                onChange={(event) => setSelectedRecipientEmail(event.target.value)}
                disabled={!canEdit}
              >
                <option value="">Assign to recipient</option>
                {recipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.email.trim().toLowerCase()}>
                    {recipient.name || recipient.email || 'Unnamed'}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.pageTools}>
              <button
                type="button"
                className={styles.smallButton}
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Prev
              </button>
              <span>
                Page {currentPage} / {numPages}
              </span>
              <button
                type="button"
                className={styles.smallButton}
                disabled={currentPage >= numPages}
                onClick={() => setCurrentPage((page) => Math.min(numPages, page + 1))}
              >
                Next
              </button>
            </div>

            <div ref={pageContainerRef} className={styles.pageContainer} onClick={handlePageClick}>
              {isLoadingDraft ? (
                <div className={styles.placeholder}>Loading draft…</div>
              ) : (
                <Document
                  file={pdfUrl}
                  loading={<div className={styles.placeholder}>Loading PDF…</div>}
                  error={<div className={styles.placeholder}>Unable to preview PDF</div>}
                  onLoadSuccess={(result) => {
                    setNumPages(result.numPages)
                    setCurrentPage((page) => Math.min(page, result.numPages))
                  }}
                >
                  <Page pageNumber={currentPage} renderTextLayer={false} renderAnnotationLayer={false} width={720} />
                </Document>
              )}

              {fieldsForCurrentPage.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  className={styles.fieldChip}
                  style={{
                    left: `${field.xPosition ?? 0}%`,
                    top: `${field.yPosition ?? 0}%`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!canEdit) {
                      return
                    }
                    setFields((current) => current.filter((item) => item.id !== field.id))
                  }}
                  title={`${field.fieldType} → ${field.assignedSignerEmail}`}
                >
                  {field.fieldType}
                </button>
              ))}
            </div>
          </main>
        </div>

        {step === 3 ? (
          <div className={styles.reviewBox}>
            <div>Recipients: {recipients.length}</div>
            <div>Placed Fields: {fields.length}</div>
          </div>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.footer}>
          <button type="button" className={styles.smallButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => void handleSaveDraft()}
            disabled={!canEdit || isSavingDraft}
          >
            {isSavingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleReviewSend()}
            disabled={!canEdit || isSending}
          >
            {isSending ? 'Sending…' : 'Review & Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
