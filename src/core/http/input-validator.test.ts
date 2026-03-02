/**
 * Unit tests for input-validator utilities.
 *
 * These are security-critical: they sanitize data entering the system at the
 * API boundary. Test valid paths, invalid paths, and injection attempts.
 */

import {
  validateLoginEmail,
  validateEmail,
  validateTenantId,
  sanitizeRateLimitKey,
  validateMetadata,
} from '@/core/http/input-validator'
import { ZodError } from 'zod'

// ─── validateLoginEmail ───────────────────────────────────────────────────────

describe('validateLoginEmail', () => {
  it('accepts valid nxtwave.co.in emails', () => {
    expect(validateLoginEmail('user@nxtwave.co.in')).toBe('user@nxtwave.co.in')
  })

  it('normalises to lowercase', () => {
    // The schema applies .email() first (no spaces allowed), then .toLowerCase() + .trim().
    // Input must already be a syntactically valid email; transformation handles case only.
    expect(validateLoginEmail('User@NXTWAVE.CO.IN')).toBe('user@nxtwave.co.in')
  })

  it('rejects non-nxtwave domains', () => {
    expect(() => validateLoginEmail('hacker@evil.com')).toThrow(ZodError)
    expect(() => validateLoginEmail('user@gmail.com')).toThrow(ZodError)
  })

  it('rejects invalid email format', () => {
    expect(() => validateLoginEmail('notanemail')).toThrow(ZodError)
    expect(() => validateLoginEmail('@nxtwave.co.in')).toThrow(ZodError)
    expect(() => validateLoginEmail('')).toThrow(ZodError)
  })

  it('rejects SQL/script injection attempts in email field', () => {
    expect(() => validateLoginEmail("' OR '1'='1")).toThrow(ZodError)
    expect(() => validateLoginEmail('<script>alert(1)</script>@nxtwave.co.in')).toThrow(ZodError)
  })
})

// ─── validateEmail (generic, no domain restriction) ──────────────────────────

describe('validateEmail', () => {
  it('accepts any well-formed email', () => {
    expect(validateEmail('external@partner.com')).toBe('external@partner.com')
  })

  it('normalises to lowercase', () => {
    expect(validateEmail('ADMIN@CORP.ORG')).toBe('admin@corp.org')
  })

  it('rejects malformed emails', () => {
    expect(() => validateEmail('bad-email')).toThrow(ZodError)
    expect(() => validateEmail('')).toThrow(ZodError)
  })
})

// ─── validateTenantId ────────────────────────────────────────────────────────

describe('validateTenantId', () => {
  it('accepts valid UUID v4', () => {
    const uuid = '00000000-0000-0000-0000-000000000000'
    expect(validateTenantId(uuid)).toBe(uuid)
  })

  it('rejects non-UUID strings', () => {
    expect(() => validateTenantId('not-a-uuid')).toThrow(ZodError)
    expect(() => validateTenantId('')).toThrow(ZodError)
    expect(() => validateTenantId('12345')).toThrow(ZodError)
  })

  it('rejects injection attempts', () => {
    expect(() => validateTenantId("'; DROP TABLE tenants;--")).toThrow(ZodError)
  })
})

// ─── sanitizeRateLimitKey ─────────────────────────────────────────────────────

describe('sanitizeRateLimitKey', () => {
  it('replaces dots and @ with underscores (only alphanumeric, colon, hyphen, underscore allowed)', () => {
    // The regex /[^a-zA-Z0-9:_-]/ replaces everything outside that set.
    // Dots and @ signs are NOT in the allowed set.
    expect(sanitizeRateLimitKey('ratelimit:login:127.0.0.1:user@nxtwave.co.in')).toBe(
      'ratelimit:login:127_0_0_1:user_nxtwave_co_in'
    )
  })

  it('replaces spaces with underscores', () => {
    expect(sanitizeRateLimitKey('key with space')).toBe('key_with_space')
  })

  it('replaces special characters that could enable injection', () => {
    const key = "ratelimit:login:192.168.1.1:user'; DROP TABLE"
    const sanitized = sanitizeRateLimitKey(key)

    expect(sanitized).not.toContain("'")
    expect(sanitized).not.toContain(' ')
    expect(sanitized).not.toContain(';')
    // Safe chars are preserved
    expect(sanitized).toContain('ratelimit')
    expect(sanitized).toContain('192')
  })

  it('preserves alphanumeric, colon, hyphen, underscore', () => {
    const clean = 'alpha:BETA-123_xyz'
    expect(sanitizeRateLimitKey(clean)).toBe(clean)
  })

  it('handles empty string', () => {
    expect(sanitizeRateLimitKey('')).toBe('')
  })
})

// ─── validateMetadata ────────────────────────────────────────────────────────

describe('validateMetadata', () => {
  it('returns safe object for valid flat metadata', () => {
    const input = { action: 'login', tenantId: 'tenant-1', count: 5, active: true }
    const result = validateMetadata(input)
    expect(result).toEqual(input)
  })

  it('recursively cleans nested objects', () => {
    const input = { outer: { inner: 'value', num: 42 } }
    const result = validateMetadata(input)
    expect(result).toEqual(input)
  })

  it('strips __proto__ pollution attempts', () => {
    const evil = JSON.parse('{"__proto__": {"isAdmin": true}, "safe": "value"}')
    const result = validateMetadata(evil)

    // __proto__ key is skipped — result contains only 'safe'
    expect(Object.keys(result)).not.toContain('__proto__')
    expect(result.safe).toBe('value')
    // Global Object prototype must NOT be polluted
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('strips constructor and prototype keys', () => {
    const input = { constructor: 'attack', prototype: 'attack', normal: 'ok' }
    const result = validateMetadata(input)

    // The keys must NOT be present as own properties on the result.
    // (result.constructor is still accessible as an inherited JS property,
    // but Object.keys() only returns own enumerable properties.)
    expect(Object.keys(result)).not.toContain('constructor')
    expect(Object.keys(result)).not.toContain('prototype')
    expect(result.normal).toBe('ok')
  })

  it('strips array values (only primitives and plain objects allowed)', () => {
    const input = { tags: ['a', 'b'], regular: 'fine' }
    const result = validateMetadata(input as Record<string, unknown>)

    expect(result.tags).toBeUndefined()
    expect(result.regular).toBe('fine')
  })

  it('returns empty object for non-object input', () => {
    expect(validateMetadata(null)).toEqual({})
    expect(validateMetadata(undefined)).toEqual({})
    expect(validateMetadata('string')).toEqual({})
    expect(validateMetadata(42)).toEqual({})
    expect(validateMetadata([])).toEqual({})
  })

  it('returns empty object for empty input', () => {
    expect(validateMetadata({})).toEqual({})
  })
})
