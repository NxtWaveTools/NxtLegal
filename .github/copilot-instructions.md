# 🚨 NXT LEGAL — DEVELOPMENT GUIDELINES (NON-NEGOTIABLE)

**Applies to: All AI-generated and human-written code.**

These are **mandatory engineering standards** for this repository.  
**Violation of any rule is considered a bug.**

This project prioritizes **correctness, security, scalability, and long-term maintainability** over short-term speed.

---

## 🔒 Locked Technology Stack (NO EXCEPTIONS)

**Frontend:** Next.js 16 (App Router) · TypeScript (strict) · CSS Modules + Tailwind CSS · Custom API client  
**Backend:** Next.js API Routes · PostgreSQL via Supabase · OAuth 2.0 (Microsoft AD) + JWT  
**Auth:** Dual-token strategy — 2-day access token + 7-day refresh token  
**Infra:** Vercel · Supabase (auth + DB) · Structured JSON logging  
**DX:** ESLint · Prettier · Husky + lint-staged · MCP servers (Supabase, Next.js, Filesystem)

❌ Do NOT introduce alternative frameworks, ORMs, auth systems, or build tools without explicit approval.

---

## 🧠 MCP SERVER USAGE — MANDATORY

**CRITICAL RULE:** MCP servers MUST be used for every feature, bug fix, refactor, or investigation.  
No assumptions. No blind coding. No "it should work."

Use **Supabase MCP** to inspect DB state, validate schemas, check RLS policies, and verify data before writing any DB-related code.  
Use **Filesystem MCP** to understand project structure before creating or moving files.  
Use **Next.js MCP** for route inspection, build analysis, and framework-specific guidance.
Use **DocuSign MCP** to orchestrate all eSignature workflows, including creating envelopes, listing templates, and tracking status.
Use **Brevo MCP** to manage communication workflows, including sending transactional emails, syncing contacts, and tracking  delivery status.
**Never** write raw API requests without first verifying capabilities via the MCP tool.
> **If MCP was not used, the change is invalid.**

---

## 🏗️ Architecture Principles

- **Proxy Pattern (NOT middleware):** Protect routes using HOFs like `withAuth()` and `withOptionalAuth()` from `src/core/http/with-auth.ts`. Global middleware is forbidden.
- **Modular Service Layer:** Repository → Domain Service → Presenter. Each layer has a single responsibility.
- **Type-Safe Config:** All config lives in `src/core/config/`. Environment variables validated at build time. No string-based config keys.
- **Error-First Responses:** All API responses include structured error codes, messages, and retry flags.
- **Thin API Routes:** Routes only validate input, call a service, and return a response. Business logic belongs in domain services.

---

## ⚙️ Configuration & Constants (ZERO HARDCODING)

All routes, roles, statuses, limits, feature flags, cookie names, and magic numbers **must** be defined in centralized files:

- `src/core/constants/` — roles, statuses, limits, error codes
- `src/core/config/route-registry.ts` — all API routes
- `src/core/config/feature-flags.ts` — feature toggles

❌ No magic strings. ❌ No magic numbers. ❌ No hardcoded route paths.  
Every value that can change must have a single source of truth.

---

## 🏢 Multi-Tenant Isolation (CRITICAL)

- Every DB query **must** include `tenant_id` as a filter — no exceptions.
- Use PostgreSQL RLS policies as the enforcement layer.
- JWT must include `tenant_id` and `role` claims; verify on every protected request.
- Never trust client-supplied tenant identity — derive it from the verified session.
- Cross-tenant data access is a **P0 security bug**.

---

## 🔐 Authentication & Security

- OAuth 2.0 (Microsoft AD) and Email/Password (JWT) are the only supported auth methods.
- Access tokens expire in 2 days; refresh tokens expire in 7 days with rotation on use.
- All protected routes use `withAuth()` HOF — never rely on client-side checks alone.
- Secrets live in server-side environment variables only. Never expose to the client.
- Sanitize all inputs. Validate with Zod on every API route. Return structured errors, never raw stack traces.
- Security headers, HTTPS, HSTS, and CORS must be configured in `next.config.ts`.

---

## 🧱 Domain Layer Purity

