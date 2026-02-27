import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/core/http/with-auth'
import { errorResponse } from '@/core/http/response'
import { isAppError } from '@/core/http/errors'
import { getContractUploadService } from '@/core/registry/service-registry'
import { logger } from '@/core/infra/logging/logger'

const htmlRenderableSpreadsheetExtensions = new Set(['xlsx', 'xls'])
const htmlRenderableTextExtensions = new Set(['csv', 'tsv', 'txt'])
const htmlRenderableLegacyWordExtensions = new Set(['doc'])

const resolveFileExtension = (fileName: string): string => {
  const normalizedFileName = fileName.trim().toLowerCase()
  const lastDotIndex = normalizedFileName.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === normalizedFileName.length - 1) {
    return ''
  }

  return normalizedFileName.slice(lastDotIndex + 1)
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const wrapPreviewHtml = (bodyContent: string): string =>
  `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{font-family:Inter,Segoe UI,Arial,sans-serif;padding:24px;color:#111827;line-height:1.5;background:#f9fafb;}p{margin:0 0 10px;}table{border-collapse:collapse;width:100%;background:#ffffff;}td,th{border:1px solid #d1d5db;padding:6px;vertical-align:top;font-size:12px;}th{background:#f3f4f6;font-weight:600;}img{max-width:100%;height:auto;}h1,h2,h3,h4,h5,h6{margin:16px 0 8px;}section{margin-bottom:24px;}.sheetTitle{font-size:14px;font-weight:700;margin-bottom:8px;}pre{white-space:pre-wrap;word-break:break-word;background:#ffffff;border:1px solid #d1d5db;border-radius:8px;padding:12px;font-size:12px;}</style></head><body>${bodyContent}</body></html>`

const toHtmlPreBlock = (text: string): string => `<section><pre>${escapeHtml(text)}</pre></section>`

