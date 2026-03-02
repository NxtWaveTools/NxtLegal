/**
 * Unit tests for HTTP response formatters.
 *
 * okResponse and errorResponse are consumed by every API route handler.
 * Tests validate the exact shape expected by the API client.
 */

import { okResponse, errorResponse } from '@/core/http/response'

describe('okResponse', () => {
  it('sets ok: true with data payload', () => {
    const result = okResponse({ contracts: [], total: 0 })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ contracts: [], total: 0 })
    expect(result.error).toBeUndefined()
  })

  it('works with primitive data types', () => {
    expect(okResponse(42).data).toBe(42)
    expect(okResponse('hello').data).toBe('hello')
    expect(okResponse(true).data).toBe(true)
  })

  it('works with null data', () => {
    const result = okResponse(null)
    expect(result.ok).toBe(true)
    expect(result.data).toBeNull()
  })

  it('does not include error field', () => {
    expect(okResponse({ x: 1 }).error).toBeUndefined()
  })
})

describe('errorResponse', () => {
  it('sets ok: false with error code and message', () => {
    const result = errorResponse('NOT_FOUND', 'Contract not found')
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('NOT_FOUND')
    expect(result.error?.message).toBe('Contract not found')
    expect(result.data).toBeUndefined()
  })

  it('includes structured field errors when provided', () => {
    const fieldErrors = [{ field: 'email', message: 'Invalid format' }]
    const result = errorResponse('VALIDATION_ERROR', 'Bad input', { errors: fieldErrors })
    expect(result.error?.errors).toEqual(fieldErrors)
  })

  it('includes retryAfter when provided', () => {
    const result = errorResponse('RATE_LIMIT', 'Too many requests', { retryAfter: 60 })
    expect(result.error?.retryAfter).toBe(60)
  })

  it('includes correlationId when provided', () => {
    const result = errorResponse('SERVER_ERROR', 'Internal', { correlationId: 'corr-abc-123' })
    expect(result.error?.correlationId).toBe('corr-abc-123')
  })

  it('omits optional fields when not provided', () => {
    const result = errorResponse('CODE', 'Message')
    expect(result.error?.errors).toBeUndefined()
    expect(result.error?.retryAfter).toBeUndefined()
    expect(result.error?.correlationId).toBeUndefined()
  })

  it('does not include data field', () => {
    expect(errorResponse('ERR', 'msg').data).toBeUndefined()
  })
})

describe('Response shape contract', () => {
  it('ok: true and ok: false responses are mutually exclusive data/error shapes', () => {
    const successShape = okResponse({ items: [] })
    const errorShape = errorResponse('ERR', 'msg')

    // Success has data, no error
    expect('data' in successShape).toBe(true)
    expect(successShape.error).toBeUndefined()

    // Error has error, no data
    expect('error' in errorShape).toBe(true)
    expect(errorShape.data).toBeUndefined()
  })
})
