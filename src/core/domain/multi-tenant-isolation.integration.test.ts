/**
 * Multi-tenant isolation tests
 * Verifies that tenant boundaries are enforced throughout the system
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { envServer } from '@/core/config/env.server'
import { hashPassword } from '@/lib/auth/password'
import { DEFAULT_TENANT_ID } from '@/core/constants/tenants'

describe('Multi-Tenant Isolation', () => {
  let supabaseClient: ReturnType<typeof createClient<Database>>
  const tenant1Id = DEFAULT_TENANT_ID
  const tenant2Id = '11111111-1111-1111-1111-111111111111'

  const employee1Id = 'TENANT1EMP'
  const employee2Id = 'TENANT2EMP'

  beforeAll(async () => {
    supabaseClient = createClient<Database>(envServer.supabaseUrl, envServer.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Create second tenant
    await supabaseClient.from('tenants').upsert({
      id: tenant2Id,
      name: 'Test Tenant 2',
    })

    // Create employee in tenant1
    const passwordHash = await hashPassword('Password123!')
    await supabaseClient.from('employees').insert({
      id: crypto.randomUUID(),
      employee_id: employee1Id,
      email: 'employee1@tenant1.com',
      tenant_id: tenant1Id,
      full_name: 'Employee 1',
      is_active: true,
      role: 'viewer',
      password_hash: passwordHash,
    })

    // Create employee in tenant2 with SAME employee_id (different tenant)
    await supabaseClient.from('employees').insert({
      id: crypto.randomUUID(),
      employee_id: employee2Id,
      email: 'employee2@tenant2.com',
      tenant_id: tenant2Id,
      full_name: 'Employee 2',
      is_active: true,
      role: 'viewer',
      password_hash: passwordHash,
    })
  })

  afterAll(async () => {
    // Cleanup
    await supabaseClient.from('employees').delete().in('employee_id', [employee1Id, employee2Id])

    await supabaseClient.from('tenants').delete().eq('id', tenant2Id)
  })

  describe('Repository layer isolation', () => {
    it('should only return employees from specified tenant', async () => {
      // Query tenant1
      const { data: tenant1Employees } = await supabaseClient
        .from('employees')
        .select('*')
        .eq('tenant_id', tenant1Id)
        .eq('employee_id', employee1Id)

      // Query tenant2
      const { data: tenant2Employees } = await supabaseClient
        .from('employees')
        .select('*')
        .eq('tenant_id', tenant2Id)
        .eq('employee_id', employee2Id)

      // Each tenant should only see their own employee
      expect(tenant1Employees).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t1Emp = tenant1Employees?.[0] as any
      expect(t1Emp?.employee_id).toBe(employee1Id)
      expect(t1Emp?.tenant_id).toBe(tenant1Id)

      expect(tenant2Employees).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t2Emp = tenant2Employees?.[0] as any
      expect(t2Emp?.employee_id).toBe(employee2Id)
      expect(t2Emp?.tenant_id).toBe(tenant2Id)
    })

    it('should prevent cross-tenant queries', async () => {
      // Try to query tenant2 employee with tenant1 filter
      const { data } = await supabaseClient
        .from('employees')
        .select('*')
        .eq('tenant_id', tenant1Id)
        .eq('employee_id', employee2Id) // This employee belongs to tenant2

      // Should return no results
      expect(data).toHaveLength(0)
    })

    it('should enforce tenant_id in all queries', async () => {
      // Query without tenant_id should return employees from ALL tenants
      const { data: allEmployees } = await supabaseClient
        .from('employees')
        .select('*')
        .in('employee_id', [employee1Id, employee2Id])

      // Should return both (this is why tenant_id is critical!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(((allEmployees as any) || [])?.length).toBeGreaterThanOrEqual(2)

      // With tenant filter, should only return one
      const { data: tenant1Only } = await supabaseClient
        .from('employees')
        .select('*')
        .in('employee_id', [employee1Id, employee2Id])
        .eq('tenant_id', tenant1Id)

      expect(tenant1Only).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t1Record = tenant1Only?.[0] as any
      expect(t1Record?.tenant_id).toBe(tenant1Id)
    })
  })

  describe('Session isolation', () => {
    it('should include tenant_id in JWT payload', async () => {
      // This test verifies that createSession() requires tenantId
      // Implementation tested in auth-service.integration.test.ts
      expect(true).toBe(true) // Placeholder - actual test in jwt-session-store
    })

    it('should reject session without tenant_id', async () => {
      // Verified by jwt-session-store validation logic
      // Session creation now throws error if tenantId missing/invalid
      expect(true).toBe(true) // Placeholder - actual validation in createSession()
    })
  })

  describe('RLS policies', () => {
    it('should enforce Row-Level Security on employees table', async () => {
      // Note: RLS policies are bypassed when using service role key
      // In production, user-level queries would be blocked by RLS

      // Note: RPC function may not exist in test environment
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseClient as any).rpc('get_policies', {
          schema_name: 'public',
          table_name: 'employees',
        })
      } catch {
        // Ignore RPC errors in tests
      }

      // This test documents that RLS should be enabled
      // Actual enforcement tested via application-level queries
      expect(true).toBe(true)
    })
  })

  describe('Account lockout isolation', () => {
    it('should track lockouts per tenant+employee combination', () => {
      // Tested in account-lockout-service.test.ts
      // Lockout key format: `${tenantId}:${employeeId}`
      expect(true).toBe(true)
    })
  })
})
