import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { withAuth } from '@/core/http/with-auth'
import { appConfig } from '@/core/config/app-config'
import { adminErrorResponse } from '@/core/http/admin-response'
import { isAppError } from '@/core/http/errors'
import { auditViewerExportQuerySchema } from '@/core/domain/admin/schemas'
import { getAuditViewerService } from '@/core/registry/service-registry'
import {
  formatAuditAction,
  formatAuditActor,
  formatAuditDate,
  formatAuditMetadataEntries,
  formatAuditResource,
  type AuditLogFormatInput,
} from '@/modules/admin/lib/audit-log-formatters'

const header = [
  'id',
  'createdAt',
  'createdAtFormatted',
  'actor',
  'action',
  'actionLabel',
  'resource',
  'eventType',
  'noteText',
  'metadataSummary',
]

const escaped = (value: unknown): string => {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const normalized = raw.replace(/"/g, '""')
  return `"${normalized}"`
}

const toCsvRow = (row: AuditLogFormatInput): string => {
  const metadataSummary = formatAuditMetadataEntries(row)
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join(' | ')
  const resource = formatAuditResource(row)

  return [
    row.id,
    row.createdAt,
    formatAuditDate(row.createdAt),
    formatAuditActor(row),
    row.action,
    formatAuditAction(row.action),
    resource.display,
    row.eventType ?? '',
    row.noteText ?? '',
    metadataSummary,
  ]
    .map((value) => escaped(value))
    .join(',')
}

const GETHandler = withAuth(async (request: NextRequest, { session }) => {
  try {
    if (!appConfig.features.enableAdminGovernance) {
      return NextResponse.json(adminErrorResponse('FEATURE_DISABLED', 'Admin governance module is disabled'), {
        status: 404,
      })
    }

    const query = auditViewerExportQuerySchema.parse({
      action: request.nextUrl.searchParams.get('action') ?? undefined,
      resourceType: request.nextUrl.searchParams.get('resourceType') ?? undefined,
      userId: request.nextUrl.searchParams.get('userId') ?? undefined,
      query: request.nextUrl.searchParams.get('query') ?? undefined,
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })

    const auditViewerService = getAuditViewerService()
    const encoder = new TextEncoder()
    const filters = {
      action: query.action,
      resourceType: query.resourceType,
      userId: query.userId,
      query: query.query,
      from: query.from,
      to: query.to,
    }

    let isAborted = request.signal.aborted
    const abortListener = () => {
      isAborted = true
    }
    request.signal.addEventListener('abort', abortListener)

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          if (isAborted) {
            controller.close()
            return
          }

          controller.enqueue(encoder.encode('\uFEFF'))
          controller.enqueue(encoder.encode(`${header.join(',')}\n`))

          let cursor = query.cursor

          while (true) {
            if (isAborted) {
              break
            }

            const chunk = await auditViewerService.listLogsExportChunk({
              session,
              filters,
              cursor,
              limit: query.limit,
            })

            if (isAborted) {
              break
            }

            if (chunk.items.length === 0) {
              break
            }

            const csvChunk = `${chunk.items.map((item) => toCsvRow(item)).join('\n')}\n`
            controller.enqueue(encoder.encode(csvChunk))

            if (!chunk.cursor) {
              break
            }

            cursor = chunk.cursor
          }

          controller.close()
        } catch (streamError) {
          const isAbortError =
            isAborted ||
            (streamError instanceof DOMException && streamError.name === 'AbortError') ||
            (streamError instanceof Error && streamError.name === 'AbortError')

          if (isAbortError) {
            try {
              controller.close()
            } catch {
              return
            }
            return
          }

          controller.error(streamError)
        } finally {
          request.signal.removeEventListener('abort', abortListener)
        }
      },
      cancel: () => {
        isAborted = true
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-logs.csv"',
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(adminErrorResponse('VALIDATION_ERROR', 'Invalid audit export query parameters'), {
        status: 400,
      })
    }

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to export audit logs'
    return NextResponse.json(adminErrorResponse(code, message), { status })
  }
})

export const GET = GETHandler
