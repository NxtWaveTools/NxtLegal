'use client'

import { useMemo, useState } from 'react'
import { contractsClient, type ContractDocument } from '@/core/client/contracts-client'
import { contractDocumentKinds, contractStatuses } from '@/core/constants/contracts'
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
          >
            Replace Document
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

  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false)
  const [replacementFile, setReplacementFile] = useState<File | null>(null)
  const [isFinalExecuted, setIsFinalExecuted] = useState(false)

  const primaryDocuments = useMemo(() => {
    return documents
      .filter((document) => document.documentKind === contractDocumentKinds.primary)
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

  const completionArtifacts = useMemo(() => {
    return documents
      .filter(
        (document) =>
          document.documentKind === contractDocumentKinds.executedContract ||
          document.documentKind === contractDocumentKinds.auditCertificate
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(toExtendedDocument)
  }, [documents])

  const supportingDocumentsByCounterparty = useMemo(() => {
    const supportingDocuments = documents
      .filter((document) => document.documentKind === contractDocumentKinds.counterpartySupporting)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(toExtendedDocument)

    const groupedDocuments = new Map<string, { key: string; label: string; documents: ExtendedDocument[] }>()

    for (const document of supportingDocuments) {
      const normalizedCounterpartyName = document.counterpartyName?.trim() || ''
      const label = normalizedCounterpartyName || 'Budget Approval Supporting Documents'
      const key = document.counterpartyId?.trim() || label

      const existingGroup = groupedDocuments.get(key)
      if (existingGroup) {
        existingGroup.documents.push(document)
        continue
      }

      groupedDocuments.set(key, {
        key,
        label,
        documents: [document],
      })
    }

    return Array.from(groupedDocuments.values())
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

  const isInSignature =
    contractStatus === contractStatuses.signing || contractStatus === contractStatuses.pendingExternal
  const canReplace = (userRole === 'LEGAL_TEAM' || userRole === 'ADMIN') && !isInSignature

  const replaceDisabledMessage = isInSignature
    ? 'Replacement is unavailable while contract is in signature.'
    : undefined

  const openReplaceModal = () => {
    setIsReplaceModalOpen(true)
  }

  const closeReplaceModal = () => {
    setIsReplaceModalOpen(false)
    setReplacementFile(null)
    setIsFinalExecuted(false)
  }

  const handleReplaceSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!replacementFile) {
      toast.error('Please select a file to replace the active document')
      return
    }

    const selectedFile = replacementFile
    const shouldMarkExecuted = isFinalExecuted

    // Close immediately so upload runs in the background without blocking the workspace.
    closeReplaceModal()

    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

    const uploadPromise = contractsClient
      .replaceMainDocument({
        contractId,
        file: selectedFile,
        idempotencyKey,
        isFinalExecuted: shouldMarkExecuted,
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.error?.message ?? 'Failed to replace document')
        }

        await onRefreshDocuments()
        return response
      })

    toast.promise(uploadPromise, {
      loading: 'Uploading replacement document...',
      success: shouldMarkExecuted
        ? 'Document replaced and contract marked as Executed'
        : 'Document replaced successfully',
      error: (error) => (error instanceof Error ? error.message : 'Failed to replace document'),
    })

    void uploadPromise
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
        onPreview={() => props.onPreviewDocument(activeDocument)}
        onDownload={() => props.onDownloadDocument(activeDocument)}
        onReplace={openReplaceModal}
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

      {completionArtifacts.length > 0 ? (
        <div className={workspaceStyles.card}>
          <div className={workspaceStyles.sectionTitle}>Execution Artifacts</div>
          <div className={workspaceStyles.timeline}>
            {completionArtifacts.map((document) => {
              const artifactLabel =
                document.documentKind === 'EXECUTED_CONTRACT' ? 'Executed Contract' : 'Completion Certificate'

              return (
                <div key={document.id} className={workspaceStyles.documentRow}>
                  <div className={workspaceStyles.documentMeta}>
                    <div className={workspaceStyles.eventActor}>{artifactLabel}</div>
                    <div className={workspaceStyles.itemMeta}>{document.fileName}</div>
                    <div className={workspaceStyles.itemMeta}>{formatDate(document.createdAt)}</div>
                  </div>
                  <div className={workspaceStyles.actions}>
                    <button
                      type="button"
                      className={workspaceStyles.button}
                      onClick={() => onPreviewDocument(document)}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={`${workspaceStyles.button} ${workspaceStyles.buttonGhost}`}
                      onClick={() => onDownloadDocument(document)}
                    >
                      Download
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {supportingDocumentsByCounterparty.length > 0 ? (
        <div className={workspaceStyles.card}>
          <div className={workspaceStyles.sectionTitle}>Counterparty Supporting Documents</div>
          <div className={workspaceStyles.timeline}>
            {supportingDocumentsByCounterparty.map((group) => (
              <div key={group.key} className={workspaceStyles.event}>
                <div className={workspaceStyles.eventActor}>{group.label}</div>
                <div className={workspaceStyles.timeline}>
                  {group.documents.map((document) => (
                    <div key={document.id} className={workspaceStyles.documentRow}>
                      <div className={workspaceStyles.documentMeta}>
                        <div className={workspaceStyles.itemMeta}>{document.fileName}</div>
                        <div className={workspaceStyles.itemMeta}>{formatDate(document.createdAt)}</div>
                      </div>
                      <div className={workspaceStyles.actions}>
                        <button
                          type="button"
                          className={workspaceStyles.button}
                          onClick={() => onPreviewDocument(document)}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className={`${workspaceStyles.button} ${workspaceStyles.buttonGhost}`}
                          onClick={() => onDownloadDocument(document)}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isReplaceModalOpen ? (
        <div
          className={workspaceStyles.actionRemarkOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Replace document"
        >
          <form className={workspaceStyles.actionRemarkModal} onSubmit={handleReplaceSubmit}>
            <div className={workspaceStyles.replacementModalTitle}>Replace Document</div>
            <label className={workspaceStyles.replacementModalField}>
              <span>Replacement file</span>
              <input
                type="file"
                className={workspaceStyles.input}
                accept=".doc,.docx,.pdf"
                onChange={(event) => setReplacementFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className={workspaceStyles.replacementCheckboxRow}>
              <input
                type="checkbox"
                name="isFinalExecuted"
                checked={isFinalExecuted}
                onChange={(event) => setIsFinalExecuted(event.target.checked)}
              />
              <span>Is this the final executed document?</span>
            </label>
            <div className={workspaceStyles.actionRemarkActions}>
              <button
                type="button"
                className={`${workspaceStyles.button} ${workspaceStyles.buttonGhost}`}
                onClick={closeReplaceModal}
              >
                Cancel
              </button>
              <button type="submit" className={`${workspaceStyles.button} ${workspaceStyles.buttonPrimary}`}>
                Upload
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
