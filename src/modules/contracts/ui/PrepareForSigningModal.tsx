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
  designation?: string
  counterpartyName?: string
  backgroundOfRequest?: string
  budgetApproved?: boolean
}

type DraftField = {
  id: string
  fieldType: FieldType
  pageNumber?: number
  xPosition?: number
  yPosition?: number
  width?: number
  height?: number
  mirrorGroupId?: string
  anchorString?: string
  assignedSignerEmail: string
}

type ResizeSession = {
  fieldId: string
  mirrorGroupId?: string
  fieldType: FieldType
  pageNumber: number
  startClientX: number
  startClientY: number
  startWidth: number
  startHeight: number
  xPosition: number
  yPosition: number
}

type PrepareForSigningModalProps = {
  isOpen: boolean
  contractId: string
  contractStatus: string
  pdfUrl: string
  initialRecipients?: Array<{
    name: string
    email: string
    recipientType?: RecipientType
    routingOrder?: number
  }>
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
const sendingStatuses = [
  'Sending signature request emails...',
  'Almost there...',
  'Just a minute...',
  'Preparing the signing package...',
]

const createDraftId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const defaultFieldSizeByType: Record<FieldType, { width: number; height: number }> = {
  SIGNATURE: { width: 96, height: 22 },
  INITIAL: { width: 40, height: 15 },
  STAMP: { width: 96, height: 36 },
  NAME: { width: 110, height: 22 },
  DATE: { width: 110, height: 22 },
  TIME: { width: 96, height: 22 },
  TEXT: { width: 200, height: 22 },
}
const imageFieldTypes: FieldType[] = ['SIGNATURE', 'INITIAL', 'STAMP']
const isImageFieldType = (fieldType: FieldType) => imageFieldTypes.includes(fieldType)

function mergeRecipientsWithDefaults(
  recipients: DraftRecipient[],
  defaultRecipients: DraftRecipient[]
): DraftRecipient[] {
  const byEmail = new Map<string, DraftRecipient>()

  for (const recipient of recipients) {
    const normalizedEmail = recipient.email.trim().toLowerCase()
    if (!normalizedEmail) {
      continue
    }

    byEmail.set(normalizedEmail, {
      ...recipient,
      email: normalizedEmail,
    })
  }

  for (const defaultRecipient of defaultRecipients) {
    const normalizedEmail = defaultRecipient.email.trim().toLowerCase()
    if (!normalizedEmail) {
      continue
    }

    const existingRecipient = byEmail.get(normalizedEmail)
    if (!existingRecipient) {
      byEmail.set(normalizedEmail, defaultRecipient)
      continue
    }

    // Keep saved row identity/position, but enforce default directory values.
    byEmail.set(normalizedEmail, {
      ...existingRecipient,
      name: defaultRecipient.name,
      recipientType: defaultRecipient.recipientType,
      routingOrder: defaultRecipient.routingOrder,
    })
  }

  return Array.from(byEmail.values())
}

export default function PrepareForSigningModal({
  isOpen,
  contractId,
  contractStatus,
  pdfUrl,
  initialRecipients = [],
  onClose,
  onSent,
}: PrepareForSigningModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendingStatusIndex, setSendingStatusIndex] = useState(0)
  const [numPages, setNumPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('SIGNATURE')
  const [selectedRecipientId, setSelectedRecipientId] = useState('')
  const [applySignatureToAllPages, setApplySignatureToAllPages] = useState(false)
  const [recipients, setRecipients] = useState<DraftRecipient[]>([])
  const [fields, setFields] = useState<DraftField[]>([])
  const [pageMetricsByNumber, setPageMetricsByNumber] = useState<Record<number, { width: number; height: number }>>({})
  const [pageRenderBoxByNumber, setPageRenderBoxByNumber] = useState<
    Record<number, { widthPx: number; heightPx: number }>
  >({})

  const pageSurfaceRef = useRef<HTMLDivElement | null>(null)
  const pageRenderRef = useRef<HTMLDivElement | null>(null)
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const suppressDeleteForFieldRef = useRef<string | null>(null)
  const suppressPlacementUntilMsRef = useRef(0)
  const [activeResizeFieldId, setActiveResizeFieldId] = useState<string | null>(null)

  const isLocked = contractStatus === contractStatuses.pendingExternal
  const canEdit = !isLocked && !isSending
  const normalizedInitialRecipients = useMemo(() => {
    const byEmail = new Map<string, DraftRecipient>()

    for (const recipient of initialRecipients) {
      const normalizedEmail = recipient.email.trim().toLowerCase()
      if (!normalizedEmail) {
        continue
      }

      if (byEmail.has(normalizedEmail)) {
        continue
      }

      byEmail.set(normalizedEmail, {
        id: createDraftId(),
        name: recipient.name.trim(),
        email: normalizedEmail,
        recipientType: recipient.recipientType ?? 'EXTERNAL',
        routingOrder: recipient.routingOrder && recipient.routingOrder > 0 ? recipient.routingOrder : 1,
      })
    }

    return Array.from(byEmail.values())
  }, [initialRecipients])

  useEffect(() => {
    if (!isSending) {
      setSendingStatusIndex(0)
      return
    }

    const interval = window.setInterval(() => {
      setSendingStatusIndex((current) => (current + 1) % sendingStatuses.length)
    }, 1800)

    return () => window.clearInterval(interval)
  }, [isSending])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setPageMetricsByNumber({})
    setPageRenderBoxByNumber({})
  }, [isOpen, pdfUrl])

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
          setRecipients(normalizedInitialRecipients)
          setFields([])
          setSelectedRecipientId(normalizedInitialRecipients[0]?.id ?? '')
          return
        }

        const mappedRecipients: DraftRecipient[] = data.recipients.map((recipient) => ({
          id: createDraftId(),
          name: recipient.name,
          email: recipient.email,
          recipientType: recipient.recipientType,
          routingOrder: recipient.routingOrder,
          designation: recipient.designation,
          counterpartyName: recipient.counterpartyName,
          backgroundOfRequest: recipient.backgroundOfRequest,
          budgetApproved: recipient.budgetApproved,
        }))

        const mappedFields: DraftField[] = data.fields.map((field) => ({
          id: createDraftId(),
          fieldType: field.fieldType,
          pageNumber: field.pageNumber ?? undefined,
          xPosition: field.xPosition ?? undefined,
          yPosition: field.yPosition ?? undefined,
          width: field.width ?? undefined,
          height: field.height ?? undefined,
          anchorString: field.anchorString ?? undefined,
          assignedSignerEmail: field.assignedSignerEmail,
        }))

        const mergedRecipients = mergeRecipientsWithDefaults(mappedRecipients, normalizedInitialRecipients)
        setRecipients(mergedRecipients)
        setFields(mappedFields)
        setSelectedRecipientId(mergedRecipients[0]?.id ?? '')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
        toast.error(errorMessage)
      } finally {
        setIsLoadingDraft(false)
      }
    }

    void loadDraft()
  }, [contractId, isOpen, normalizedInitialRecipients])

  const activeRecipient = recipients.find((recipient) => recipient.id === selectedRecipientId) ?? recipients[0] ?? null
  const activeRecipientEmail = activeRecipient?.email ?? ''

  const preflightChecks = useMemo<PreflightCheck[]>(() => {
    const normalizedRecipients = recipients
      .map((recipient) => ({
        ...recipient,
        email: recipient.email.trim().toLowerCase(),
        name: recipient.name.trim(),
      }))
      .filter((recipient) => recipient.email)

    const uniqueRoutingOrders = new Set(normalizedRecipients.map((recipient) => recipient.routingOrder))
    const allRoutingOrdersSame = uniqueRoutingOrders.size === 1
    const allRoutingOrdersUnique = uniqueRoutingOrders.size === normalizedRecipients.length
    const hasValidRoutingOrder =
      normalizedRecipients.length > 0 &&
      (allRoutingOrdersSame || allRoutingOrdersUnique) &&
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
          ? allRoutingOrdersSame
            ? 'All recipients share one routing order (parallel send)'
            : 'Unique routing order per recipient (sequential send)'
          : 'Use either same order for all recipients or unique order for each recipient',
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

  const resolveFieldDimensions = (field: DraftField) => {
    const defaults = defaultFieldSizeByType[field.fieldType]
    const rawWidth = field.width ?? defaults.width
    const rawHeight = field.height ?? defaults.height

    if (!isImageFieldType(field.fieldType)) {
      return {
        width: rawWidth,
        height: rawHeight,
      }
    }

    const widthScale = rawWidth / defaults.width
    const heightScale = rawHeight / defaults.height
    const normalizedScale = Number(Math.max(0.5, Math.min(2.5, (widthScale + heightScale) / 2)).toFixed(3))

    return {
      width: Number((defaults.width * normalizedScale).toFixed(2)),
      height: Number((defaults.height * normalizedScale).toFixed(2)),
    }
  }

  const normalizeFieldToPoints = (field: DraftField): DraftField => {
    const pageNumber = field.pageNumber ?? 1
    const metrics = getPageMetrics(pageNumber)
    const dimensions = resolveFieldDimensions(field)
    const normalizedWidth = Number(Math.max(1, dimensions.width).toFixed(2))
    const normalizedHeight = Number(Math.max(1, dimensions.height).toFixed(2))

    if (typeof field.xPosition !== 'number' || typeof field.yPosition !== 'number') {
      return {
        ...field,
        width: normalizedWidth,
        height: normalizedHeight,
      }
    }

    if (!metrics) {
      return {
        ...field,
        xPosition: Number(Math.max(0, field.xPosition).toFixed(2)),
        yPosition: Number(Math.max(0, field.yPosition).toFixed(2)),
        width: normalizedWidth,
        height: normalizedHeight,
      }
    }

    const maxX = Math.max(0, metrics.width - normalizedWidth)
    const maxY = Math.max(0, metrics.height - normalizedHeight)

    return {
      ...field,
      xPosition: Number(Math.max(0, Math.min(maxX, field.xPosition)).toFixed(2)),
      yPosition: Number(Math.max(0, Math.min(maxY, field.yPosition)).toFixed(2)),
      width: normalizedWidth,
      height: normalizedHeight,
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

    const normalizedRecipients = recipients.map((recipient) => ({
      email: recipient.email.trim().toLowerCase(),
      routingOrder: recipient.routingOrder,
    }))
    const uniqueRoutingOrders = new Set(normalizedRecipients.map((recipient) => recipient.routingOrder))
    const allRoutingOrdersSame = uniqueRoutingOrders.size === 1
    const allRoutingOrdersUnique = uniqueRoutingOrders.size === normalizedRecipients.length

    if (!allRoutingOrdersSame && !allRoutingOrdersUnique) {
      return 'Use either same routing order for all recipients or unique order for each recipient'
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
    if (Date.now() < suppressPlacementUntilMsRef.current) {
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

    const normalizedSignerEmail = activeRecipientEmail.trim().toLowerCase()
    const defaultDimensions = defaultFieldSizeByType[selectedFieldType]
    const xRatio = metrics.width > 0 ? xInPdfSpace / metrics.width : 0
    const yRatio = metrics.height > 0 ? yInPdfSpace / metrics.height : 0

    const placementPages =
      selectedFieldType === 'SIGNATURE' && applySignatureToAllPages
        ? Array.from({ length: numPages }, (_, index) => index + 1)
        : [currentPage]
    const mirrorGroupId = selectedFieldType === 'SIGNATURE' && applySignatureToAllPages ? createDraftId() : undefined

    setFields((current) => {
      if (selectedFieldType === 'SIGNATURE' && applySignatureToAllPages) {
        const hitField = current.find((field) => {
          if (
            field.fieldType !== 'SIGNATURE' ||
            field.assignedSignerEmail.trim().toLowerCase() !== normalizedSignerEmail ||
            (field.pageNumber ?? 1) !== currentPage ||
            typeof field.xPosition !== 'number' ||
            typeof field.yPosition !== 'number'
          ) {
            return false
          }

          const dimensions = resolveFieldDimensions(field)
          return (
            xInPdfSpace >= field.xPosition &&
            xInPdfSpace <= field.xPosition + dimensions.width &&
            yInPdfSpace >= field.yPosition &&
            yInPdfSpace <= field.yPosition + dimensions.height
          )
        })

        if (hitField) {
          if (hitField.mirrorGroupId) {
            return current.filter((field) => field.mirrorGroupId !== hitField.mirrorGroupId)
          }
          return current.filter((field) => field.id !== hitField.id)
        }
      }

      return [
        ...current,
        ...placementPages.map((pageNumber) => ({
          // Keep mirrored placement aligned to each page's dimensions.
          ...((): Pick<DraftField, 'xPosition' | 'yPosition'> => {
            const targetMetrics = getPageMetrics(pageNumber) ?? metrics
            const rawX = xRatio * targetMetrics.width
            const rawY = yRatio * targetMetrics.height
            const clampedX = Number(
              Math.max(0, Math.min(targetMetrics.width - defaultDimensions.width, rawX)).toFixed(2)
            )
            const clampedY = Number(
              Math.max(0, Math.min(targetMetrics.height - defaultDimensions.height, rawY)).toFixed(2)
            )
            return { xPosition: clampedX, yPosition: clampedY }
          })(),
          id: createDraftId(),
          fieldType: selectedFieldType,
          pageNumber,
          width: defaultDimensions.width,
          height: defaultDimensions.height,
          mirrorGroupId,
          assignedSignerEmail: normalizedSignerEmail,
        })),
      ]
    })
  }

  const resolveFieldChipStyle = (field: DraftField): { left: string; top: string; width: string; height: string } => {
    const pageNumber = field.pageNumber ?? 1
    const metrics = getPageMetrics(pageNumber)
    const x = field.xPosition ?? 0
    const y = field.yPosition ?? 0
    const dimensions = resolveFieldDimensions(field)

    if (!metrics) {
      return {
        left: `${Math.max(0, Math.min(100, x))}%`,
        top: `${Math.max(0, Math.min(100, y))}%`,
        width: '12%',
        height: '4%',
      }
    }

    const left = (x / metrics.width) * 100
    const top = (y / metrics.height) * 100
    const width = (dimensions.width / metrics.width) * 100
    const height = (dimensions.height / metrics.height) * 100
    const maxLeft = Math.max(0, 100 - width)
    const maxTop = Math.max(0, 100 - height)

    return {
      left: `${Math.max(0, Math.min(maxLeft, left))}%`,
      top: `${Math.max(0, Math.min(maxTop, top))}%`,
      width: `${Math.max(1, Math.min(100, width))}%`,
      height: `${Math.max(1, Math.min(100, height))}%`,
    }
  }

  useEffect(() => {
    if (!activeResizeFieldId || !canEdit) {
      return
    }

    const onMouseMove = (event: MouseEvent) => {
      const session = resizeSessionRef.current
      if (!session || session.fieldId !== activeResizeFieldId) {
        return
      }

      const metrics = getPageMetrics(session.pageNumber)
      const renderBox = getPageRenderBox(session.pageNumber)
      if (!metrics || !renderBox || renderBox.widthPx <= 0 || renderBox.heightPx <= 0) {
        return
      }

      const scaleX = metrics.width / renderBox.widthPx
      const scaleY = metrics.height / renderBox.heightPx
      const minWidth = 20
      const minHeight = 12

      const deltaWidth = (event.clientX - session.startClientX) * scaleX
      const deltaHeight = (event.clientY - session.startClientY) * scaleY

      setFields((current) =>
        (() => {
          const candidateFields = current.filter(
            (field) =>
              field.id === session.fieldId ||
              (session.mirrorGroupId && field.mirrorGroupId && field.mirrorGroupId === session.mirrorGroupId)
          )

          let groupMaxWidth = Math.max(minWidth, metrics.width - session.xPosition)
          let groupMaxHeight = Math.max(minHeight, metrics.height - session.yPosition)

          for (const candidateField of candidateFields) {
            const candidatePageNumber = candidateField.pageNumber ?? session.pageNumber
            const candidateMetrics = getPageMetrics(candidatePageNumber)
            if (!candidateMetrics) {
              continue
            }
            const candidateX = typeof candidateField.xPosition === 'number' ? candidateField.xPosition : 0
            const candidateY = typeof candidateField.yPosition === 'number' ? candidateField.yPosition : 0
            groupMaxWidth = Math.min(groupMaxWidth, Math.max(minWidth, candidateMetrics.width - candidateX))
            groupMaxHeight = Math.min(groupMaxHeight, Math.max(minHeight, candidateMetrics.height - candidateY))
          }

          const nextDimensions = (() => {
            if (!isImageFieldType(session.fieldType)) {
              return {
                width: Number(Math.max(minWidth, Math.min(groupMaxWidth, session.startWidth + deltaWidth)).toFixed(2)),
                height: Number(
                  Math.max(minHeight, Math.min(groupMaxHeight, session.startHeight + deltaHeight)).toFixed(2)
                ),
              }
            }

            const aspectRatio = session.startHeight / session.startWidth
            const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 22 / 96
            const minWidthForAspect = Math.max(minWidth, minHeight / safeAspectRatio)
            const maxWidthForAspect = Math.max(
              minWidthForAspect,
              Math.min(groupMaxWidth, groupMaxHeight / safeAspectRatio)
            )
            const width = Number(
              Math.max(minWidthForAspect, Math.min(maxWidthForAspect, session.startWidth + deltaWidth)).toFixed(2)
            )
            return {
              width,
              height: Number((width * safeAspectRatio).toFixed(2)),
            }
          })()

          return current.map((field) =>
            field.id === session.fieldId ||
            (session.mirrorGroupId && field.mirrorGroupId && field.mirrorGroupId === session.mirrorGroupId)
              ? { ...field, width: nextDimensions.width, height: nextDimensions.height }
              : field
          )
        })()
      )
    }

    const onMouseUp = () => {
      if (resizeSessionRef.current?.fieldId) {
        // Prevent synthetic click after resize from creating a new field on page surface.
        suppressPlacementUntilMsRef.current = Date.now() + 250
        suppressDeleteForFieldRef.current = resizeSessionRef.current.fieldId
        window.setTimeout(() => {
          if (suppressDeleteForFieldRef.current) {
            suppressDeleteForFieldRef.current = null
          }
        }, 180)
      }
      resizeSessionRef.current = null
      setActiveResizeFieldId(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeResizeFieldId, canEdit, pageMetricsByNumber, pageRenderBoxByNumber])

  const handleResizeStart = (event: React.MouseEvent<HTMLSpanElement>, field: DraftField) => {
    event.stopPropagation()
    event.preventDefault()
    if (!canEdit) {
      return
    }

    const pageNumber = field.pageNumber ?? currentPage
    const metrics = getPageMetrics(pageNumber)
    const renderBox = getPageRenderBox(pageNumber)
    if (!metrics || !renderBox || typeof field.xPosition !== 'number' || typeof field.yPosition !== 'number') {
      return
    }

    const dimensions = resolveFieldDimensions(field)
    resizeSessionRef.current = {
      fieldId: field.id,
      mirrorGroupId: field.mirrorGroupId,
      fieldType: field.fieldType,
      pageNumber,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: dimensions.width,
      startHeight: dimensions.height,
      xPosition: field.xPosition,
      yPosition: field.yPosition,
    }
    setActiveResizeFieldId(field.id)
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
        designation: recipient.designation?.trim() || undefined,
        counterparty_name: recipient.counterpartyName?.trim() || undefined,
        background_of_request: recipient.backgroundOfRequest?.trim() || undefined,
        budget_approved: recipient.budgetApproved,
      })),
      fields: normalizedFields.map((field) => ({
        field_type: field.fieldType,
        page_number: field.pageNumber,
        x_position: field.xPosition,
        y_position: field.yPosition,
        width: field.width,
        height: field.height,
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
        designation: recipient.designation?.trim() || undefined,
        counterparty_name: recipient.counterpartyName?.trim() || undefined,
        background_of_request: recipient.backgroundOfRequest?.trim() || undefined,
        budget_approved: recipient.budgetApproved,
      })),
      fields: normalizedFields.map((field) => ({
        field_type: field.fieldType,
        page_number: field.pageNumber,
        x_position: field.xPosition,
        y_position: field.yPosition,
        width: field.width,
        height: field.height,
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
                value={activeRecipient?.id ?? ''}
                onChange={(event) => setSelectedRecipientId(event.target.value)}
                disabled={!canEdit}
              >
                <option value="">Assign to recipient</option>
                {recipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name || recipient.email || 'Unnamed'}
                  </option>
                ))}
              </select>
              {selectedFieldType === 'SIGNATURE' ? (
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={applySignatureToAllPages}
                    onChange={(event) => setApplySignatureToAllPages(event.target.checked)}
                    disabled={!canEdit}
                  />
                  Add signature on all pages
                </label>
              ) : null}
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

                      const resultWithPages = result as {
                        numPages: number
                        getPage?: (
                          pageNumber: number
                        ) => Promise<{ getViewport: (params: { scale: number }) => { width: number; height: number } }>
                      }
                      const getPage = resultWithPages.getPage

                      if (typeof getPage === 'function') {
                        void (async () => {
                          const nextMetrics: Record<number, { width: number; height: number }> = {}
                          for (let pageNumber = 1; pageNumber <= resultWithPages.numPages; pageNumber += 1) {
                            try {
                              const page = await getPage(pageNumber)
                              const viewport = page.getViewport({ scale: 1 })
                              nextMetrics[pageNumber] = {
                                width: viewport.width,
                                height: viewport.height,
                              }
                            } catch {
                              // Keep best-effort metrics collection; current page metrics are still captured on <Page /> load.
                            }
                          }

                          if (Object.keys(nextMetrics).length > 0) {
                            setPageMetricsByNumber((current) => ({
                              ...current,
                              ...nextMetrics,
                            }))
                          }
                        })()
                      }
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
                        if (suppressDeleteForFieldRef.current === field.id) {
                          return
                        }
                        setFields((current) =>
                          field.mirrorGroupId
                            ? current.filter((item) => item.mirrorGroupId !== field.mirrorGroupId)
                            : current.filter((item) => item.id !== field.id)
                        )
                      }}
                      title={`${field.fieldType} → ${field.assignedSignerEmail} (${Math.round(resolveFieldDimensions(field).width)}x${Math.round(resolveFieldDimensions(field).height)})`}
                    >
                      {field.fieldType} {Math.round(resolveFieldDimensions(field).width)}x
                      {Math.round(resolveFieldDimensions(field).height)}
                      <span
                        className={styles.resizeHandle}
                        role="presentation"
                        onMouseDown={(event) => handleResizeStart(event, field)}
                        onClick={(event) => {
                          event.stopPropagation()
                          event.preventDefault()
                        }}
                      />
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
        {isSending ? (
          <div className={styles.sendingProgress} aria-live="polite">
            <span className={styles.sendingDot} />
            <span>{sendingStatuses[sendingStatusIndex]}</span>
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
