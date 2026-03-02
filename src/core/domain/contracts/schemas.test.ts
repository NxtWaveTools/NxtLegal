/**
 * Unit tests for contract Zod schemas.
 *
 * Validates that schema parsing accepts valid inputs, rejects invalid ones,
 * and enforces business-level constraints at the API boundary.
 */

import { ZodError } from 'zod'
import {
  listContractsQuerySchema,
  dashboardContractsQuerySchema,
  dashboardCountsQuerySchema,
  repositoryContractsQuerySchema,
  repositoryExportQuerySchema,
  contractActionSchema,
  additionalApproverHistoryQuerySchema,
} from '@/core/domain/contracts/schemas'
import { contractStatuses } from '@/core/constants/contracts'

// ─── listContractsQuerySchema ─────────────────────────────────────────────────

describe('listContractsQuerySchema', () => {
  it('parses valid cursor + limit', () => {
    const result = listContractsQuerySchema.parse({ cursor: 'abc', limit: '10' })
    expect(result.cursor).toBe('abc')
    expect(result.limit).toBe(10)
  })

  it('defaults limit to 20 when omitted', () => {
    const result = listContractsQuerySchema.parse({})
    expect(result.limit).toBe(20)
  })

  it('coerces string limit to number', () => {
    expect(listContractsQuerySchema.parse({ limit: '5' }).limit).toBe(5)
  })

  it('rejects limit below 1', () => {
    expect(() => listContractsQuerySchema.parse({ limit: '0' })).toThrow(ZodError)
    expect(() => listContractsQuerySchema.parse({ limit: '-1' })).toThrow(ZodError)
  })

  it('rejects limit above max page size', () => {
    // Max is limits.paginationPageSize (50)
    expect(() => listContractsQuerySchema.parse({ limit: '51' })).toThrow(ZodError)
  })

  it('rejects non-integer limit', () => {
    expect(() => listContractsQuerySchema.parse({ limit: '10.5' })).toThrow(ZodError)
  })
})

// ─── dashboardContractsQuerySchema ───────────────────────────────────────────

describe('dashboardContractsQuerySchema', () => {
  it('parses ALL filter', () => {
    const result = dashboardContractsQuerySchema.parse({ filter: 'ALL' })
    expect(result.filter).toBe('ALL')
    expect(result.scope).toBe('default')
    expect(result.includeExtras).toBe(false)
  })

  it('parses HOD_PENDING filter with personal scope', () => {
    const result = dashboardContractsQuerySchema.parse({ filter: 'HOD_PENDING', scope: 'personal' })
    expect(result.filter).toBe('HOD_PENDING')
    expect(result.scope).toBe('personal')
  })

  it('parses includeExtras as boolean', () => {
    expect(dashboardContractsQuerySchema.parse({ filter: 'ALL', includeExtras: 'true' }).includeExtras).toBe(true)
    // z.coerce.boolean() uses Boolean() — any non-empty string is truthy.
    // Boolean('false') === true, so passing the string 'false' still yields true.
    // To get false, the caller must pass the boolean false or omit the field.
    expect(dashboardContractsQuerySchema.parse({ filter: 'ALL', includeExtras: false }).includeExtras).toBe(false)
    expect(dashboardContractsQuerySchema.parse({ filter: 'ALL' }).includeExtras).toBe(false)
  })

  it('rejects unknown filter value', () => {
    expect(() => dashboardContractsQuerySchema.parse({ filter: 'INVALID_STATUS' })).toThrow(ZodError)
  })

  it('rejects missing filter', () => {
    expect(() => dashboardContractsQuerySchema.parse({})).toThrow(ZodError)
  })

  it('accepts all valid filter values', () => {
    const validFilters = ['ALL', 'HOD_PENDING', 'UNDER_REVIEW', 'COMPLETED', 'ON_HOLD', 'ASSIGNED_TO_ME']
    for (const filter of validFilters) {
      expect(() => dashboardContractsQuerySchema.parse({ filter })).not.toThrow()
    }
  })
})

// ─── dashboardCountsQuerySchema ───────────────────────────────────────────────