- Domain services must contain **zero** infrastructure imports (no Supabase, no HTTP calls).
- Infrastructure concerns (DB, email, storage) are injected via interfaces.
- Domain logic is fully unit-testable without mocking infrastructure.
- Presenters format responses — domain objects are never returned raw.

---

## 🔄 API Standards

- All mutating endpoints must be **idempotent** where applicable (use idempotency keys for payments, jobs, etc.).
- Pagination is **required** on all list endpoints — **cursor-based pagination only**. Offset-based pagination is forbidden for large datasets. Return `cursor`, `limit`, and `total`.
- API versioning must be considered before breaking changes.
- Consistent response shape: `{ data, error, meta }`.

---

## 🗂️ Module Boundaries & File Structure

- **Feature-based structure only.** No type-based dumping (`utils.js`, `helpers.js`).
- Each feature owns: UI components, API routes, domain service, repository, validators, types.
- Shared utilities live in `src/lib/` (pure, stateless) and `src/core/` (framework-level).
- Cross-feature direct imports are forbidden. Communicate through shared interfaces.
- Allowed dependency direction: `UI → Feature Logic → Repository → Database`. Reverse direction is an architectural bug.

---

## 🗃️ Database Discipline

- Always inspect schema and RLS policies via Supabase MCP before writing queries.
- No in-memory filtering — all filtering happens at the DB level.
- Fetch only required fields; avoid `SELECT *`.
- All queries must respect `tenant_id` isolation.
- Migrations are additive only (no destructive changes without a rollback plan).
- Soft deletes are **mandatory** for auditable entities (contracts, employees, documents). Hard deletes require explicit approval and a data retention justification.
- Add indexes before scaling. Investigate N+1 queries before releasing.

---

## 📋 Background Jobs

- Jobs are isolated, idempotent, and retriable.
- Jobs must not contain inline business logic — delegate to domain services.
- Failed jobs must be logged with full context for replay.
- No long-running synchronous operations inside API routes — offload to jobs.

---

## 📊 Observability & Logging

- Structured JSON logging only. Use the shared `logger` from `src/core/infra/logging/logger.ts`.
- Log levels: `DEBUG` in dev, `WARN+` in prod.
- Every request must carry a `correlationId` (trace from request → logs → errors).
- Never log PII, tokens, or secrets.
- Log at service boundaries (entry + exit) and on all errors.

---

## 🧪 Testing

- Unit test coverage **>80%** for domain services, repositories, and utilities.
- Integration tests required for all auth flows, token refresh, and permission enforcement.
- Critical paths (multi-tenant isolation, auth, payments) require end-to-end tests.
- PRs without tests are invalid unless explicitly justified.
- Mock external dependencies (Supabase, OAuth) — never call real services in unit tests.

---

## ⚠️ Edge Case Discipline

Every implementation must handle: empty states · large datasets · expired tokens mid-request · concurrent refresh · permission-denied flows · tenant isolation breaches · invalid/malicious input · DB connection failures.  
Happy-path-only code is **not acceptable**.

---

## 🚫 Forbidden Patterns

- Global middleware for auth (use `withAuth()` HOF)
- Hardcoded strings, routes, roles, or limits
- Business logic inside API routes or UI components
- Direct DB calls from UI or presentation layer
- Missing `tenant_id` in any DB query
- Returning raw errors or stack traces to clients
- Client-side-only permission checks
- Tests that call real external services
- Breaking DB changes without a migration + rollback plan

---

## 📁 File Location Quick Index

| Task | Location |
|------|----------|
| Add API route | `src/app/api/[feature]/route.ts` |
| Protect route | `withAuth` from `src/core/http/with-auth.ts` |
| Add domain logic | `src/core/domain/[feature]/` |
| Add constants/enums | `src/core/constants/` |
| Add shared config | `src/core/config/` |
| Add pure utility | `src/lib/` |
| Add DB type | `src/types/database.ts` |
| Add feature UI | `src/modules/[feature]/ui/` |
| Add logger | `logger` from `src/core/infra/logging/logger.ts` |

---

## 🛑 FINAL RULE

> **If something is unclear, inspect using MCP — never assume.**

This repository values correctness over speed, structure over shortcuts, and long-term maintainability over hacks.

**If the code disagrees with this file, the code is wrong.**

---

**Document Owner:** Engineering Manager / CTO  
**Last Updated:** Feb 13, 2026 (v2.0)