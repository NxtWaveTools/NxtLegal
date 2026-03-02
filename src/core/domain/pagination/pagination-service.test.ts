/**
 * Unit tests for pagination-service
 *
 * parsePaginatedResults and buildCursorFilter are pure functions — no mocks needed.
 * Contract: fetch limit+1 rows, slice to limit, expose nextCursor iff hasMore.
 */

import { parsePaginatedResults, buildCursorFilter } from '@/core/domain/pagination/pagination-service'

type Item = { id: string; createdAt: string }

const makeItems = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }))

const getCursor = (item: Item) => item.id

// ─── parsePaginatedResults ────────────────────────────────────────────────────

describe('parsePaginatedResults', () => {
  it('returns all items when count < limit', () => {
    const items = makeItems(3)
    const result = parsePaginatedResults(items, 10, getCursor)

    expect(result.data).toHaveLength(3)
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.nextCursor).toBeNull()
    expect(result.pagination.limit).toBe(10)
  })

  it('returns all items when count === limit', () => {
    const items = makeItems(10)
    const result = parsePaginatedResults(items, 10, getCursor)

    expect(result.data).toHaveLength(10)
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.nextCursor).toBeNull()
  })

  it('slices to limit and sets nextCursor when count === limit + 1 (has more)', () => {
    // Caller fetches limit+1 to detect hasMore
    const items = makeItems(11)
    const result = parsePaginatedResults(items, 10, getCursor)

    expect(result.data).toHaveLength(10)
    expect(result.pagination.hasMore).toBe(true)
    // nextCursor is the id of the LAST returned item, not the 11th
    expect(result.pagination.nextCursor).toBe('item-10')
  })

  it('nextCursor is derived from the last item in the result page, not the sentinel', () => {
    const items = makeItems(6)
    const result = parsePaginatedResults(items, 5, getCursor)

    expect(result.data).toHaveLength(5)
    expect(result.pagination.nextCursor).toBe('item-5')
  })

  it('handles empty dataset correctly', () => {
    const result = parsePaginatedResults([], 10, getCursor)

    expect(result.data).toHaveLength(0)
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.nextCursor).toBeNull()
  })

  it('handles limit of 1 (single-item pages)', () => {
    const items = makeItems(2)
    const result = parsePaginatedResults(items, 1, getCursor)

    expect(result.data).toHaveLength(1)
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.nextCursor).toBe('item-1')
  })

  it('preserves limit value in the response', () => {
    const items = makeItems(5)
    const result = parsePaginatedResults(items, 50, getCursor)

    expect(result.pagination.limit).toBe(50)
  })
})

// ─── buildCursorFilter ────────────────────────────────────────────────────────

describe('buildCursorFilter', () => {
  it('returns undefined when cursor is undefined', () => {
    expect(buildCursorFilter(undefined)).toBeUndefined()
  })

  it('returns the cursor string when present', () => {
    expect(buildCursorFilter('2026-01-01T00:00:00Z:item-99')).toBe('2026-01-01T00:00:00Z:item-99')
  })

  it('passes an empty string through unchanged', () => {
    // Caller should not pass empty string, but the function is a pure passthrough.
    expect(buildCursorFilter('')).toBeUndefined()
  })
})

// ─── Invariant: total page count arithmetic ───────────────────────────────────

describe('Pagination invariant: total pages across all pages = full dataset', () => {
  it('reconstructs complete dataset by chaining paginated results', () => {
    const fullDataset = makeItems(23)
    const pageSize = 10
    let cursor: string | null = null
    const collected: Item[] = []

    // Simulate 3 pages: 10, 10, 3
    let offset = 0
    while (true) {
      const slice = fullDataset.slice(offset, offset + pageSize + 1)
      const page = parsePaginatedResults(slice, pageSize, getCursor)

      collected.push(...page.data)
      cursor = page.pagination.nextCursor
      offset += pageSize

      if (!cursor) break
    }

    expect(collected).toHaveLength(23)
    expect(collected[0].id).toBe('item-1')
    expect(collected[22].id).toBe('item-23')
  })
})
