'use client'

import { useMemo, useRef, useState } from 'react'
import { contractsClient, type ContractDocument } from '@/core/client/contracts-client'
import Spinner from '@/components/ui/Spinner'
import { toast } from 'sonner'
import workspaceStyles from '@/modules/contracts/ui/contracts-workspace.module.css'

type ContractDocumentsPanelProps = {
  contractId: string
  contractStatus: string
  userRole?: string
  currentDocumentId?: string | null
  documents: ContractDocument[]
  defaultUploaderEmail?: string
  onPreviewDocument: (document: ContractDocument) => void
  onDownloadDocument: (document: ContractDocument) => void
  onRefreshDocuments: () => Promise<void>
}

type ExtendedDocument = ContractDocument & {
  uploadedByRole?: string
  uploadedByName?: string
  uploadedByEmail?: string
}

const toExtendedDocument = (document: ContractDocument): ExtendedDocument => {
  const value = document as unknown as Record<string, unknown>

  return {
    ...document,
    uploadedByRole:
      typeof value.uploadedByRole === 'string'
        ? value.uploadedByRole
        : typeof value.uploaded_role === 'string'
          ? value.uploaded_role
          : undefined,
    uploadedByName:
      typeof value.uploadedByName === 'string'
        ? value.uploadedByName
        : typeof value.uploaded_by_name === 'string'
          ? value.uploaded_by_name
          : undefined,
    uploadedByEmail:
      typeof value.uploadedByEmail === 'string'
        ? value.uploadedByEmail
        : typeof value.uploaded_by_email === 'string'
          ? value.uploaded_by_email
          : undefined,
  }
}

const formatDate = (isoDate: string): string => {
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }

  return parsed.toLocaleString()
}

const formatType = (mimeType: string): string => {
  if (mimeType.includes('wordprocessingml')) {
    return 'DOCX'
  }

  if (mimeType.includes('msword')) {
    return 'DOC'
  }

  if (mimeType.includes('pdf')) {
    return 'PDF'
  }

  return mimeType
}

const getVersionLabel = (document: ContractDocument): string => {
  return typeof document.versionNumber === 'number' ? `v${document.versionNumber}` : 'v—'
}

const ActiveVersionCard = (props: {
  document: ExtendedDocument
  canReplace: boolean
  isReplacing: boolean
  onPreview: () => void
  onDownload: () => void
  onReplace: () => void
  replaceDisabledMessage?: string
  defaultUploaderEmail?: string
}) => {
  const uploaderRole = props.document.uploadedByRole ?? '—'
  const uploaderNameOrEmail =
    props.document.uploadedByName ?? props.document.uploadedByEmail ?? props.defaultUploaderEmail ?? '—'

  return (
    <div className={workspaceStyles.card}>
      <div className={workspaceStyles.sectionTitle}>{`Active Version ${getVersionLabel(props.document)}`}</div>
      <div className={workspaceStyles.row}>
        <span>File name</span>
        <span>{props.document.fileName}</span>
      </div>
      <div className={workspaceStyles.row}>
        <span>File type</span>
        <span>{formatType(props.document.fileMimeType)}</span>
      </div>
      <div className={workspaceStyles.row}>
        <span>Uploaded by</span>
        <span>{`${uploaderRole} · ${uploaderNameOrEmail}`}</span>
      </div>
      <div className={workspaceStyles.row}>
        <span>Uploaded date</span>
        <span>{formatDate(props.document.createdAt)}</span>
      </div>
      <div className={workspaceStyles.actions}>
        <button type="button" className={workspaceStyles.button} onClick={props.onPreview}>
          Preview
        </button>
        <button
          type="button"
          className={`${workspaceStyles.button} ${workspaceStyles.buttonGhost}`}
          onClick={props.onDownload}
        >
          Download
        </button>
        {props.canReplace ? (
          <button
            type="button"
            className={`${workspaceStyles.button} ${workspaceStyles.buttonPrimary}`}
            onClick={props.onReplace}
            disabled={props.isReplacing}
          >
            <span className={workspaceStyles.buttonContent}>
              {props.isReplacing ? <Spinner size={14} /> : null}
              {props.isReplacing ? 'Replacing…' : 'Replace Document'}
            </span>
          </button>
        ) : null}
      </div>
      {!props.canReplace && props.replaceDisabledMessage ? (
        <div className={workspaceStyles.eventMeta}>{props.replaceDisabledMessage}</div>
      ) : null}
    </div>
  )
}

