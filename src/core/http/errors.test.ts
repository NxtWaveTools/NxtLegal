/**
 * Unit tests for HTTP error classes and utility functions.
 *
 * Tests the error class hierarchy, status codes, metadata preservation,
 * and type guard / utility functions that all API route handlers rely on.
 */

import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
  TenantError,
  BusinessRuleError,
  isAppError,
  getErrorStatusCode,
  getErrorCode,
  getErrorMessage,
} from '@/core/http/errors'

// ─── Class hierarchy ──────────────────────────────────────────────────────────

describe('AppError class hierarchy', () => {
  it('AuthenticationError has statusCode 401', () => {
    const err = new AuthenticationError('AUTH_ERROR', 'Test auth error')
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('AUTH_ERROR')
    expect(err.message).toBe('Test auth error')
    expect(err instanceof AppError).toBe(true)
    expect(err instanceof Error).toBe(true)
  })

  it('AuthorizationError has statusCode 403', () => {
    const err = new AuthorizationError('FORBIDDEN', 'Not allowed')
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
  })

  it('ValidationError has statusCode 400 and structured errors', () => {
    const fieldErrors = [{ field: 'email', message: 'Invalid email' }]
    const err = new ValidationError('Bad input', fieldErrors)
    expect(err.statusCode).toBe(400)
    expect(err.errors).toEqual(fieldErrors)
  })

  it('NotFoundError constructs message from resource and identifier', () => {
    const err = new NotFoundError('Contract', 'contract-123')
    expect(err.statusCode).toBe(404)
    expect(err.message).toContain('Contract')
    expect(err.message).toContain('contract-123')
  })

  it('NotFoundError works without identifier', () => {
    const err = new NotFoundError('Department')
    expect(err.message).toContain('Department')
    expect(err.statusCode).toBe(404)
  })

  it('ConflictError has statusCode 409', () => {
    const err = new ConflictError('Already exists')
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('RESOURCE_CONFLICT')
  })

  it('DatabaseError has statusCode 500 and preserves originalError', () => {
    const original = new Error('Connection refused')
    const err = new DatabaseError('DB failed', original)
    expect(err.statusCode).toBe(500)
    expect(err.originalError).toBe(original)
  })

  it('ExternalServiceError has statusCode 502 and preserves service name', () => {
    const err = new ExternalServiceError('ZohoSign', 'Envelope creation failed')
    expect(err.statusCode).toBe(502)
    expect(err.service).toBe('ZohoSign')
  })

  it('RateLimitError has statusCode 429 and preserves retryAfter', () => {
    const err = new RateLimitError(120)
    expect(err.statusCode).toBe(429)
    expect(err.retryAfter).toBe(120)
  })

  it('TenantError has statusCode 403', () => {
    const err = new TenantError('Tenant mismatch')
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('TENANT_ERROR')
  })

  it('BusinessRuleError has statusCode 422 and custom code', () => {
    const err = new BusinessRuleError('SIGNATORY_ASSIGN_INVALID_STATUS', 'Cannot assign signatories')
    expect(err.statusCode).toBe(422)
    expect(err.code).toBe('SIGNATORY_ASSIGN_INVALID_STATUS')
  })

  it('isOperational is true for all app errors', () => {
    const errors = [
      new AuthenticationError(),
      new AuthorizationError(),
      new ValidationError('bad'),
      new NotFoundError('X'),
      new ConflictError(),
      new DatabaseError(),
      new ExternalServiceError('svc'),
      new RateLimitError(),
      new TenantError(),
      new BusinessRuleError('CODE', 'msg'),
    ]

    for (const err of errors) {
      expect(err.isOperational).toBe(true)
    }
  })
})

// ─── Metadata preservation  ──────────────────────────────────────────────────

describe('AppError metadata', () => {
  it('stores optional metadata', () => {
    const err = new AuthorizationError('FORBIDDEN', 'Denied', { contractId: 'c-1', role: 'POC' })
    expect(err.metadata).toMatchObject({ contractId: 'c-1', role: 'POC' })
  })

  it('NotFoundError includes resource in metadata', () => {
    const err = new NotFoundError('Contract', 'c-1')
    expect(err.metadata).toMatchObject({ resource: 'Contract', identifier: 'c-1' })
  })

  it('ExternalServiceError merges service into metadata', () => {
    const err = new ExternalServiceError('Brevo', 'Send failed', undefined, { templateId: 42 })
    expect(err.metadata).toMatchObject({ service: 'Brevo', templateId: 42 })
  })
})

// ─── Type guard: isAppError ───────────────────────────────────────────────────

describe('isAppError type guard', () => {
  it('returns true for all AppError subclasses', () => {
    expect(isAppError(new AuthenticationError())).toBe(true)
    expect(isAppError(new AuthorizationError())).toBe(true)
    expect(isAppError(new BusinessRuleError('X', 'Y'))).toBe(true)
  })

  it('returns false for plain Error', () => {
    expect(isAppError(new Error('plain'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isAppError(null)).toBe(false)
    expect(isAppError(undefined)).toBe(false)
    expect(isAppError('string error')).toBe(false)
    expect(isAppError(42)).toBe(false)
  })
})

// ─── Utility helpers ─────────────────────────────────────────────────────────

describe('getErrorStatusCode', () => {
  it('extracts status from AppError', () => {
    expect(getErrorStatusCode(new NotFoundError('X'))).toBe(404)
    expect(getErrorStatusCode(new RateLimitError())).toBe(429)
  })

  it('defaults to 500 for unknown errors', () => {
    expect(getErrorStatusCode(new Error('oops'))).toBe(500)
    expect(getErrorStatusCode(null)).toBe(500)
  })
})

describe('getErrorCode', () => {
  it('extracts code from AppError', () => {
    expect(getErrorCode(new BusinessRuleError('MY_CODE', 'msg'))).toBe('MY_CODE')
  })

  it('returns INTERNAL_ERROR for plain Error', () => {
    expect(getErrorCode(new Error('boom'))).toBe('INTERNAL_ERROR')
  })

  it('returns UNKNOWN_ERROR for non-error values', () => {
    expect(getErrorCode(null)).toBe('UNKNOWN_ERROR')
    expect(getErrorCode(undefined)).toBe('UNKNOWN_ERROR')
  })
})

describe('getErrorMessage', () => {
  it('extracts message from Error', () => {
    expect(getErrorMessage(new Error('something failed'))).toBe('something failed')
  })

  it('returns string value for string errors', () => {
    expect(getErrorMessage('raw string error')).toBe('raw string error')
  })

  it('returns default for unknown values', () => {
    expect(getErrorMessage(null)).toBe('An unknown error occurred')
    expect(getErrorMessage(42)).toBe('An unknown error occurred')
  })
})

// ─── Security: error names are set correctly (not "Error") ───────────────────

describe('Error name discrimination', () => {
  it('each subclass reports its own name', () => {
    expect(new AuthenticationError().name).toBe('AuthenticationError')
    expect(new AuthorizationError().name).toBe('AuthorizationError')
    expect(new NotFoundError('X').name).toBe('NotFoundError')
    expect(new BusinessRuleError('C', 'M').name).toBe('BusinessRuleError')
    expect(new TenantError().name).toBe('TenantError')
  })
})
