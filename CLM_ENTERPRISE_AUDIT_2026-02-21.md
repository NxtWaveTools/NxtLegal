# CLM Enterprise Technical Audit Report

Date: 2026-02-21  
Repository: `nxt_legal`  
Audit mode: Evidence-only (code + repository SQL + live Supabase metadata via MCP)

## Evidence Collection Summary

- **Filesystem/Code evidence** from `src/`, `supabase/migrations/`, `ARCHITECTURE.md`, `PRODUCTION_READY.md`, route and service layers.
- **Supabase MCP evidence** from:
  - `mcp_supabase_list_tables`
  - `mcp_supabase_list_migrations`
  - `mcp_supabase_get_advisors` (security/performance)
  - `mcp_supabase_execute_sql` (RLS policies, functions, constraints, indexes, columns)
- **Next.js MCP evidence** from `mcp_nextjs_get-roots-list` and resource tools (note: available Next.js MCP surface in this session did not expose route introspection APIs; route analysis was performed from repository code directly).

---

## 1) Fully Implemented Features (Mapped to PRD Sections)

### PRD 1: User Roles & Access Control (Core Enforcement)

Implemented:
- Backend route protection via `withAuth` in `src/core/http/with-auth.ts`.
- Role-aware workflow transitions enforced server-side in `src/core/infra/repositories/supabase-contract-query-repository.ts` (`resolveTransition`, `getTransitionsForStatus`, `applyAction`).
- Tenant-scoped contract visibility logic in repository (`getVisibilityFilter`, `canActorAccessContract`).
- Database-level RLS policies exist on key tables (`contracts`, `audit_logs`, `users`, `teams`, `team_members`, etc.) confirmed via live `pg_policies`.

### PRD 3: HOD Approval Workflow (Core Flow)

Implemented:
- Upload initializes contracts into `HOD_PENDING` and routes to HOD via DB function `create_contract_with_audit` (live function definition).
- HOD and legal action pipeline implemented via transition graph + action API.
- Workflow graph persisted in DB (`contract_transition_graph`) and enforced in repository logic.

### PRD 7: Task Assignment Functionality (Partial Core Assignment + History)

Implemented subset:
- Current assignee model exists on `contracts` (`current_assignee_employee_id`, `current_assignee_email`).
- Additional approver assignment exists (`contract_additional_approvers`) with sequence enforcement and audit events.
- Reassignment mechanism exists in live DB function `replace_primary_team_member` with audit event `TEAM_MEMBER_REASSIGNED` and contract reassignment for team-primary replacements.

### PRD 13: Audit Trail & Logs (Strong Foundation)

Implemented:
- Central audit table with append-only immutability trigger (`ensure_audit_immutable`) from migrations.
- Rich workflow events in `audit_logs` (`event_type`, `actor_email`, `actor_role`, `target_email`, `note_text`, `event_sequence`).
- Timeline endpoint and UI support consume ordered audit events.

---

## 2) Partially Implemented Features

### PRD 1: Role Matrix Completeness

Partial:
- Roles present in code: `POC`, `HOD`, `LEGAL_TEAM`, `ADMIN`.
- Missing explicit `Legal Admin / Super Admin` distinction and dedicated permissions for reporting/configuration rights as separate elevated tiers.

### PRD 2: Contract Request Creation Mandatory Fields

Partial:
- Backend upload API validates only `title` + `file` + idempotency key (`src/app/api/contracts/upload/route.ts`).
- UI collects some extra fields (`contractType`, `counterparty`, supporting files), but these are not persisted/enforced by backend schema/API.

### PRD 5/6: Dashboard + Aging/TAT Presentation

Partial:
- Dashboard exists with filter tabs and status badges.
- Repository supports list/sort/filter by current workflow status and timestamps.
- Missing required columns and business-day aging/TAT breach semantics.

### PRD 7: Assignment/Reassignment

Partial:
- Additional approvers and team-primary reassignment exist.
- No dedicated general-purpose legal assignment history table for one-to-many legal assignees per request.

### PRD 8: Completion/Execution

Partial:
- Audit action taxonomy includes `contract.executed` in domain-level types.
- Core workflow currently ends in `FINAL_APPROVED`; no explicit completed/executed lifecycle state machine in contracts table.

### PRD 12: Notifications

Partial:
- Event sources (audit/workflow transitions) exist and can back notifications later.
- No implemented notification delivery framework in codebase.

---

## 3) Missing Features

