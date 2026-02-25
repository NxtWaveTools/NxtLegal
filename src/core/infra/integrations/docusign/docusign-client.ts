import 'server-only'

import { createSign, randomUUID } from 'crypto'
import type { ContractSignatoryFieldType, ContractSignatoryRecipientType } from '@/core/constants/contracts'

type DocusignClientConfig = {
  authBaseUrl: string
  apiBaseUrl: string
  accountId: string
  userId: string
  integrationKey: string
  rsaPrivateKey: string
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

export class DocusignClient {
  constructor(private readonly config: DocusignClientConfig) {}

  async downloadCompletedEnvelopeDocuments(params: {
    envelopeId: string
  }): Promise<{ executedPdf: Uint8Array; certificatePdf: Uint8Array }> {
    const accessToken = await this.getAccessToken()
    const [executedPdf, certificatePdf] = await Promise.all([
      this.downloadEnvelopeDocument(params.envelopeId, 'combined', accessToken),
      this.downloadEnvelopeDocument(params.envelopeId, 'certificate', accessToken),
    ])

    return {
      executedPdf,
      certificatePdf,
    }
  }

  async createSigningEnvelope(input: CreateSigningEnvelopeInput): Promise<CreateSigningEnvelopeResult> {
    const accessToken = await this.getAccessToken()
    const recipientMetadata = input.recipients.map((recipient, index) => ({
      ...recipient,
      recipientId: String(index + 1),
      clientUserId: randomUUID(),
    }))

    const recipientsByEmail = new Map(recipientMetadata.map((recipient) => [recipient.email, recipient]))

    const signers = recipientMetadata.map((recipient) => {
      const fieldsForRecipient = recipient.fields.filter((field) => field.assignedSignerEmail === recipient.email)

      return {
        email: recipient.email,
        name: recipient.name,
        recipientId: recipient.recipientId,
        routingOrder: String(recipient.routingOrder),
        clientUserId: recipient.clientUserId,
        tabs: this.mapFieldsToTabs(fieldsForRecipient),
      }
    })

    const envelopeResponse = await fetch(`${this.config.apiBaseUrl}/v2.1/accounts/${this.config.accountId}/envelopes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emailSubject: input.emailSubject,
        documents: [
          {
            documentBase64: Buffer.from(input.documentBytes).toString('base64'),
            name: input.documentName,
            fileExtension: this.resolveFileExtension(input.documentName, input.documentMimeType),
            documentId: '1',
          },
        ],
        recipients: {
          signers,
        },
        status: 'sent',
      }),
    })

    if (!envelopeResponse.ok) {
      const errorBody = await envelopeResponse.text()
      throw new Error(`DocuSign envelope creation failed: ${errorBody}`)
    }

    const envelopePayload = (await envelopeResponse.json()) as { envelopeId?: string }
    const envelopeId = envelopePayload.envelopeId

    if (!envelopeId) {
      throw new Error('DocuSign did not return envelopeId')
    }

    const recipientViews = await Promise.all(
      recipientMetadata.map(async (recipient) => {
        const viewResponse = await fetch(
          `${this.config.apiBaseUrl}/v2.1/accounts/${this.config.accountId}/envelopes/${envelopeId}/views/recipient`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              returnUrl: input.returnUrl,
              authenticationMethod: 'none',
              email: recipient.email,
              userName: recipient.name,
              clientUserId: recipient.clientUserId,
              recipientId: recipient.recipientId,
            }),
          }
        )

        if (!viewResponse.ok) {
          const errorBody = await viewResponse.text()
          throw new Error(`DocuSign recipient view generation failed: ${errorBody}`)
        }

        const viewPayload = (await viewResponse.json()) as { url?: string }
        if (!viewPayload.url) {
          throw new Error('DocuSign did not return signing URL')
        }

        return {
          email: recipient.email,
          recipientId: recipient.recipientId,
          clientUserId: recipient.clientUserId,
          signingUrl: viewPayload.url,
        }
      })
    )

    return {
      envelopeId,
      recipients: recipientViews.map((view) => ({
        email: view.email,
        recipientId: recipientsByEmail.get(view.email)?.recipientId ?? view.recipientId,
        clientUserId: recipientsByEmail.get(view.email)?.clientUserId ?? view.clientUserId,
        signingUrl: view.signingUrl,
      })),
    }
  }

  private mapFieldsToTabs(
    fields: Array<{
      fieldType: ContractSignatoryFieldType
      pageNumber: number | null
      xPosition: number | null
      yPosition: number | null
      anchorString: string | null
      assignedSignerEmail: string
    }>
  ): Record<string, unknown[]> {
    const tabs: Record<string, unknown[]> = {
      signHereTabs: [],
      initialHereTabs: [],
      dateSignedTabs: [],
      nameTabs: [],
      textTabs: [],
      stampTabs: [],
    }

    for (const field of fields) {
      const base = this.resolveTabBase(field)

      switch (field.fieldType) {
        case 'SIGNATURE':
          tabs.signHereTabs.push(base)
          break
        case 'INITIAL':
          tabs.initialHereTabs.push(base)
          break
        case 'STAMP':
          tabs.stampTabs.push(base)
          break
        case 'NAME':
          tabs.nameTabs.push(base)
          break
        case 'DATE':
          tabs.dateSignedTabs.push(base)
          break
        case 'TIME':
          tabs.textTabs.push({ ...base, name: 'Signed Time', value: '' })
          break
        case 'TEXT':
          tabs.textTabs.push({ ...base, name: 'Text Field', value: '' })
          break
      }
    }

    return tabs
  }

  private resolveTabBase(field: {
    pageNumber: number | null
    xPosition: number | null
    yPosition: number | null
    anchorString: string | null
  }): Record<string, unknown> {
    if (field.anchorString) {
      return {
        anchorString: field.anchorString,
        anchorIgnoreIfNotPresent: 'true',
      }
    }

    return {
      documentId: '1',
      pageNumber: String(field.pageNumber ?? 1),
      xPosition: String(Math.round(field.xPosition ?? 0)),
      yPosition: String(Math.round(field.yPosition ?? 0)),
    }
  }

  private async getAccessToken(): Promise<string> {
    const assertion = this.createJwtAssertion()
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    })

    const tokenResponse = await fetch(`${this.config.authBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text()
      throw new Error(`DocuSign auth failed: ${errorBody}`)
    }

    const payload = (await tokenResponse.json()) as { access_token?: string }
    if (!payload.access_token) {
      throw new Error('DocuSign auth response missing access_token')
    }

    return payload.access_token
  }

  private async downloadEnvelopeDocument(
    envelopeId: string,
    documentId: 'combined' | 'certificate',
    accessToken: string
  ): Promise<Uint8Array> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/v2.1/accounts/${this.config.accountId}/envelopes/${envelopeId}/documents/${documentId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/pdf',
        },
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`DocuSign document download failed for ${documentId}: ${errorBody}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  private createJwtAssertion(): string {
    const nowInSeconds = Math.floor(Date.now() / 1000)
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    }

    const audienceHost = new URL(this.config.authBaseUrl).host
    const payload = {
      iss: this.config.integrationKey,
      sub: this.config.userId,
      aud: audienceHost,
      scope: 'signature impersonation',
      iat: nowInSeconds,
      exp: nowInSeconds + 300,
    }

    const encodedHeader = this.toBase64Url(JSON.stringify(header))
    const encodedPayload = this.toBase64Url(JSON.stringify(payload))
    const unsignedToken = `${encodedHeader}.${encodedPayload}`

    const signer = createSign('RSA-SHA256')
    signer.update(unsignedToken)
    signer.end()

    const normalizedPrivateKey = this.config.rsaPrivateKey.replace(/\\n/g, '\n')
    const signature = signer.sign(normalizedPrivateKey)

    return `${unsignedToken}.${this.toBase64Url(signature)}`
  }

  private toBase64Url(value: string | Buffer): string {
    const base64 = Buffer.isBuffer(value) ? value.toString('base64') : Buffer.from(value).toString('base64')
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
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
}
