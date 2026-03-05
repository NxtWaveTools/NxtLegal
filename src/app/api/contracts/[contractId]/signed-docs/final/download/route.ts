import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractSignatoryService } from '@/core/registry/service-registry'
import { logger } from '@/core/infra/logging/logger'

const GETHandler = withAuth(async (request: NextRequest, { session, params }) => {
  const handlerStartedAt = Date.now()
  const elapsedMs = () => Date.now() - handlerStartedAt

  try {
    if (!session.tenantId) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session tenant is required'), { status: 401 })
    }

    if (!session.role) {
      return NextResponse.json(errorResponse('SESSION_INVALID', 'Session role is required'), { status: 401 })
    }

    const contractId = params?.contractId
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json(errorResponse('CONTRACT_ID_REQUIRED', 'Contract ID is required'), { status: 400 })
    }

    const artifact = request.nextUrl.searchParams.get('artifact')
    if (artifact !== 'signed_document' && artifact !== 'completion_certificate') {
      return NextResponse.json(
        errorResponse('INVALID_ARTIFACT', 'artifact must be signed_document or completion_certificate'),
        { status: 400 }
      )
    }

    const contractSignatoryService = getContractSignatoryService()
    const result = await contractSignatoryService.downloadFinalSigningArtifact({
      tenantId: session.tenantId,
      contractId,
      actorEmployeeId: session.employeeId,
      actorRole: session.role,
      artifact,
    })

    const normalizedBytes = new Uint8Array(result.fileBytes)
    const fileBlob = new Blob([normalizedBytes], { type: result.contentType })

    logger.info('FINAL_ARTIFACT_ROUTE_TRACE', {
      phase: 'response_ready',
      tenantId: session.tenantId,
      contractId,
      artifact,
      elapsedMs: elapsedMs(),
      fileSizeBytes: normalizedBytes.byteLength,
      contentType: result.contentType,
    })

    return new NextResponse(fileBlob, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('Final signing artifact download failed', {
      error: String(error),
      errorCode: isAppError(error) ? error.code : 'INTERNAL_ERROR',
      elapsedMs: elapsedMs(),
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to download final signing artifact'
    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