const VersionHistoryTable = (props: {
  documents: ExtendedDocument[]
  currentDocumentId?: string | null
  fallbackCurrentId?: string
  defaultUploaderEmail?: string
  onDownload: (document: ExtendedDocument) => void
  onPreview: (document: ExtendedDocument) => void
}) => {
  return (
    <div className={workspaceStyles.card}>
      <div className={workspaceStyles.sectionTitle}>Version History</div>
      <div className={workspaceStyles.timeline}>
        {props.documents.map((document) => {
          const isCurrent =
            (props.currentDocumentId && document.id === props.currentDocumentId) ||
            (!props.currentDocumentId && props.fallbackCurrentId === document.id)
          const uploaderRole = document.uploadedByRole ?? '—'
          const uploaderNameOrEmail =
            document.uploadedByName ?? document.uploadedByEmail ?? props.defaultUploaderEmail ?? '—'

          return (
            <div key={document.id} className={workspaceStyles.documentRow}>
              <div className={workspaceStyles.documentMeta}>
                <div className={workspaceStyles.eventActor}>
                  {getVersionLabel(document)} {isCurrent ? '· Current' : ''}
                </div>
                <div className={workspaceStyles.itemMeta}>{document.fileName}</div>
                <div className={workspaceStyles.itemMeta}>{formatType(document.fileMimeType)}</div>
                <div className={workspaceStyles.itemMeta}>{`${uploaderRole} · ${uploaderNameOrEmail}`}</div>
                <div className={workspaceStyles.itemMeta}>{formatDate(document.createdAt)}</div>
              </div>
              <div className={workspaceStyles.actions}>
                <button type="button" className={workspaceStyles.button} onClick={() => props.onPreview(document)}>
                  Preview
                </button>
                <button
                  type="button"
                  className={`${workspaceStyles.button} ${workspaceStyles.buttonGhost}`}
                  onClick={() => props.onDownload(document)}
                >
                  Download
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ContractDocumentsPanel(props: ContractDocumentsPanelProps) {
  const {
    contractId,
    contractStatus,
    userRole,
    currentDocumentId,
    documents,
    defaultUploaderEmail,
    onPreviewDocument,
    onDownloadDocument,
    onRefreshDocuments,
  } = props

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReplacing, setIsReplacing] = useState(false)

  const primaryDocuments = useMemo(() => {
    return documents
      .filter((document) => document.documentKind === 'PRIMARY')
      .sort((a, b) => {
        const aVersion = typeof a.versionNumber === 'number' ? a.versionNumber : 0
        const bVersion = typeof b.versionNumber === 'number' ? b.versionNumber : 0

        if (aVersion !== bVersion) {
          return bVersion - aVersion
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      .map(toExtendedDocument)
  }, [documents])

  const activeDocument = useMemo(() => {
    if (!primaryDocuments.length) {
      return null
    }

    if (currentDocumentId) {
      return primaryDocuments.find((document) => document.id === currentDocumentId) ?? null
    }

    return primaryDocuments[0]
  }, [currentDocumentId, primaryDocuments])

  const canReplace = userRole === 'LEGAL_TEAM' && contractStatus !== 'PENDING_WITH_EXTERNAL_STAKEHOLDERS'

  const replaceDisabledMessage =
    contractStatus === 'PENDING_WITH_EXTERNAL_STAKEHOLDERS'
      ? 'Replacement is unavailable while contract is in signature.'
      : undefined

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleReplaceFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setIsReplacing(true)
    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

    const response = await contractsClient.replaceMainDocument({
      contractId,
      file,
      idempotencyKey,
    })

    if (!response.ok) {
      setError(response.error?.message ?? 'Failed to replace document')
      toast.error(response.error?.message ?? 'Failed to replace document')
      setIsReplacing(false)
      return
    }

    setError(null)
    await onRefreshDocuments()
    toast.success('Document version uploaded successfully')
    setIsReplacing(false)
  }

  if (!activeDocument) {
    return (
      <div className={workspaceStyles.card}>
        <div className={workspaceStyles.sectionTitle}>Documents</div>
        <div className={workspaceStyles.placeholderRow}>No primary contract versions found.</div>
      </div>
    )
  }

  return (
    <div className={workspaceStyles.tabSection}>
      <ActiveVersionCard
        document={activeDocument}
        canReplace={canReplace}
        isReplacing={isReplacing}
        onPreview={() => props.onPreviewDocument(activeDocument)}
        onDownload={() => props.onDownloadDocument(activeDocument)}
        onReplace={openFilePicker}
        replaceDisabledMessage={replaceDisabledMessage}
        defaultUploaderEmail={defaultUploaderEmail}
      />

      <VersionHistoryTable
        documents={primaryDocuments}
        currentDocumentId={currentDocumentId}
        fallbackCurrentId={primaryDocuments[0]?.id}
        onDownload={(document) => onDownloadDocument(document)}
        onPreview={(document) => onPreviewDocument(document)}
        defaultUploaderEmail={defaultUploaderEmail}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx,.pdf"
        style={{ display: 'none' }}
        onChange={(event) => void handleReplaceFilePicked(event)}
      />

      {error ? <div className={workspaceStyles.error}>{error}</div> : null}
    </div>
  )
}
