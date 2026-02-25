import type { ApiError } from '@/core/http/response'

export type AdminApiMeta = {
  cursor?: string | null
  limit?: number
  total?: number
  [key: string]: unknown
}

export type AdminApiResponse<T> = {
  ok: boolean
  data: T | null
  error: ApiError | null
  meta: AdminApiMeta
}

export const adminOkResponse = <T>(data: T, meta: AdminApiMeta = {}): AdminApiResponse<T> => ({
  ok: true,
  data,
  error: null,
  meta,
})

export const adminErrorResponse = (
  code: string,
  message: string,
  meta: AdminApiMeta = {},
  options?: {
    errors?: Array<{ field: string; message: string }>
    retryAfter?: number
    correlationId?: string
  }
): AdminApiResponse<never> => ({
  ok: false,
  data: null,
  error: {
    code,
    message,
    ...(options?.errors && { errors: options.errors }),
    ...(options?.retryAfter && { retryAfter: options.retryAfter }),
    ...(options?.correlationId && { correlationId: options.correlationId }),
  },
  meta,
})
