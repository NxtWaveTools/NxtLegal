import 'server-only'

import type { ContractSignatoryFieldType, ContractSignatoryRecipientType } from '@/core/constants/contracts'

type ZohoSignClientConfig = {
  apiBaseUrl: string
  accessToken: string
}

type CreateSigningEnvelopeInput = {
  recipients: Array<{
    email: string
    name: string
    recipientType: ContractSignatoryRecipientType
    routingOrder: number
    fields: Array<{
      fieldType: ContractSignatoryFieldType
      pageNumber: number | null
      xPosition: number | null
      yPosition: number | null
      anchorString: string | null
      assignedSignerEmail: string
    }>
  }>
  documentName: string
  documentMimeType: string
  documentBytes: Uint8Array
  emailSubject: string
  returnUrl: string
}

type CreateSigningEnvelopeResult = {
  envelopeId: string
  recipients: Array<{
    email: string
    recipientId: string
    clientUserId: string
    signingUrl: string
  }>
}

type ZohoRequestAction = {
  action_id?: string
  recipient_email?: string
}

type ZohoCreateRequestResponse = {
  requests?: {
    request_id?: string
    document_ids?: Array<{ document_id?: string }>
    actions?: ZohoRequestAction[]
  }
}

export class ZohoSignClient {
  constructor(private readonly config: ZohoSignClientConfig) {}

  async createSigningEnvelope(input: CreateSigningEnvelopeInput): Promise<CreateSigningEnvelopeResult> {
    const createResponse = await this.createRequest(input)
    const requestId = createResponse.requests?.request_id
    const documentId = createResponse.requests?.document_ids?.[0]?.document_id
    const createdActions = createResponse.requests?.actions ?? []

    if (!requestId) {
      throw new Error('Zoho Sign did not return request_id')
    }

    if (!documentId) {
      throw new Error('Zoho Sign did not return document_id')
    }

    const createdActionByEmail = new Map<string, ZohoRequestAction>()
    for (const action of createdActions) {
      const email = action.recipient_email?.trim().toLowerCase()
      if (email) {
        createdActionByEmail.set(email, action)
      }
    }

    await this.submitRequest({
      requestId,
      documentId,
      recipients: input.recipients,
      createdActionByEmail,
    })

    const recipientViews = input.recipients.map((recipient) => {
      const actionId = createdActionByEmail.get(recipient.email.trim().toLowerCase())?.action_id
      if (!actionId) {
        throw new Error(`Zoho Sign did not return action_id for recipient ${recipient.email}`)
      }

      return {
        email: recipient.email,
        recipientId: actionId,
        clientUserId: actionId,
        signingUrl: '',
      }
    })

    return {
      envelopeId: requestId,
      recipients: recipientViews,
    }
  }

  async createEmbeddedSigningUrl(params: {
    envelopeId: string
    recipientId: string
    returnUrl: string
  }): Promise<string> {
    const host = this.resolveEmbeddedHost(params.returnUrl)
    return this.createEmbedSigningUrl({
      requestId: params.envelopeId,
      actionId: params.recipientId,
      host,
    })
  }

  async downloadCompletedEnvelopeDocuments(params: {
    envelopeId: string
  }): Promise<{ executedPdf: Uint8Array; certificatePdf: Uint8Array }> {
    const [executedPdf, certificatePdf] = await Promise.all([
      this.downloadPdf(`/requests/${params.envelopeId}/pdf`),
      this.downloadPdf(`/requests/${params.envelopeId}/completioncertificate`),
    ])

    return {
      executedPdf,
      certificatePdf,
    }
  }

  private async createRequest(input: CreateSigningEnvelopeInput): Promise<ZohoCreateRequestResponse> {
    if (input.documentBytes.byteLength === 0) {
      throw new Error('Zoho Sign request creation failed: source document is empty')
    }

    const form = new FormData()
    const detectedFormat = this.detectSupportedFileFormat({
      documentName: input.documentName,
      documentMimeType: input.documentMimeType,
      documentBytes: input.documentBytes,
    })
    if (!detectedFormat) {
      const firstBytesHex = Buffer.from(input.documentBytes.subarray(0, Math.min(12, input.documentBytes.byteLength)))
        .toString('hex')
        .toUpperCase()
      throw new Error(
        `Zoho Sign request creation failed: unsupported source document format; ` +
          `uploadMeta={name:${input.documentName},mime:${input.documentMimeType},size:${input.documentBytes.byteLength},firstBytesHex:${firstBytesHex}}`
      )
    }

    const fileName = this.normalizeFileNameWithExtension(input.documentName, detectedFormat.extension)
    const mimeType = detectedFormat.mimeType
    const dataPayload = {
      requests: {
        request_name: input.emailSubject,
        is_sequential: input.recipients.length > 1,
        actions: input.recipients.map((recipient) => ({
          action_type: 'SIGN',
          recipient_name: recipient.name || recipient.email,
          recipient_email: recipient.email,
          signing_order: recipient.routingOrder,
          is_embedded: true,
        })),
        expiration_days: 30,
      },
    }

    const file = new File([Buffer.from(input.documentBytes)], fileName, { type: mimeType })
    form.append('file', file)
    form.append('data', JSON.stringify(dataPayload))

    const response = await fetch(`${this.config.apiBaseUrl}/requests`, {
      method: 'POST',
      headers: {
        ...this.createAuthHeaders(),
        Accept: 'application/json',
      },
      body: form,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `Zoho Sign request creation failed: ${errorBody}; uploadMeta={fileName:${fileName},mimeType:${mimeType},size:${input.documentBytes.byteLength}}`
      )
    }

    return (await response.json()) as ZohoCreateRequestResponse
  }

