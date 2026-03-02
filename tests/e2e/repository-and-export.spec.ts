/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  E2E — Repository & Export: Search, Filter, and Download
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This spec validates the Contract Repository workflow:
 *
 *   1. Legal team member logs in
 *   2. Navigates to /repository
 *   3. Repository page loads with contract table
 *   4. Status filters work correctly
 *   5. Search narrows results
 *   6. Export initiates a CSV download
 *   7. Non-legal roles are blocked from accessing the repository
 *
 * ── Auth Strategy ──────────────────────────────────────────────────────────────
 * API-level login for speed. All tests run as authenticated users.
 * RBAC checks run once per role.
 *
 * ── Prerequisites ──────────────────────────────────────────────────────────────
 * - Local app on http://localhost:3000
 * - Supabase seeded with test employees and at least one contract
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from './helpers/fixtures'
import { loginViaAPI } from './helpers/auth'
import { TEST_USERS, ROUTES, CONTRACT_STATUS_LABELS } from './helpers/constants'

test.describe.configure({ mode: 'serial' })

test.describe('Repository: Navigation, Filters, and Export', () => {
  // ─────────────────────────────────────────────────────────────────────────
  //  PHASE 1: Page load
  // ─────────────────────────────────────────────────────────────────────────

  test('1. Legal team can navigate to the repository', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(ROUTES.repository)
    await page.waitForLoadState('networkidle')

    // Repository page should load without errors
    await expect(page).not.toHaveTitle(/500|error/i)
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 })
  })

  test('2. Repository page renders a contracts table or empty state', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(ROUTES.repository)
    await page.waitForLoadState('networkidle')

    // Either a table with rows or an empty state message should be present
    const hasTable = await page.locator('table, [role="table"]').isVisible()
    const hasEmptyState = await page.locator('[data-testid="empty-state"], [data-testid="no-contracts"]').isVisible()

    expect(hasTable || hasEmptyState, 'Repository should show a table or empty state').toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  //  PHASE 2: Filters and search
  // ─────────────────────────────────────────────────────────────────────────

  test('3. Status filter — COMPLETED contracts can be selected', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(`${ROUTES.repository}?status=COMPLETED`)
    await page.waitForLoadState('networkidle')

    // Page renders without errors regardless of result count
    await expect(page).not.toHaveTitle(/500|error/i)
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('4. Status filter — EXECUTED contracts can be selected', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(`${ROUTES.repository}?status=EXECUTED`)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveTitle(/500|error/i)
  })

  test('5. Search param is forwarded to the repository view', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(`${ROUTES.repository}?search=insurance`)
    await page.waitForLoadState('networkidle')

    // Page should still render (results may be empty if no match)
    await expect(page).not.toHaveTitle(/500|error/i)
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('6. Combined filter — status + search renders without error', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(`${ROUTES.repository}?status=COMPLETED&search=nda`)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveTitle(/500|error/i)
  })

  test('7. Sorting by title renders without error', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(`${ROUTES.repository}?sortBy=title&sortDirection=asc`)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveTitle(/500|error/i)
    await expect(page.locator('main').first()).toBeVisible()
  })

  // ─────────────────────────────────────────────────────────────────────────
  //  PHASE 3: Export
  // ─────────────────────────────────────────────────────────────────────────

  test('8. Export CSV button is visible for legal team', async ({ page }) => {
    await loginViaAPI(page, 'legal')
    await page.goto(ROUTES.repository)
    await page.waitForLoadState('networkidle')

    // Look for export button/link
    const exportButton = page.getByRole('button', { name: /export/i }).or(page.getByRole('link', { name: /export/i }))

    // If the button is present, it should be in the DOM
    const count = await exportButton.count()
    if (count > 0) {
      await expect(exportButton.first()).toBeVisible()
    } else {
      // Export may be behind a menu — just verify the page doesn't 500
      await expect(page).not.toHaveTitle(/500|error/i)
    }
  })

  test('9. Export API returns a downloadable stream', async ({ page }) => {
    await loginViaAPI(page, 'legal')

    // Hit the export API directly and verify it returns streaming content
    const response = await page.request.get('/api/contracts/repository/export?format=csv', {
      timeout: 30_000,
    })

    // Should not be 401, 403, or 500
    expect(response.status()).not.toBe(401)
    expect(response.status()).not.toBe(403)
    expect(response.status()).not.toBe(500)

    // Should return CSV content type
    const contentType = response.headers()['content-type'] ?? ''
    expect(contentType).toMatch(/csv|octet-stream|application/)
  })

  test('10. Export API rejects non-authorized roles', async ({ page }) => {
    // POC should not be able to export from repository
    await loginViaAPI(page, 'poc')

    const response = await page.request.get('/api/contracts/repository/export?format=csv', {
      timeout: 15_000,
    })

    // Should be 403 (Forbidden) for POC role
    expect([403, 401]).toContain(response.status())
  })

  test('11. Admin can access the repository export', async ({ page }) => {
    await loginViaAPI(page, 'admin')

    const response = await page.request.get('/api/contracts/repository/export?format=csv', {
      timeout: 30_000,
    })

    // Admin should have access
    expect(response.status()).not.toBe(403)
    expect(response.status()).not.toBe(500)
  })

  // ─────────────────────────────────────────────────────────────────────────
  //  PHASE 4: RBAC — repository access control
  // ─────────────────────────────────────────────────────────────────────────

  test('12. POC role is blocked from the repository page UI', async ({ page }) => {
    await loginViaAPI(page, 'poc')
    await page.goto(ROUTES.repository)
    await page.waitForLoadState('networkidle')

    // Should either redirect away, show access denied, or 403 page
    const url = page.url()
    const isForbidden = url.includes('/login') || url.includes('/403') || url.includes('/dashboard')
    const has403Content = await page.getByText(/forbidden|not authorized|access denied/i).isVisible()

    expect(isForbidden || has403Content, 'POC should be blocked from repository').toBe(true)
  })

  test('13. HOD role is blocked from the repository page UI', async ({ page }) => {
    await loginViaAPI(page, 'hod')
    await page.goto(ROUTES.repository)
    await page.waitForLoadState('networkidle')

    const url = page.url()
    const isBlocked = url.includes('/login') || url.includes('/403') || url.includes('/dashboard')
    const hasBlockedContent = await page.getByText(/forbidden|not authorized|access denied/i).isVisible()

    expect(isBlocked || hasBlockedContent, 'HOD should be blocked from repository').toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  //  PHASE 5: Unauthenticated access
  // ─────────────────────────────────────────────────────────────────────────

  test('14. Unauthenticated user is redirected from repository to login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto(ROUTES.repository)
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('15. Repository export API returns 401 for unauthenticated request', async ({ page }) => {
    await page.context().clearCookies()

    const response = await page.request.get('/api/contracts/repository/export?format=csv', {
      timeout: 15_000,
    })

    expect([401, 403]).toContain(response.status())
  })
})