### PRD 2 Mandatory Fields (Major Gap)

Missing in DB/API model:
- Signatory authority name/designation/email.
- Background of request (mandatory free text).
- Department/team mandatory capture on request payload.
- Budget approval field.
- Supporting documents as first-class persisted entities linked to contract request.

### PRD 3 Reminder Timers

Missing:
- 24h and 48h HOD pending reminders (no scheduler/queue/cron worker or reminder table).

### PRD 4 TAT Policy Engine

Missing:
- Deterministic server-side business-day engine.
- Holiday calendar tables (national/company holidays).
- SLA deadline persistence and calculation logic from `hod_approved_at`.

### PRD 5/6 Dashboard Mandatory View

Missing:
- Required statuses from PRD (`Offline Execution`, `Pending with External Stakeholders`, `On Hold`, `Rejected`, `Completed`, `Executed`, etc.)
- TAT breach sorting-to-top at query level.
- Aging color banding (Green/Yellow/Red) based on business days.
- “TAT Breached” marker semantics.

### PRD 7 Outlook Email + System Notification

Missing:
- Assignment notification dispatch and retry mechanism.
- Delivery logging/audit for outbound communications.

### PRD 8 Execution Completion UX

Missing:
- Confetti animation implementation.
- Completion/execution archival partition/flag for contracts.

### PRD 9/10/11 Reporting & Analytics

Missing:
- Dynamic reporting API with week/month/quarter/custom filters.
- Department-wise and status-wise analytics endpoints.
- Performance metrics (avg TAT, breaches, executed/completed counts).
- Export formats (Excel/PDF/CSV).
- Saved report templates.
- Direct email report sending + email audit trail.
- Main dashboard summary widgets/charts required by PRD.

### PRD 12 Notification Framework

Missing:
- Automated triggers for HOD pending, assignment made, Day-6 nearing breach, breach, status updates, executed event.

### PRD 13 Report Generation Audit Events

Missing:
- Explicit audit events for report generation/emailing (because reporting module absent).

---

## 4) Edge Cases Not Handled

- SLA calculation around weekends/holidays/timezones (no engine present).
- Escalation path when no HOD exists for team beyond generic fallback selection.
- Concurrent reassignment + action race on the same contract beyond row-version action update scope.
- Notification delivery failure/retry/dead-letter paths absent.
- No explicit archival lifecycle separation for completed/executed entities.
- Request creation does not enforce mandatory commercial context or signatory data, allowing semantically incomplete records.

---

## 5) Architectural Violations (Against SOLID / Enterprise Standards)

- **DTO/API insufficiency vs PRD domain**: backend contract aggregate is file-workflow-centric, not request-intake-centric as required.
- **Frontend/back-end mismatch**: UI collects fields not represented in persistence model; request integrity depends on UI-only flow for some inputs.
- **Incomplete capability decomposition**: reporting/notification/TAT modules are absent as independent scalable services.
- **Role granularity drift**: practical role model lacks explicit Legal Admin/Super Admin capability boundary.

---

## 6) Database Schema Weaknesses

- `contracts` table lacks required PRD fields (signatory/budget/background/department/request metadata).
- No holiday calendar tables and no SLA/TAT deadline columns.
- No explicit notification/email log tables.
- No report template/report job tables.
- No dedicated immutable assignment-history table for general assignee changes (audit events exist but no structured assignment event model for analytics).
- **Schema drift** detected: live DB migrations list includes `20260220113314_create_team_members_table`, `20260220113400_team_management_reassignment_workflows`, `20260220130111_fix_team_rpc_ambiguity`, but these files are not present in repository `supabase/migrations`.

---

## 7) RBAC & Security Risk Analysis

Strengths:
- RLS enabled on critical tables with tenant policies.
- `withAuth` enforced on contract APIs.
- Transition authorization validated server-side.
- JWT refresh token rotation implemented.

Risks:
- OAuth callback default-tenant fallback behavior (from repository evidence) can create tenant-context ambiguity if not tightly controlled.
- Role checks are strong for workflow actions, but broader feature rights (reporting/configuration) are not yet implemented or enforced.
- Security advisor warns about mutable `search_path` for `ensure_audit_immutable` and `update_updated_at_column` (live linter finding).

---

## 8) Workflow & Status Engine Gaps

Implemented core transition graph and action validation, but:
- PRD status universe is much larger than current status enum/check constraints.
- No explicit Completed/Executed terminal transitions with archive side effects.
- No configurable workflow admin UI/API shown for managing transitions at runtime.