  private async submitRequest(params: {
    requestId: string
    documentId: string
    recipients: CreateSigningEnvelopeInput['recipients']
    createdActionByEmail: Map<string, ZohoRequestAction>
  }): Promise<void> {
    const actions = params.recipients.map((recipient) => {
      const normalizedEmail = recipient.email.trim().toLowerCase()
      const actionId = params.createdActionByEmail.get(normalizedEmail)?.action_id
      if (!actionId) {
        throw new Error(`Zoho Sign action_id missing for recipient ${recipient.email}`)
      }

      const fieldsForRecipient = recipient.fields.filter(
        (field) => field.assignedSignerEmail.trim().toLowerCase() === normalizedEmail
      )

      return {
        action_id: actionId,
        action_type: 'SIGN',
        recipient_name: recipient.name || recipient.email,
        recipient_email: recipient.email,
        signing_order: recipient.routingOrder,
        // Enforce recipient verification at Zoho to prevent forwarded-link misuse.
        verify_recipient: true,
        fields: fieldsForRecipient.map((field, index) =>
          this.mapFieldToZohoField(field, params.documentId, actionId, index)
        ),
      }
    })

    const body = new URLSearchParams({
      data: JSON.stringify({
        requests: {
          expiration_days: 30,
          actions,
        },
      }),
    })

    const response = await fetch(`${this.config.apiBaseUrl}/requests/${params.requestId}/submit`, {
      method: 'POST',
      headers: {
        ...this.createAuthHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Zoho Sign request submit failed: ${errorBody}`)
    }
  }

  private async createEmbedSigningUrl(params: { requestId: string; actionId: string; host: string }): Promise<string> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/requests/${params.requestId}/actions/${params.actionId}/embedtoken?host=${encodeURIComponent(
        params.host
      )}`,
      {
        method: 'POST',
        headers: this.createAuthHeaders(),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Zoho Sign embed signing URL generation failed: ${errorBody}`)
    }

    const payload = (await response.json()) as {
      sign_url?: string
      actions?: Array<{ sign_url?: string }>
    }

    const signUrl = payload.sign_url ?? payload.actions?.[0]?.sign_url
    if (!signUrl) {
      throw new Error('Zoho Sign did not return sign_url')
    }

    return signUrl
  }

  private async downloadPdf(path: string): Promise<Uint8Array> {
    const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method: 'GET',
      headers: {
        ...this.createAuthHeaders(),
        Accept: 'application/pdf',
      },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Zoho Sign PDF download failed for ${path}: ${errorBody}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  private createAuthHeaders(): Record<string, string> {
    const token = this.config.accessToken.trim()
    if (!token) {
      throw new Error('Zoho Sign access token is missing')
    }

    return {
      Authorization: `Zoho-oauthtoken ${token}`,
    }
  }

  private resolveEmbeddedHost(returnUrl: string): string {
    try {
      const origin = new URL(returnUrl).origin
      if (origin.startsWith('http://')) {
        return origin.replace('http://', 'https://')
      }
      return origin
    } catch {
      if (returnUrl.startsWith('http://')) {
        return returnUrl.replace('http://', 'https://')
      }
      return returnUrl
    }
  }

  private mapFieldToZohoField(
    field: CreateSigningEnvelopeInput['recipients'][number]['fields'][number],
    documentId: string,
    actionId: string,
    index: number
  ): Record<string, unknown> {
    const { fieldTypeName, fieldCategory, defaultWidth, defaultHeight, fieldLabel } = this.resolveZohoFieldType(
      field.fieldType
    )
    const pageNumber = Math.max(0, (field.pageNumber ?? 1) - 1)
    const xCoord = this.normalizeZohoPointCoordinate(field.xPosition, 24)
    const yCoord = this.normalizeZohoPointCoordinate(field.yPosition, 24)

    return {
      field_type_name: fieldTypeName,
      field_category: fieldCategory,
      field_name: `${fieldLabel}_${index + 1}`,
      field_label: fieldLabel,
      is_mandatory: field.fieldType === 'SIGNATURE' || field.fieldType === 'INITIAL',
      page_no: pageNumber,
      document_id: documentId,
      action_id: actionId,
      x_coord: xCoord,
      y_coord: yCoord,
      abs_width: defaultWidth,
      abs_height: defaultHeight,
    }
  }

  private normalizeZohoPointCoordinate(value: number | null, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback
    }

    // Send PDF-space coordinates (points) directly, keep safe integer bounds.
    return Math.max(0, Math.min(2000, Math.round(value)))
  }

  private resolveZohoFieldType(fieldType: ContractSignatoryFieldType): {
    fieldTypeName: string
    fieldCategory: string
    defaultWidth: number
    defaultHeight: number
    fieldLabel: string
  } {
    switch (fieldType) {
      case 'SIGNATURE':
        return {
          fieldTypeName: 'Signature',
          fieldCategory: 'image',
          defaultWidth: 30,
          defaultHeight: 10,
          fieldLabel: 'Signature',
        }
      case 'INITIAL':
        return {
          fieldTypeName: 'Initial',
          fieldCategory: 'image',
          defaultWidth: 15,
          defaultHeight: 8,
          fieldLabel: 'Initial',
        }
      case 'STAMP':
        return {
          fieldTypeName: 'Stamp',
          fieldCategory: 'image',
          defaultWidth: 20,
          defaultHeight: 10,
          fieldLabel: 'Stamp',
        }
      case 'NAME':
        return {
          fieldTypeName: 'Name',
          fieldCategory: 'textfield',
          defaultWidth: 25,
          defaultHeight: 4,
          fieldLabel: 'Name',
        }
      case 'DATE':
        return {
          fieldTypeName: 'Date',
          fieldCategory: 'datefield',
          defaultWidth: 18,
          defaultHeight: 4,
          fieldLabel: 'Date',
        }
      case 'TIME':
        return {
          fieldTypeName: 'Textfield',
          fieldCategory: 'textfield',
          defaultWidth: 15,
          defaultHeight: 4,
          fieldLabel: 'Time',
        }
      case 'TEXT':
        return {
          fieldTypeName: 'Textfield',
          fieldCategory: 'textfield',
          defaultWidth: 30,
          defaultHeight: 4,
          fieldLabel: 'Text',
        }
    }
  }

  private resolveFileExtension(fileName: string, mimeType: string): string {
    const extensionFromName = fileName.split('.').pop()?.trim().toLowerCase()
    if (extensionFromName && extensionFromName.length > 0) {
      return extensionFromName
    }

    if (mimeType.includes('pdf')) {
      return 'pdf'
    }

    if (mimeType.includes('wordprocessingml.document')) {
      return 'docx'
    }

    return 'bin'
  }

  private normalizeFileNameWithExtension(fileName: string, extension: string): string {
    const trimmed = fileName.trim()
    const lastDotIndex = trimmed.lastIndexOf('.')
    const baseName = lastDotIndex > 0 ? trimmed.slice(0, lastDotIndex) : trimmed
    const safeBaseName = baseName.length > 0 ? baseName : 'document'
    return `${safeBaseName}.${extension}`
  }

  private detectSupportedFileFormat(params: {
    documentName: string
    documentMimeType: string
    documentBytes: Uint8Array
  }): { extension: 'pdf' | 'docx' | 'doc'; mimeType: string } | null {
    const bytes = params.documentBytes
    const mime = params.documentMimeType.trim().toLowerCase()
    const extension = this.resolveFileExtension(params.documentName, mime)

    const startsWith = (signature: number[]): boolean => {
      if (bytes.byteLength < signature.length) {
        return false
      }

      return signature.every((value, index) => bytes[index] === value)
    }

    const isPdfByHeader =
      bytes.byteLength >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('utf8').toUpperCase() === '%PDF-'
    if (isPdfByHeader) {
      return { extension: 'pdf', mimeType: 'application/pdf' }
    }

    // ZIP header (used by DOCX)
    const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])
    if (isZip && (mime.includes('wordprocessingml.document') || extension === 'docx')) {
      return {
        extension: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
    }

    // OLE Compound File header (legacy DOC)
    const isOleDoc = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    if (isOleDoc && (mime === 'application/msword' || extension === 'doc')) {
      return { extension: 'doc', mimeType: 'application/msword' }
    }

    // Fallback to explicit trusted signals
    if (mime === 'application/pdf') {
      return { extension: 'pdf', mimeType: 'application/pdf' }
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return {
        extension: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
    }
    if (mime === 'application/msword') {
      return { extension: 'doc', mimeType: 'application/msword' }
    }

    return null
  }

  private resolveUploadMimeType(params: {
    documentName: string
    documentMimeType: string
    documentBytes: Uint8Array
  }): string {
    const mime = params.documentMimeType.trim().toLowerCase()
    if (mime === 'application/pdf') {
      return mime
    }

    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return mime
    }

    if (mime === 'application/msword') {
      return mime
    }

    const isPdfBySignature =
      params.documentBytes.byteLength >= 5 &&
      Buffer.from(params.documentBytes.subarray(0, 5)).toString('utf8') === '%PDF-'
    if (isPdfBySignature) {
      return 'application/pdf'
    }

    const extension = this.resolveFileExtension(params.documentName, mime)
    if (extension === 'pdf') {
      return 'application/pdf'
    }
    if (extension === 'docx') {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    if (extension === 'doc') {
      return 'application/msword'
    }

    return 'application/octet-stream'
  }
}
