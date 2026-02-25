import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { ZodError } from 'zod'
import { errorResponse, okResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { appConfig } from '@/core/config/app-config'
import { getContractSignatoryService } from '@/core/registry/service-registry'
import { docusignWebhookSchema } from '@/core/domain/contracts/schemas'

const isSecretMatch = (configuredSecret: string, receivedSecret: string): boolean => {
  const configuredBuffer = Buffer.from(configuredSecret)
  const receivedBuffer = Buffer.from(receivedSecret)

  if (configuredBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(configuredBuffer, receivedBuffer)
}

export async function POST(request: NextRequest) {
  try {
    const configuredSecret = appConfig.docusign.webhookSecret
    if (!configuredSecret) {
      return NextResponse.json(errorResponse('DOCUSIGN_WEBHOOK_DISABLED', 'DocuSign webhook is not configured'), {
        status: 503,
      })
    }

    const receivedSecret = request.headers.get('x-docusign-webhook-secret')
    if (!receivedSecret || !isSecretMatch(configuredSecret, receivedSecret)) {
      return NextResponse.json(errorResponse('DOCUSIGN_WEBHOOK_FORBIDDEN', 'Invalid webhook signature'), {
        status: 401,
      })
    }

    const rawPayload = (await request.json()) as Record<string, unknown>
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

    return NextResponse.json(okResponse({ processed: true }))
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