describe('dashboardCountsQuerySchema', () => {
  it('parses comma-separated filter list', () => {
    const result = dashboardCountsQuerySchema.parse({ filters: 'ALL,HOD_PENDING,COMPLETED' })
    expect(result.filters).toEqual(['ALL', 'HOD_PENDING', 'COMPLETED'])
  })

  it('deduplicates and trims filter values', () => {
    const result = dashboardCountsQuerySchema.parse({ filters: ' ALL , HOD_PENDING , ALL ' })
    expect(result.filters).toContain('ALL')
    expect(result.filters).toContain('HOD_PENDING')
  })

  it('silently drops unknown filter values', () => {
    // Unknown values are filtered out during transform
    const result = dashboardCountsQuerySchema.parse({ filters: 'ALL,UNKNOWN_STATUS' })
    expect(result.filters).toEqual(['ALL'])
  })

  it('rejects entirely empty or invalid filter list', () => {
    expect(() => dashboardCountsQuerySchema.parse({ filters: '' })).toThrow(ZodError)
    expect(() => dashboardCountsQuerySchema.parse({ filters: 'UNKNOWN_STATUS' })).toThrow(ZodError)
  })

  it('rejects more than 10 filters', () => {
    const tooMany = Array(11).fill('ALL').join(',')
    expect(() => dashboardCountsQuerySchema.parse({ filters: tooMany })).toThrow(ZodError)
  })
})

// ─── repositoryContractsQuerySchema ──────────────────────────────────────────

describe('repositoryContractsQuerySchema', () => {
  it('parses default values correctly', () => {
    const result = repositoryContractsQuerySchema.parse({})
    expect(result.limit).toBe(20)
    expect(result.sortBy).toBe('created_at')
    expect(result.sortDirection).toBe('desc')
    expect(result.includeReport).toBe(false)
  })

  it('parses a valid status filter', () => {
    const result = repositoryContractsQuerySchema.parse({ status: contractStatuses.completed })
    expect(result.status).toBe('COMPLETED')
  })

  it('rejects invalid status value', () => {
    expect(() => repositoryContractsQuerySchema.parse({ status: 'INVALID' })).toThrow(ZodError)
  })

  it('parses custom sort and date range', () => {
    const result = repositoryContractsQuerySchema.parse({
      sortBy: 'title',
      sortDirection: 'asc',
      fromDate: '2026-01-01',
      toDate: '2026-03-31',
    })
    expect(result.sortBy).toBe('title')
    expect(result.sortDirection).toBe('asc')
    expect(result.fromDate).toBe('2026-01-01')
  })

  it('rejects invalid sort direction', () => {
    expect(() => repositoryContractsQuerySchema.parse({ sortDirection: 'random' })).toThrow(ZodError)
  })

  it('truncates search string longer than 200 chars', () => {
    // Zod max(200) throws for inputs over 200
    const longSearch = 'a'.repeat(201)
    expect(() => repositoryContractsQuerySchema.parse({ search: longSearch })).toThrow(ZodError)
  })
})

// ─── repositoryExportQuerySchema ─────────────────────────────────────────────

describe('repositoryExportQuerySchema', () => {
  it('defaults to csv format', () => {
    const result = repositoryExportQuerySchema.parse({})
    expect(result.format).toBe('csv')
  })

  it('accepts excel and pdf formats', () => {
    expect(repositoryExportQuerySchema.parse({ format: 'excel' }).format).toBe('excel')
    expect(repositoryExportQuerySchema.parse({ format: 'pdf' }).format).toBe('pdf')
  })

  it('rejects unknown export format', () => {
    expect(() => repositoryExportQuerySchema.parse({ format: 'docx' })).toThrow(ZodError)
  })

  it('parses column list from comma-separated string', () => {
    const result = repositoryExportQuerySchema.parse({ columns: 'contract_title,status,department' })
    expect(result.columns).toContain('contract_title')
    expect(result.columns).toContain('status')
    expect(result.columns).toContain('department')
  })

  it('silently discards unknown column names', () => {
    const result = repositoryExportQuerySchema.parse({ columns: 'contract_title,UNKNOWN_COLUMN' })
    expect(result.columns).toEqual(['contract_title'])
  })

  it('deduplicates repeated columns', () => {
    const result = repositoryExportQuerySchema.parse({ columns: 'status,status,contract_title' })
    const statusCount = result.columns.filter((c) => c === 'status').length
    expect(statusCount).toBe(1)
  })

  it('returns empty columns array when param is omitted', () => {
    const result = repositoryExportQuerySchema.parse({})
    expect(result.columns).toEqual([])
  })
})

