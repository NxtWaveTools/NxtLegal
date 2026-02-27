'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { toast } from 'sonner'
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

type PreflightCheck = {
  key: string
  label: string
  isReady: boolean
  detail: string
}

const fieldPalette: FieldType[] = ['SIGNATURE', 'INITIAL', 'STAMP', 'NAME', 'DATE', 'TIME', 'TEXT']

const createDraftId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const fieldDimensionsByType: Record<FieldType, { width: number; height: number }> = {
  SIGNATURE: { width: 30, height: 10 },
  INITIAL: { width: 15, height: 8 },
  STAMP: { width: 20, height: 10 },
  NAME: { width: 25, height: 4 },
  DATE: { width: 18, height: 4 },
  TIME: { width: 15, height: 4 },
  TEXT: { width: 30, height: 4 },
}

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
  const [numPages, setNumPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('SIGNATURE')
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState('')
  const [recipients, setRecipients] = useState<DraftRecipient[]>([])
  const [fields, setFields] = useState<DraftField[]>([])
  const [pageMetricsByNumber, setPageMetricsByNumber] = useState<Record<number, { width: number; height: number }>>({})
  const [pageRenderBoxByNumber, setPageRenderBoxByNumber] = useState<
    Record<number, { widthPx: number; heightPx: number }>
  >({})

  const pageSurfaceRef = useRef<HTMLDivElement | null>(null)
  const pageRenderRef = useRef<HTMLDivElement | null>(null)

  const isLocked = contractStatus === contractStatuses.pendingExternal
  const canEdit = !isLocked && !isSending

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const loadDraft = async () => {
      setIsLoadingDraft(true)

      try {
        const response = await contractsClient.getSigningPreparationDraft(contractId)

        if (!response.ok) {
          toast.error(response.error?.message ?? 'Failed to load signing draft')
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
        toast.error(errorMessage)
      } finally {
        setIsLoadingDraft(false)
      }
    }

    void loadDraft()
  }, [contractId, isOpen])

  const activeRecipientEmail = selectedRecipientEmail || recipients[0]?.email || ''

  const preflightChecks = useMemo<PreflightCheck[]>(() => {
    const normalizedRecipients = recipients
      .map((recipient) => ({
        ...recipient,
        email: recipient.email.trim().toLowerCase(),
        name: recipient.name.trim(),
      }))
      .filter((recipient) => recipient.email)

    const uniqueRoutingOrders = new Set(normalizedRecipients.map((recipient) => recipient.routingOrder))
    const hasValidRoutingOrder =
      normalizedRecipients.length > 0 &&
      uniqueRoutingOrders.size === normalizedRecipients.length &&
      normalizedRecipients.every((recipient) => recipient.routingOrder >= 1)

    const missingSignatureEmails = normalizedRecipients
      .filter(
        (recipient) =>
          !fields.some(
            (field) =>
              field.fieldType === 'SIGNATURE' && field.assignedSignerEmail.trim().toLowerCase() === recipient.email
          )
      )
      .map((recipient) => recipient.email)

    const invalidFields = fields.filter((field) => {
      const hasAnchor = Boolean(field.anchorString?.trim())
      const hasCoordinates =
        typeof field.pageNumber === 'number' &&
        typeof field.xPosition === 'number' &&
        typeof field.yPosition === 'number'

      return !hasAnchor && !hasCoordinates
    })

    return [
      {
        key: 'document',
        label: 'Primary document available',
        isReady: Boolean(pdfUrl),
        detail: pdfUrl ? 'Ready' : 'No preview document available',
      },
      {
        key: 'recipients',
        label: 'Recipients added',
        isReady: normalizedRecipients.length > 0,
        detail:
          normalizedRecipients.length > 0
            ? `${normalizedRecipients.length} recipient(s)`
            : 'Add at least one recipient',
      },
      {
        key: 'signature_fields',
        label: 'SIGNATURE fields assigned',
        isReady: missingSignatureEmails.length === 0,
        detail:
          missingSignatureEmails.length === 0
            ? 'All recipients have a SIGNATURE field'
            : `Missing for: ${missingSignatureEmails.join(', ')}`,
      },
      {
        key: 'routing_order',
        label: 'Routing order valid',
        isReady: hasValidRoutingOrder,
        detail: hasValidRoutingOrder
          ? 'Unique routing order per recipient'
          : 'Each recipient needs a unique routing order',
      },
      {
        key: 'field_positions',
        label: 'Field placement complete',
        isReady: invalidFields.length === 0,
        detail:
          invalidFields.length === 0
            ? 'All fields have anchor or coordinates'
            : `${invalidFields.length} field(s) missing anchor/page/x/y`,
      },
    ]
  }, [fields, pdfUrl, recipients])

  const blockingPreflightChecks = preflightChecks.filter((check) => !check.isReady)

  const getPageMetrics = (pageNumber: number) => pageMetricsByNumber[pageNumber]
  const getPageRenderBox = (pageNumber: number) => pageRenderBoxByNumber[pageNumber]

  const measureRenderBox = (pageNumber: number) => {
    const el = pageRenderRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPageRenderBoxByNumber((current) => ({
      ...current,
      [pageNumber]: { widthPx: rect.width, heightPx: rect.height },
    }))
  }

  const normalizeFieldToPoints = (field: DraftField): DraftField => {
    const pageNumber = field.pageNumber ?? 1
    const metrics = getPageMetrics(pageNumber)
    if (!metrics || typeof field.xPosition !== 'number' || typeof field.yPosition !== 'number') {
      return field
    }

    // If the value looks like a percentage (<= 100), convert it to PDF-space points using page metrics.
    const isPercent = field.xPosition <= 100 && field.yPosition <= 100
    if (!isPercent) {
      return field
    }

    const x = (field.xPosition / 100) * metrics.width
    const y = (field.yPosition / 100) * metrics.height

    return {
      ...field,
      xPosition: Number(x.toFixed(2)),
      yPosition: Number(y.toFixed(2)),
    }
  }

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

    const pageSurface = pageSurfaceRef.current
    if (!pageSurface) {
      return
    }

    const renderBox = getPageRenderBox(currentPage)
    const metrics = getPageMetrics(currentPage)
    const rect = pageRenderRef.current?.getBoundingClientRect()

    if (!renderBox || !metrics || !rect) {
      return
    }

    const clickX = event.clientX - rect.left
    const clickY = event.clientY - rect.top
    const xInPdfSpace = (Math.max(0, Math.min(renderBox.widthPx, clickX)) / renderBox.widthPx) * metrics.width
    const yInPdfSpace = (Math.max(0, Math.min(renderBox.heightPx, clickY)) / renderBox.heightPx) * metrics.height

    setFields((current) => [
      ...current,
      {
        id: createDraftId(),
        fieldType: selectedFieldType,
        pageNumber: currentPage,
        xPosition: Number(xInPdfSpace.toFixed(2)),
        yPosition: Number(yInPdfSpace.toFixed(2)),
        assignedSignerEmail: activeRecipientEmail.trim().toLowerCase(),
      },
    ])
  }

  const resolveFieldChipStyle = (field: DraftField): { left: string; top: string; width: string; height: string } => {
    const pageNumber = field.pageNumber ?? 1
    const metrics = getPageMetrics(pageNumber)
    const x = field.xPosition ?? 0
    const y = field.yPosition ?? 0
    const dimensions = fieldDimensionsByType[field.fieldType]

    if (!metrics) {
      return {
        left: `${Math.max(0, Math.min(100, x))}%`,
        top: `${Math.max(0, Math.min(100, y))}%`,
        width: `${dimensions.width}%`,
        height: `${dimensions.height}%`,
      }
    }

    const left = (x / metrics.width) * 100
    const top = (y / metrics.height) * 100

    return {
      left: `${Math.max(0, Math.min(100, left))}%`,
      top: `${Math.max(0, Math.min(100, top))}%`,
      width: `${dimensions.width}%`,
      height: `${dimensions.height}%`,
    }
  }

  const handleSaveDraft = async () => {
    if (!canEdit || isSavingDraft) {
      return
    }

    const validationError = validateDraft()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSavingDraft(true)

    const normalizedFields = fields.map(normalizeFieldToPoints)

    const draftPayload = {
      recipients: recipients.map((recipient) => ({
        name: recipient.name.trim(),
        email: recipient.email.trim().toLowerCase(),
        recipient_type: recipient.recipientType,
        routing_order: recipient.routingOrder,
      })),
      fields: normalizedFields.map((field) => ({
        field_type: field.fieldType,
        page_number: field.pageNumber,
        x_position: field.xPosition,
        y_position: field.yPosition,
        anchor_string: field.anchorString,
        assigned_signer_email: field.assignedSignerEmail.trim().toLowerCase(),
      })),
    }

    try {
      const response = await contractsClient.saveSigningPreparationDraft(contractId, draftPayload)

      if (!response.ok) {
        toast.error(response.error?.message ?? 'Failed to save draft')
        return
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleReviewSend = async () => {
    if (!canEdit || isSending) {
      return
    }

    const validationError = validateSend()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSending(true)

    const normalizedFields = fields.map(normalizeFieldToPoints)

    const draftPayload = {
      recipients: recipients.map((recipient) => ({
        name: recipient.name.trim(),
        email: recipient.email.trim().toLowerCase(),
        recipient_type: recipient.recipientType,
        routing_order: recipient.routingOrder,
      })),
      fields: normalizedFields.map((field) => ({
        field_type: field.fieldType,
        page_number: field.pageNumber,
        x_position: field.xPosition,
        y_position: field.yPosition,
        anchor_string: field.anchorString,
        assigned_signer_email: field.assignedSignerEmail.trim().toLowerCase(),
      })),
    }

    try {
      const draftSaveResponse = await contractsClient.saveSigningPreparationDraft(contractId, draftPayload)
      if (!draftSaveResponse.ok) {
        toast.error(draftSaveResponse.error?.message ?? 'Failed to save draft before sending')
        return
      }

      const response = await contractsClient.sendSigningPreparationDraft(contractId)

      if (!response.ok || !response.data) {
        toast.error(response.error?.message ?? 'Failed to send for signing')
        return
      }

      onSent(response.data.contractView)
      onClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(errorMessage)
    } finally {
      setIsSending(false)
    }
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

            <div className={styles.pageContainer}>
              {isLoadingDraft ? (
                <div className={styles.placeholder}>Loading draft…</div>
              ) : (
                <div ref={pageSurfaceRef} className={styles.pageSurface} onClick={handlePageClick}>
                  <Document
                    file={pdfUrl}
                    loading={<div className={styles.placeholder}>Loading PDF…</div>}
                    error={<div className={styles.placeholder}>Unable to preview PDF</div>}
                    onLoadSuccess={(result) => {
                      setNumPages(result.numPages)
                      setCurrentPage((page) => Math.min(page, result.numPages))
                    }}
                  >
                    <div ref={pageRenderRef} className={styles.pageRender}>
                      <Page
                        pageNumber={currentPage}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        width={720}
                        onLoadSuccess={(page) => {
                          const viewport = page.getViewport({ scale: 1 })
                          setPageMetricsByNumber((current) => ({
                            ...current,
                            [currentPage]: {
                              width: viewport.width,
                              height: viewport.height,
                            },
                          }))

                          requestAnimationFrame(() => measureRenderBox(currentPage))
                        }}
                      />
                    </div>
                  </Document>

                  {fieldsForCurrentPage.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      className={styles.fieldChip}
                      style={resolveFieldChipStyle(field)}
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
              )}
            </div>
          </main>
        </div>

        {step === 3 ? (
          <div className={styles.reviewBoxWrap}>
            <div className={styles.reviewBox}>
              <div>Recipients: {recipients.length}</div>
              <div>Placed Fields: {fields.length}</div>
            </div>
            <div className={styles.preflightBox}>
              <div className={styles.preflightTitle}>Execution Readiness</div>
              {preflightChecks.map((check) => (
                <div key={check.key} className={styles.preflightRow}>
                  <span className={check.isReady ? styles.preflightReady : styles.preflightBlocked}>
                    {check.isReady ? '✓' : '✕'}
                  </span>
                  <span className={styles.preflightLabel}>{check.label}</span>
                  <span className={styles.preflightDetail}>{check.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
            disabled={!canEdit || isSending || blockingPreflightChecks.length > 0}
          >
            {isSending ? 'Sending…' : 'Review & Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
