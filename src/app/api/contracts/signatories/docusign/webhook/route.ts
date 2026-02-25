import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { ZodError } from 'zod'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { getContractSignatoryService } from '@/core/registry/service-registry'
import { docusignWebhookSchema } from '@/core/domain/contracts/schemas'
import { logger } from '@/core/infra/logging/logger'

/*
 * DocuSign Connect can provide signatures in either raw base64 digest or
 * prefixed format (e.g., "sha256=<digest>"). This normalizes both formats
 * into a digest buffer before secure comparison.
 */
const decodeDocusignSignature = (signatureHeader: string): Buffer | null => {
  const trimmed = signatureHeader.trim()
  if (!trimmed) {
    return null
  }

  const normalized = trimmed.toLowerCase().startsWith('sha256=') ? trimmed.slice(7).trim() : trimmed
  if (!normalized) {
    return null
  }

  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return Buffer.from(normalized, 'hex')
  }

  const decoded = Buffer.from(normalized, 'base64')
  return decoded.length > 0 ? decoded : null
}

const isDigestMatch = (expectedDigest: Buffer, receivedDigest: Buffer): boolean => {
  if (expectedDigest.length !== receivedDigest.length) {
    return false
  }

  return timingSafeEqual(expectedDigest, receivedDigest)
}

export async function POST(request: NextRequest) {
  try {
    const connectKey = appConfig.docusign.connectKey
    if (!connectKey) {
      return NextResponse.json(errorResponse('DOCUSIGN_WEBHOOK_DISABLED', 'DocuSign webhook is not configured'), {
        status: 503,
      })
    }

    /*
     * Signature verification must use the exact raw request body bytes.
     * Never parse JSON before this step, otherwise canonicalization can
     * invalidate the signature comparison.
     */
    const rawBody = await request.text()
    const receivedSignatureHeader = request.headers.get('x-docusign-signature-1')
    const receivedSignature = receivedSignatureHeader ? decodeDocusignSignature(receivedSignatureHeader) : null
    const expectedDigest = createHmac('sha256', connectKey).update(rawBody, 'utf8').digest()
    const signatureValid = receivedSignature ? isDigestMatch(expectedDigest, receivedSignature) : false

    logger.info('DOCUSIGN_SIGNATURE_VALIDATION_RESULT', {
      signatureValid,
      hasSignatureHeader: Boolean(receivedSignatureHeader),
      signatureHeaderName: 'x-docusign-signature-1',
    })

    if (!signatureValid) {
      return NextResponse.json(errorResponse('DOCUSIGN_WEBHOOK_FORBIDDEN', 'Invalid webhook signature'), {
        status: 401,
      })
    }

    const rawPayload = JSON.parse(rawBody) as Record<string, unknown>
    const payload = docusignWebhookSchema.parse(rawPayload)
    const contractSignatoryService = getContractSignatoryService()

    await contractSignatoryService.handleDocusignSignedWebhook({
      envelopeId: payload.envelopeId,
      recipientEmail: payload.recipientEmail,
      status: payload.status,
      signedAt: payload.signedAt,
      eventId: payload.eventId,
      signerIp: payload.signerIp,
      payload: rawPayload,
    })

    return NextResponse.json(okResponse({ received: true }))
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid DocuSign webhook payload'), { status: 400 })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to process DocuSign webhook'

    return NextResponse.json(errorResponse(code, message), { status })
  }
}