---

## 9) TAT & Business-Day Logic Gaps

- No DB/backend function for business-day diff.
- No holiday table / holiday ingestion.
- No `tat_deadline_at`, `tat_breached_at`, `aging_business_days` persisted or computed in query layer.
- No day-6 near-breach trigger logic.
- No query-order prioritization for breached contracts.

---

## 10) Dashboard & Reporting Scalability Issues

- Dashboard APIs currently list/filter contracts but do not expose aggregate analytics required by PRD.
- No report endpoints/materialized views for scale-oriented aggregation.
- Advisor warnings include RLS init-plan patterns likely to degrade performance at higher row counts.
- Missing indexing advisory: unindexed FKs were flagged (`contract_additional_approvers.contract_id`, team-member FKs in earlier advisor output).

---

## 11) Email & Notification Framework Design Review

- No robust email subsystem present for workflow notifications/report emailing.
- No retry semantics, no queue/outbox pattern, no delivery status persistence.
- No email audit trail schema for sent notifications/reports.

Conclusion: notification framework is **not implemented** for enterprise requirements.

---

## 12) Audit Trail Integrity Review

Strengths:
- Append-only protection exists in DB migration.
- Event sequencing and actor metadata are present.
- Workflow actions consistently write audit records.

Gaps:
- Audit taxonomy does not yet cover report generation/email flows (feature absent).
- Assignment history relies on generic audit stream rather than dedicated assignment history model optimized for reporting.

---

## 13) Performance & Query Optimization Risks

- Supabase advisor flags on RLS policy patterns (`auth_rls_initplan`) across multiple tables.
- Security/perf advisor flags mutable `search_path` function definitions.
- Missing full reporting aggregation strategy for >50k contracts.
- Dashboard pagination is cursor-based in places, but analytics workload paths are not implemented.

---

## 14) Refactor Recommendations (Short Term)

1. Expand contract intake schema/API to include all mandatory PRD fields with strict backend validation.
2. Introduce server-trusted TAT module (holiday tables + business-day function + deadline columns).
3. Add notification outbox table + worker with retries and delivery logs.
4. Implement required status enum expansion and transition graph updates for completed/executed/offline/pending internal/external/on-hold/rejected.
5. Reconcile migration drift: commit missing live migrations into repository and lock migration governance.

---

## 15) Structural Improvements (Long Term)

1. Build dedicated analytics/reporting bounded context (aggregates, materialized views, export jobs).
2. Add configurable workflow administration module (transition rules, SLA policies, escalation policies).
3. Introduce immutable assignment event store for advanced audit/reporting dimensions.
4. Add policy-driven notification orchestration service (event-driven, multi-channel, idempotent).
5. Implement archive strategy for completed/executed contracts (cold storage index patterns, query split).

---

## 16) Production Readiness Score (1-10 with technical justification)

**Score: 5.5 / 10**

Justification:
- + Strong foundations in RBAC workflow enforcement, tenant isolation, and audit/event logging.
- + Clean layered architecture with thin API routes and service/repository boundaries.
- - Large functional gap vs PRD on TAT engine, reminders/notifications, reporting/export/email, and mandatory intake fields.
- - Schema/repo migration drift is a deployment governance risk.
- - Missing enterprise analytics and SLA operations blocks prevents readiness for stated business requirements.

---

## 17) Critical Red Flags Before Deployment

1. **PRD mismatch on core intake fields**: system can create contracts without required legal/business metadata.
2. **No TAT/business-day engine**: SLA commitments in PRD are currently unenforceable.
3. **No reminder/notification framework**: HOD and assignee operational controls are absent.
4. **No reporting/export/email module**: enterprise reporting obligations unmet.
5. **Status model mismatch**: required business states are not represented in DB or workflow graph.
6. **Migration drift**: live DB includes migrations not in repo; repeatable deployment integrity is compromised.
7. **Advisor security/performance warnings unresolved**: mutable search path and RLS plan inefficiencies require hardening.

---

## PRD Coverage Snapshot

- Fully implemented: Core RBAC-protected contract workflow + audit trail backbone.
- Partially implemented: Role matrix granularity, assignment/reassignment, dashboard basics.
- Missing: Mandatory intake fields set, TAT/holiday/reminder engine, reporting/exports/templates/emailing, completion UX + archive lifecycle.

This audit is based strictly on inspected repository files and live Supabase metadata retrieved via MCP tools in this session.