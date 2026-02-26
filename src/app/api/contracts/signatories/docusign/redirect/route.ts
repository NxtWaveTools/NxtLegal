import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse } from '@/core/http/response'
import { getContractQueryService } from '@/core/registry/service-registry'
import { verifySignatoryLinkToken } from '@/core/infra/security/signatory-link-token'
import { appConfig } from '@/core/config/app-config'
import { ZohoSignClient } from '@/core/infra/integrations/zoho-sign/zoho-sign-client'
import { logger } from '@/core/infra/logging/logger'
import { getSession } from '@/core/infra/session/jwt-session-store'
import { contractStatuses } from '@/core/constants/contracts'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim()
    if (!token) {
      return NextResponse.json(errorResponse('SIGNATORY_LINK_INVALID', 'Missing signatory link token'), { status: 400 })
    }

    const tokenPayload = await verifySignatoryLinkToken(token)
    const contractQueryService = getContractQueryService()

    // Resolve exact recipient context and ensure token recipient still exists.
    const context = await contractQueryService.resolveEnvelopeContext({
      envelopeId: tokenPayload.envelopeId,
      recipientEmail: tokenPayload.recipientEmail,
    })

    if (!context) {
      return NextResponse.json(errorResponse('SIGNATORY_LINK_INVALID', 'Signatory link is invalid or expired'), {
        status: 404,
      })
    }

    const normalizedContextEmail = context.signatoryEmail.trim().toLowerCase()
    const normalizedTokenEmail = tokenPayload.recipientEmail.trim().toLowerCase()
    if (normalizedContextEmail !== normalizedTokenEmail) {
      return NextResponse.json(errorResponse('SIGNATORY_LINK_INVALID', 'Signatory mismatch'), { status: 403 })
    }

    if (context.contractStatus === contractStatuses.void) {
      return NextResponse.json(errorResponse('SIGNATORY_LINK_FORBIDDEN', 'This contract has been voided'), {
        status: 403,
      })
    }

    // Internal recipients must be signed in as the intended account.
    if (context.recipientType === 'INTERNAL') {
      const session = await getSession()
      if (!session?.employeeId || !session.email || !session.tenantId) {
        return NextResponse.json(errorResponse('UNAUTHORIZED', 'Please sign in to continue signing'), { status: 401 })
      }

      const normalizedSessionEmail = session.email.trim().toLowerCase()
      if (normalizedSessionEmail !== normalizedTokenEmail) {
        return NextResponse.json(
          errorResponse('SIGNATORY_LINK_FORBIDDEN', 'This signing link does not belong to your account'),
          { status: 403 }
        )
      }

      if (context.tenantId !== session.tenantId) {
        return NextResponse.json(
          errorResponse('SIGNATORY_LINK_FORBIDDEN', 'This signing link does not belong to your tenant'),
          { status: 403 }
        )
      }
    }

    const zohoConfig = appConfig.zohoSign
    if (!zohoConfig.apiBaseUrl || !zohoConfig.accessToken) {
      return NextResponse.json(
        errorResponse('SIGNATORY_PROVIDER_NOT_CONFIGURED', 'Signatory provider integration is not configured'),
        { status: 503 }
      )
    }

    const zohoClient = new ZohoSignClient({
      apiBaseUrl: zohoConfig.apiBaseUrl,
      accessToken: zohoConfig.accessToken,
    })

    const signingUrl = await zohoClient.createEmbeddedSigningUrl({
      envelopeId: tokenPayload.envelopeId,
      recipientId: tokenPayload.recipientId,
      returnUrl: `${appConfig.auth.siteUrl}/contracts/${context.contractId}`,
    })

    return NextResponse.redirect(signingUrl, { status: 302 })
  } catch (error) {
    logger.error('Failed to resolve signatory redirect link', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(errorResponse('SIGNATORY_LINK_INVALID', 'Signatory link is invalid or expired'), {
      status: 400,
    })
  }
}
