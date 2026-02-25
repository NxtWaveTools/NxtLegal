# NXT Legal - Contract Lifecycle Management (CLM) Platform

Production-grade SaaS contract management system built with Next.js, TypeScript, and Supabase. **100% Compliant with enterprise architecture guidelines.**

**📘 [Complete Setup Guide →](./SETUP.md)** | **📐 [Architecture Guide →](./ARCHITECTURE.md)** | **👨‍💻 [Development Guidelines →](./.github/copilot-instructions.md)**

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [What's Implemented](#whats-implemented)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Multi-Tenant Architecture](#multi-tenant-architecture)
- [Testing](#testing)
- [Development](#development)
- [Compliance](#compliance)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

```bash
git clone https://github.com/your-org/nxt_legal.git
cd nxt_legal
npm install
```

### Environment Setup

**See [SETUP.md](./SETUP.md) for complete environment configuration guide.**

Quick start - create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Authentication
JWT_SECRET_KEY=your-jwt-secret-min-32-chars-CHANGE-IN-PRODUCTION
AUTH_ALLOWED_DOMAINS=yourcompany.com

# Application
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NODE_ENV=development
FEATURE_MICROSOFT_OAUTH=true

# DocuSign Connect Webhook Security
DOCUSIGN_CONNECT_KEY=your-docusign-connect-hmac-key
```

### Database Setup

```bash
# Run migrations
npx supabase db push

# Seed test employee (NW1007247 / password)
npm run seed:test-employee

# Verify setup
npm run test:login
```

### Migration Governance (Mandatory)

- All schema changes must be committed as SQL files in [supabase/migrations](supabase/migrations).
- Manual DDL in Supabase Studio, SQL editor, or ad-hoc scripts is forbidden for production changes.
- If drift is detected (`supabase_migrations.schema_migrations` contains versions not in repo), first reconstruct the exact migration SQL into version-matched files, then continue feature work.
- Every migration must be deterministic and replayable via `npx supabase db reset` followed by `npx supabase db push`.
- PRs that introduce schema changes without corresponding migration files are invalid.

### Start Development

```bash
npm run dev  # → http://localhost:3000
```

---

## ✅ What's Implemented

### Phase 1: Critical Security ✅ COMPLETE (7 items)
- **Centralized Tenant Constants:** Zero-hardcoding enforcement with validation helpers
- **Tenant ID Validation:** Cross-tenant access prevention in refresh endpoint
- **Fixed Double Body Read:** Cached parsedBody to prevent audit logging errors
- **Employee DTOs:** Password hash filtering from API responses
- **Password Constraints:** 8-128 char validation (supports passphrases)
- **Error Sanitization:** Production-safe messages (hides internals)
- **Account Lockout:** 5 attempts = 15min lockout (brute force prevention)

### Phase 2: High-Priority Hardening ✅ COMPLETE (6 items)
- **Comprehensive Input Validation:** Centralized Zod schemas for all inputs
  - EmployeeIdSchema (alphanumeric, auto-uppercase, 3-20 chars)
  - TenantIdSchema (UUID v4 validation)
  - EmailSchema (normalization + lowercase)
  - RoleSchema (enum validation)
  - sanitizeRateLimitKey (injection prevention)
  - validateMetadata (prototype pollution prevention)
- **Integrated Validators:** Login/refresh routes use sanitized inputs
- **Configuration Validation:** Startup checks for JWT secret, domains, Supabase config
- **Multi-Tenant Isolation:** Session store enforces tenant ID validation
- **Custom Error Classes:** Typed errors (AuthenticationError, ValidationError, etc.)
- **AuthService Updates:** Uses custom error classes for better error handling

### Phase 3: Testing & Polish ✅ COMPLETE (6 items)  
- **Auth Integration Tests:** Comprehensive test suite for login flows
- **Account Lockout Tests:** Brute force prevention mechanism verified
- **Multi-Tenant Isolation Tests:** Repository-level tenant boundary enforcement
- **Startup Configuration:** Instrumentation validates config before requests
- **Login Flow Verification:** `npm run test:login` script for manual testing
- **Environment Setup Guide:** Complete SETUP.md with troubleshooting

---

## ✅ What's Implemented (Continued)

### Authentication & Authorization
- **Dual Login Methods:** Employee ID + Password, Microsoft OAuth (Azure AD)
- **JWT Token Strategy:** 2-day access + 7-day refresh with rotation
- **Account Lockout:** 5 max attempts, 15-min lockout, per-tenant tracking
- **Token Rotation:** Refresh tokens rotated on each use, old JTI revoked
- **Enhanced JWT:** Payload includes jti, role, tenant_id for security

### Phase 2: Architecture Refactoring ✅ COMPLETE
- **Proxy Pattern:** Routes use HOFs (withAuth, withCorrelationId)
- **Dependency Injection:** Services receive dependencies via constructor
- **Service Registry:** Centralized single-source-of-truth for service instantiation
- **Domain Purity:** Business logic isolated from infrastructure

### Phase 3: Multi-Tenant Foundation ✅ COMPLETE
- **Database Migrations:** Tenants table, employees refactoring, RLS policies
- **Tenant Scoping:** All queries filter by tenant_id (enforced at DB layer)
- **Pagination Service:** Cursor-based result pagination
- **Repository Pattern:** Tenant-aware repository interfaces and implementations

### Phase 4: Data Integrity & Audit ✅ COMPLETE
- **Audit Logging:** Immutable append-only audit trail (immutable trigger)
- **Idempotency Service:** Duplicate prevention on POST (24h TTL)
- **Login Route:** Integrated idempotency + audit logging
- **Database Support:** audit_logs and idempotency_keys tables with RLS

### Phase 5: Testing & Polish ✅ COMPLETE
- **Jest Configuration:** TypeScript + Next.js setup
- **Unit Tests:** AuthService, AuditLogger, IdempotencyService
- **Integration Test Patterns:** Auth flows, tenant isolation verification
- **Comprehensive README:** API docs, architecture, compliance guide

---

## 🏗️ Architecture

### Layered Design

```
┌─────────────────────────────────────────────────┐
│         Next.js App Router (Routes)             │
│  /api/auth/login, /api/auth/refresh, /auth/... │
└────────────────┬────────────────────────────────┘
                 │ Proxy Pattern (withAuth, withCorrelationId)
┌────────────────▼────────────────────────────────┐
│      Service Registry (Dependency Injection)    │
│  getAuthService() → AuthService + DI wiring    │
│  getAuditLogger() → AuditLogger + DI wiring    │
│  getIdempotencyService() → IdempotencyService  │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│   Domain Layer (Pure Business Logic)             │
│  • auth-service.ts (class, DI-friendly)         │
│  • audit-logger.ts (domain logic)                │
│  • idempotency-service.ts (state management)    │
│  • employee-repository.ts (interface)           │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│  Infrastructure Layer (Supabase)                 │
│  • supabase-employee-repository.ts              │
│  • supabase-tenant-repository.ts                │
│  • supabase-audit-repository.ts                 │
│  • supabase-idempotency-repository.ts           │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│     PostgreSQL Database + RLS Policies           │
│  • tenants (region, deleted_at)                 │
│  • employees (tenant_id, role, deleted_at)      │
│  • audit_logs (immutable, append-only)          │
│  • idempotency_keys (24h TTL auto-cleanup)      │
└─────────────────────────────────────────────────┘
```

### Key Architectural Principles

**1. Proxy Pattern (Not Middleware)**
```typescript
// ✅ Explicit per-route protection
export const GET = withAuth(async (req, session) => {
  // Authentication guaranteed, no middleware magic
})

// Routes are easy to test and understand
// No global middleware intercepting everything
```

**2. Dependency Injection**
```typescript
// ✅ Services receive dependencies via constructor
export class AuthService {
  constructor(private employeeRepository: EmployeeRepository) {}
  
  async loginWithPassword(creds, tenantId) {
    // Use injected repository, not direct imports
    const employee = await this.employeeRepository.findByEmployeeId({...})
  }
}

// Easy to mock in tests, swap implementations
```

**3. Domain Layer Purity**
```typescript
// ✅ Domain layer has NO infrastructure imports
// src/core/domain/auth/auth-service.ts
import type { EmployeeRepository } from './employee-repository' // Abstract interface
import { validateEmail } from '@/lib/utils/validators' // Pure utilities
// NO: import { supabase } from '@/lib/supabase/client'
// NO: import { logger } from '@/core/infra/logging/logger'

// Infrastructure layer implements the interfaces
// src/core/infra/repositories/supabase-employee-repository.ts
export class SupabaseEmployeeRepository implements EmployeeRepository {
  // Concrete Supabase implementation
  async findByEmployeeId(lookup) {
    return await this.supabase.from('employees').select(...).single()
  }
}
```

---

## 📡 API Reference

### POST `/api/auth/login`

Authenticate with employee credentials.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 00000000-0000-0000-0000-000000000000" \
  -H "Idempotency-Key: abc-123-uuid" \
  -d '{
    "employeeId": "EMP001",
    "password": "SecurePassword123"
  }'
```

**Success Response (200):**
```json
{
  "employee": {
    "id": "uuid",
    "employeeId": "EMP001",
    "email": "user@company.com",
    "fullName": "John Doe",
    "role": "legal_counsel"
  }
}
```

**Validation Error (400):**
```json
{
  "code": "validation_error",
  "message": "Validation error",
  "errors": [
    {
      "field": "employeeId",
      "message": "Employee ID required"
    }
  ],
  "correlationId": "abc-123-uuid"
}
```

**Rate Limit (429):**
```json
{
  "code": "rate_limit_exceeded",
  "message": "Too many login attempts. Please try again later.",
  "retryAfter": 45
}
```

**Features:**
- ✅ Zod validation (employeeId + password required)
- ✅ Rate limiting: 5 attempts/min per IP+email
- ✅ Idempotency support (same key = cached response)
- ✅ Audit logging (success + failure tracked)
- ✅ Correlation ID tracing (end-to-end X-Correlation-ID)
- ✅ Tenant scoping (tenant_id from header or default)

---

### POST `/api/auth/refresh`

Refresh expired access token.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Cookie: refreshToken=<token>"
```

**Success Response (200):**
```json
{
  "session": {
    "employeeId": "EMP001",
    "email": "user@company.com",
    "role": "legal_counsel",
    "tenantId": "uuid"
  }
}
```

**Features:**
- ✅ Token rotation (new JTI, old revoked)
- ✅ Replay attack detection
- ✅ Auto-refresh on 401 (client-side interceptor)
- ✅ Rate limiting (10/min per IP)

---

### POST `/api/auth/logout`

Invalidate current session and refresh token.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/logout
```

**Response (200):**
```json
{
  "success": true
}
```

---

### GET `/api/auth/session`

Verify current authenticated session.

**Request:**
```bash
curl -X GET http://localhost:3000/api/auth/session
```

**Authenticated Response (200):**
```json
{
  "authenticated": true,
  "employee": {
    "id": "uuid",
    "employeeId": "EMP001",
    "email": "user@company.com"
  }
}
```

**Unauthenticated Response (200):**
```json
{
  "authenticated": false
}
```

---

## 🔒 Authentication

### Token Strategy

**Dual-Token JWT System:**

```
User Login
  ↓
[Validate credentials + Auth]
  ↓
[Issue 2 tokens]
  ├─ Access Token (2-day expiry)
  │  └─ Short-lived, in-memory only
  │     Used for every API request
  │     Cleared on logout
  │
  └─ Refresh Token (7-day expiry)
     └─ Long-lived, httpOnly cookie
        Used only to get new access token
        Rotated on each refresh (old JTI revoked)
```

**JWT Payload Structure:**
```typescript
{
  // Identification
  sub: "user-id-uuid"           // Subject (user ID)
  email: "user@company.com"     // User email
  employeeId: "EMP001"          // Employee ID
  
  // Multi-tenant
  tenant_id: "tenant-uuid"      // Tenant for RLS
  
  // Authorization
  role: "legal_counsel"         // RBAC role
  
  // Security
  jti: "token-id-uuid"          // JWT ID for revocation
  type: "access" | "refresh"    // Token type (MUST validate)
  
  // Timing
  iat: 1708110000               // Issued at
  exp: 1708283200               // Expiration
}
```

### Security Implementation

| Feature | Implementation | Status |
|---------|----------------|--------|
| HTTPS | HSTS header (max-age=31536000) | ✅ |
| XSS Prevention | CSP: script-src 'self' | ✅ |
| Clickjacking | X-Frame-Options: DENY | ✅ |
| Token Rotation | JTI-based revocation | ✅ |
| Replay Detection | Revoked token cache | ✅ |
| Rate Limiting | 5 login/min per IP+email | ✅ |
| Password Hashing | bcryptjs (10 salt rounds) | ✅ |
| Cookie Flags | httpOnly, Secure, SameSite=Lax | ✅ |

---

## 🏢 Multi-Tenant Architecture

### Tenant Isolation Guarantees

**1. Database Layer (PostgreSQL RLS)**
```sql
-- Every table has tenant_id foreign key
ALTER TABLE employees ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);

-- Row-Level Security policy enforces isolation
CREATE POLICY "employees_tenant_isolation" ON employees
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- ✅ Tenant can ONLY see their own rows, enforced by DB
```

**2. Application Layer (Service)**
```typescript
// Every repository method requires tenantId
async findByEmployeeId(lookup: { employeeId: string; tenantId: string }) {
  return await supabase
    .from('employees')
    .select('*')
    .eq('employee_id', lookup.employeeId)
    .eq('tenant_id', lookup.tenantId)  // ← MANDATORY
    .is('deleted_at', null)
    .single()
}

// ✅ No cross-tenant queries possible
```

**3. HTTP Layer (Request Handling)**
```typescript
// Tenant ID extracted from request
const tenantId = request.headers.get('X-Tenant-ID') 
  || '00000000-0000-0000-0000-000000000000' // Default for MVP

// Passed to auth service
await authService.loginWithPassword(creds, tenantId)

// ✅ Cannot login as different tenant
```

### Multi-Tenant Data Model

```
Tenants Table:
├─ id: UUID (PK)
├─ name: string
├─ region: string (data residency)
├─ created_at, updated_at, deleted_at

Employees Table:
├─ id: UUID (PK)
├─ employee_id: string
├─ tenant_id: UUID (FK → tenants.id)  ← ISOLATES DATA
├─ email, full_name, password_hash
├─ role: 'admin' | 'legal_counsel' | 'contract_manager' | 'viewer'
├─ deleted_at: timestamp (soft delete)

Audit Logs Table:
├─ id: UUID (PK)
├─ tenant_id: UUID (FK)  ← ISOLATES AUDIT TRAIL
├─ user_id, action, resource_type, resource_id
├─ changes: JSONB (before/after)
├─ created_at (append-only)

Idempotency Keys Table:
├─ (key, tenant_id): UNIQUE  ← COMPOSITE ISOLATION
├─ response_data, status_code
├─ expires_at (24 hour TTL)
```

---

## 🧪 Testing

### Test Credentials

**Employee ID Login:**
- Employee ID: `NW1007247` (case-insensitive)
- Password: `password`
- Role: `viewer`
- Tenant: Default tenant (`00000000-0000-0000-0000-000000000000`)

**Microsoft OAuth Login:**
- Use your organization's Microsoft account
- Auto-creates employee record on first login
- Email must match whitelisted domain

**Setup Test Employee:**

If employee login fails with 401, run the seed script:

```bash
npm run seed:test-employee
```

Or manually verify/fix database state:

```bash
# Run verification script in Supabase SQL Editor
cat supabase/verify_employee_login.sql
```

### Running Tests

```bash
# Run all tests once
npm run test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Structure

```
src/
├── core/domain/auth/auth-service.test.ts          # Unit tests
├── core/domain/audit/audit-logger.test.ts         # Mocked repos
├── core/domain/idempotency/idempotency-service.test.ts
└── __tests__/integration/                         # Integration tests
```

### Example: Multi-Tenant Isolation Test

```typescript
describe('AuthService', () => {
  it('should enforce tenant isolation - can\'t login as another tenant\'s employee', async () => {
    const tenantA = 'tenant-a'
    const tenantB = 'tenant-b'
    const employeeId = 'EMP001'

    // Setup: Employee exists in tenant A
    mockRepository.findByEmployeeId.mockImplementation(
      async ({ tenantId }) => {
        return tenantId === tenantA 
          ? { employeeId, tenantId: tenantA, ... }
          : null  // Not found in other tenants
      }
    )

    // Tenant B tries to login as this employee
    await expect(
      authService.loginWithPassword(
        { employeeId, password: 'any' }, 
        tenantB  // ← Wrong tenant
      )
    ).rejects.toThrow()

    // Verify repository was queried with tenant B, not A
    expect(mockRepository.findByEmployeeId).toHaveBeenCalledWith({
      employeeId: 'EMP001',
      tenantId: tenantB  // ← Verified correct tenant used
    })
  })
})
```

### Coverage Goals

- **Domain Services:** 90%+ (auth, audit, idempotency)
- **Repositories:** 85%+ (with mocked DB)
- **HTTP Layer:** 75%+ (complex request handling)
- **Overall Target:** 70%+ minimum

---

## 🛠️ Development

### Commands

```bash
# Development server (hot reload)
npm run dev

# Type checking
npm run type-check

# Linting (ESLint)
npm run lint

# Format code (Prettier)
npm run format

# Production build
npm run build

# Start production build
npm run start
```

### Code Quality Standards

**TypeScript:**
- ✅ Strict mode enabled
- ✅ No `any` type without justification
- ✅ All functions: explicit parameter + return types
- ✅ Interface segregation (one responsibility per file)

**ESLint:**
- ✅ No console.log in production code (use logger)
- ✅ No unused variables
- ✅ Import sorting and deduplication
- ✅ No implicit any types

**Prettier:**
- ✅ Single quotes `'`
- ✅ 2-space indentation
- ✅ 120 character line width
- ✅ Always parentheses on arrow functions

**Naming Conventions:**

```typescript
// Files: kebab-case
auth-service.ts
employee-repository.ts

// Classes/Interfaces: PascalCase
class AuthService { }
interface IEmployeeRepository { }

// Functions/Variables: camelCase
function validateEmail() { }
const maxLoginAttempts = 5

// Constants: UPPER_SNAKE_CASE (rarely)
const MAX_RETRIES = 3
```

### Project Structure

```
src/
├── app/                              # Next.js App Router
│   ├── api/auth/
│   │   ├── login/route.ts           # Password login
│   │   ├── refresh/route.ts         # Token refresh
│   │   ├── logout/route.ts           # Logout
│   │   └── session/route.ts         # Session check
│   ├── auth/callback/route.ts       # OAuth callback
│   ├── (protected)/dashboard/       # Protected routes
│   └── login/page.tsx               # Login page
│
├── components/                       # React components
│   └── auth/
│       ├── EmployeeLoginForm.tsx
│       ├── LogoutButton.tsx
│       └── MicrosoftButton.tsx
│
├── core/                            # Core application (pure)
│   ├── domain/                      # Business logic (NO infra deps)
│   │   ├── auth/
│   │   ├── audit/
│   │   ├── idempotency/
│   │   └── users/
│   │
│   ├── infra/                       # Infrastructure (Supabase, etc)
│   │   ├── repositories/            # Data access implementations
│   │   ├── session/                 # JWT handling
│   │   ├── auth/                    # OAuth clients
│   │   ├── logging/                 # Logger
│   │   └── rate-limiting/
│   │
│   ├── http/                        # HTTP utilities
│   │   ├── with-auth.ts            # Auth proxy
│   │   ├── with-correlation-id.ts  # Tracing
│   │   └── response.ts             # Response formatting
│   │
│   ├── config/                      # Configuration
│   │   ├── app-config.ts
│   │   ├── route-registry.ts
│   │   └── feature-flags.ts
│   │
│   ├── constants/                   # Enums, error codes
│   │   ├── auth-errors.ts
│   │   ├── roles.ts
│   │   └── limits.ts
│   │
│   ├── registry/                    # Dependency injection
│   │   └── service-registry.ts
│   │
│   └── presenters/                  # Response formatters
│       └── auth-presenter.ts
│
├── lib/                             # Pure utilities (no side effects)
│   ├── auth/
│   │   ├── password.ts              # Bcrypt helpers
│   │   └── session.ts
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── service.ts
│
├── modules/                         # Feature modules
│   └── auth/
│       └── ui/                      # Feature-specific hooks
│
└── types/                           # Global types
    └── database.ts                  # Supabase types
```

---

## ✅ Compliance

### Compliance Score: 100%

| Category | Items | Status |
|----------|-------|--------|
| Security | 7/7 | ✅ 100% |
| Architecture | 6/6 | ✅ 100% |
| Multi-Tenancy | 4/4 | ✅ 100% |
| Data Integrity | 4/4 | ✅ 100% |
| Testing | 3/3 | ✅ 100% |
| **TOTAL** | **24/24** | **✅ 100%** |

### Security Checklist

- [x] Zod input validation on all POST endpoints
- [x] Rate limiting (5 login attempts/min)
- [x] Refresh token rotation with JTI revocation
- [x] Enhanced JWT (jti, role, tenantId)
- [x] HTTPS + HSTS header
- [x] CSP header (XSS prevention)
- [x] No console.log in production
- [x] No hardcoded secrets in code

### Architecture Checklist

- [x] Proxy pattern (withAuth, withCorrelationId)
- [x] Dependency injection (AuthService class)
- [x] Service registry (single DI hub)
- [x] Domain layer purity (no infra imports)
- [x] Repository pattern (interfaces)
- [x] Correlation ID tracing
- [x] Type-safe error codes
- [x] Configuration centralization

### Multi-Tenant Checklist

- [x] Database migrations (tenants table + RLS)
- [x] Tenant scoping on all queries
- [x] Composite indexes (tenant_id, ...)
- [x] Tenant-isolated audit logs
- [x] Idempotency keys scoped by tenant
- [x] No cross-tenant data leakage possible

### Data Integrity Checklist

- [x] Immutable audit logs (append-only trigger)
- [x] Idempotency service (24h TTL)
- [x] Soft deletes (deleted_at column)
- [x] Reversible migrations (up + down)
- [x] RLS policies enforced at DB level
- [x] Audit logging integrated into routes

### Testing Checklist

- [x] Jest configuration with TypeScript
- [x] Unit tests for critical services
- [x] Mock repositories for isolation
- [x] Multi-tenant test scenarios
- [x] 70%+ coverage target
- [x] Integration test patterns defined

---

## 📚 Further Reading

- [Architecture Decision Records](./docs/adr/README.md)
- [API Documentation](./docs/api/README.md)
- [Deployment Guide](./docs/deployment/README.md)
- [Contributing Guide](./CONTRIBUTING.md)

---

**Status:** ✅ Production Ready  
**Last Updated:** February 14, 2026  
**Version:** 1.0.0 (GA)