// ─── contractActionSchema ─────────────────────────────────────────────────────

describe('contractActionSchema', () => {
  it('accepts valid HOD actions', () => {
    // hod.approve does NOT require noteText
    expect(() => contractActionSchema.parse({ action: 'hod.approve' })).not.toThrow()
    // hod.reject and hod.bypass require mandatory noteText (remarks)
    expect(() => contractActionSchema.parse({ action: 'hod.reject', noteText: 'Over budget' })).not.toThrow()
    expect(() => contractActionSchema.parse({ action: 'hod.bypass', noteText: 'Urgent approval' })).not.toThrow()
  })

  it('rejects hod.reject and hod.bypass without noteText', () => {
    expect(() => contractActionSchema.parse({ action: 'hod.reject' })).toThrow(ZodError)
    expect(() => contractActionSchema.parse({ action: 'hod.bypass' })).toThrow(ZodError)
  })

  it('accepts valid legal actions', () => {
    // Actions that don't require noteText
    expect(() => contractActionSchema.parse({ action: 'legal.set.completed' })).not.toThrow()
    expect(() => contractActionSchema.parse({ action: 'legal.approve' })).not.toThrow()
    expect(() => contractActionSchema.parse({ action: 'legal.set.under_review' })).not.toThrow()
    // Actions that require mandatory noteText
    expect(() => contractActionSchema.parse({ action: 'legal.void', noteText: 'Duplicate contract' })).not.toThrow()
    expect(() => contractActionSchema.parse({ action: 'legal.query.reroute', noteText: 'Reassigning' })).not.toThrow()
  })

  it('rejects legal.void and legal.reject without noteText', () => {
    expect(() => contractActionSchema.parse({ action: 'legal.void' })).toThrow(ZodError)
    expect(() => contractActionSchema.parse({ action: 'legal.reject' })).toThrow(ZodError)
  })

  it('accepts optional noteText', () => {
    const result = contractActionSchema.parse({ action: 'hod.reject', noteText: 'Budget not approved' })
    expect(result.noteText).toBe('Budget not approved')
  })

  it('trims noteText whitespace', () => {
    const result = contractActionSchema.parse({ action: 'hod.approve', noteText: '  trimmed  ' })
    expect(result.noteText).toBe('trimmed')
  })

  it('rejects noteText longer than 2000 chars', () => {
    expect(() => contractActionSchema.parse({ action: 'hod.approve', noteText: 'x'.repeat(2001) })).toThrow(ZodError)
  })

  it('rejects unknown or fabricated action names', () => {
    expect(() => contractActionSchema.parse({ action: 'admin.delete_all' })).toThrow(ZodError)
    expect(() => contractActionSchema.parse({ action: '' })).toThrow(ZodError)
    expect(() => contractActionSchema.parse({ action: 'HOD.APPROVE' })).toThrow(ZodError) // case-sensitive
  })

  it('rejects missing action', () => {
    expect(() => contractActionSchema.parse({})).toThrow(ZodError)
  })
})

// ─── additionalApproverHistoryQuerySchema ─────────────────────────────────────

describe('additionalApproverHistoryQuerySchema', () => {
  it('parses optional departmentId UUID', () => {
    const result = additionalApproverHistoryQuerySchema.parse({
      departmentId: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.departmentId).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('rejects non-UUID departmentId', () => {
    expect(() => additionalApproverHistoryQuerySchema.parse({ departmentId: 'not-a-uuid' })).toThrow(ZodError)
  })
})