const GETHandler = withAuth(async (request: NextRequest, { session, params }) => {
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

    const documentId = request.nextUrl.searchParams.get('documentId')?.trim() || undefined

    const contractUploadService = getContractUploadService()
    const { signedUrl, fileName } = await contractUploadService.createSignedDownloadUrl({
      contractId,
      tenantId: session.tenantId,
      requestorEmployeeId: session.employeeId,
      requestorRole: session.role,
      documentId,
    })

    const upstream = await fetch(signedUrl)
    if (!upstream.ok) {
      return NextResponse.json(errorResponse('PREVIEW_FETCH_FAILED', 'Failed to fetch preview document'), {
        status: 502,
      })
    }

    const buffer = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const normalizedContentType = contentType.toLowerCase()
    const fileExtension = resolveFileExtension(fileName)
    const renderMode = request.nextUrl.searchParams.get('render')
    const isDocx =
      normalizedContentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
      fileExtension === 'docx'
    const isLegacyDoc =
      htmlRenderableLegacyWordExtensions.has(fileExtension) || normalizedContentType.includes('application/msword')
    const isSpreadsheet =
      htmlRenderableSpreadsheetExtensions.has(fileExtension) ||
      normalizedContentType.includes('spreadsheetml') ||
      normalizedContentType.includes('ms-excel')
    const isPlainText =
      htmlRenderableTextExtensions.has(fileExtension) ||
      normalizedContentType.startsWith('text/') ||
      normalizedContentType.includes('csv')
    const isPptx =
      fileExtension === 'pptx' ||
      normalizedContentType.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    const isLegacyPpt = fileExtension === 'ppt' || normalizedContentType.includes('application/vnd.ms-powerpoint')

    if (renderMode === 'html' && isDocx) {
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({
        buffer: Buffer.from(buffer),
      })

      const html = wrapPreviewHtml(result.value)

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    if (renderMode === 'html' && isSpreadsheet) {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer', cellDates: true })

      const maxRows = 300
      const maxColumns = 30
      const sections = workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        const rawRows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(worksheet, {
          header: 1,
          defval: '',
          blankrows: false,
        })

        const boundedRows = rawRows.slice(0, maxRows).map((row) => row.slice(0, maxColumns))

        if (boundedRows.length === 0) {
          return `<section><div class="sheetTitle">${escapeHtml(sheetName)}</div><p>No rows found in this sheet.</p></section>`
        }

        const tableRows = boundedRows
          .map((row, rowIndex) => {
            const cells = row
              .map((cell) => {
                const cellValue = cell instanceof Date ? cell.toISOString() : String(cell ?? '')
                const escapedValue = escapeHtml(cellValue)
                return rowIndex === 0 ? `<th>${escapedValue}</th>` : `<td>${escapedValue}</td>`
              })
              .join('')

            return `<tr>${cells}</tr>`
          })
          .join('')

        return `<section><div class="sheetTitle">${escapeHtml(sheetName)}</div><table>${tableRows}</table></section>`
      }).join('')

      const html = wrapPreviewHtml(sections)

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    if (renderMode === 'html' && isPlainText) {
      const text = new TextDecoder('utf-8').decode(buffer)
      const html = wrapPreviewHtml(toHtmlPreBlock(text))

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    if (renderMode === 'html' && isLegacyDoc) {
      const wordExtractorModule = await import('word-extractor')
      const WordExtractor = (wordExtractorModule.default ?? wordExtractorModule) as {
        new (): {
          extract: (input: Buffer) => Promise<{
            getBody: () => string
            getHeaders: () => string
            getFooters?: () => string
          }>
        }
      }

      const extractor = new WordExtractor()
      const extractedDoc = await extractor.extract(Buffer.from(buffer))
      const body = extractedDoc.getBody().trim()
      const headers = extractedDoc.getHeaders().trim()
      const footers = extractedDoc.getFooters?.().trim() ?? ''
      const text = [headers, body, footers].filter((section) => section.length > 0).join('\n\n')
      const html = wrapPreviewHtml(toHtmlPreBlock(text || 'No readable text found in this .doc file.'))

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    if (renderMode === 'html' && isPptx) {
      const officeParserModule = await import('officeparser')
      const parseOffice =
        (
          officeParserModule as {
            parseOffice?: (input: Buffer, config?: Record<string, unknown>) => Promise<{ toText: () => string }>
          }
        ).parseOffice ??
        (
          officeParserModule as {
            default?: {
              parseOffice?: (input: Buffer, config?: Record<string, unknown>) => Promise<{ toText: () => string }>
            }
          }
        ).default?.parseOffice

      if (!parseOffice) {
        throw new Error('PPTX parser is unavailable')
      }

      const ast = await parseOffice(Buffer.from(buffer), {
        newlineDelimiter: '\n',
        ignoreNotes: false,
      })

      const pptxText = typeof ast.toText === 'function' ? ast.toText() : ''
      const html = wrapPreviewHtml(toHtmlPreBlock(pptxText || 'No readable text found in this .pptx file.'))

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    if (renderMode === 'html' && isLegacyPpt) {
      const pptToTextModule = await import('ppt-to-text')
      const pptToText = (pptToTextModule.default ?? pptToTextModule) as {
        extractText: (input: Buffer) => string
      }

      const pptText = pptToText.extractText(Buffer.from(buffer))
      const html = wrapPreviewHtml(toHtmlPreBlock(pptText || 'No readable text found in this .ppt file.'))

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    logger.warn('Contract preview generation failed', {
      error: String(error),
      errorCode: isAppError(error) ? error.code : 'INTERNAL_ERROR',
    })

    const status = isAppError(error) ? error.statusCode : 500
    const code = isAppError(error) ? error.code : 'INTERNAL_ERROR'
    const message = isAppError(error) ? error.message : 'Failed to generate contract preview'

    return NextResponse.json(errorResponse(code, message), { status })
  }
})

export const GET = GETHandler
