# Phase 4: Post-Release Observation + Optional Deprecation Plan

## Scope
This plan applies to legacy reads from `contracts.file_path`, `contracts.file_name`, `contracts.file_size_bytes`, and `contracts.file_mime_type` where equivalent source-of-truth data already exists in `contract_documents` + `contracts.current_document_id`.

## Current State (after Phase 3)
- Signing source is locked to `contracts.current_document_id` for default download/signing resolution.
- Envelope source document is persisted at send-time via `contract_signatories.envelope_source_document_id`.
- Legacy contract file columns remain for backward compatibility and rollback safety.

## Observation Window
- Duration: 14 days minimum after production rollout.
- Owners: Legal workflow on-call + backend maintainer.
- Freeze rule: no destructive schema changes during observation.

## Monitoring Checklist
- API error rates for signing and download endpoints:
  - `/api/contracts/:contractId/signing-prep/send`
  - `/api/contracts/:contractId/download`
  - `/api/contracts/:contractId/preview`
- Business-rule error trends:
  - `CONTRACT_CURRENT_DOCUMENT_MISSING`
  - `CONTRACT_CURRENT_DOCUMENT_INVALID`
  - `DOCUMENT_NOT_FOUND`
- Data integrity checks (daily):
  - contracts with primary document but null `current_document_id`
  - signatories with null `envelope_source_document_id`
  - invalid document references across tenant boundaries

## SQL Health Checks (run daily)
```sql
-- 1) Contracts missing current pointer while primary exists
SELECT COUNT(*) AS missing_current_document
FROM public.contracts c
WHERE c.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.contract_documents d
    WHERE d.tenant_id = c.tenant_id
      AND d.contract_id = c.id
      AND d.document_kind = 'PRIMARY'
      AND d.deleted_at IS NULL
  )
  AND c.current_document_id IS NULL;

-- 2) Invalid current pointer references
SELECT COUNT(*) AS invalid_current_document_refs
FROM public.contracts c
LEFT JOIN public.contract_documents d
  ON d.id = c.current_document_id
WHERE c.deleted_at IS NULL
  AND c.current_document_id IS NOT NULL
  AND (
    d.id IS NULL
    OR d.tenant_id <> c.tenant_id
    OR d.contract_id <> c.id
    OR d.document_kind <> 'PRIMARY'
    OR d.deleted_at IS NOT NULL
  );

-- 3) Envelope source document coverage
SELECT COUNT(*) AS missing_envelope_source_document
FROM public.contract_signatories s
WHERE s.deleted_at IS NULL
  AND s.envelope_source_document_id IS NULL;
```

## Exit Criteria for Deprecation
Proceed only if all are true for 14 consecutive days:
- No severity-1/2 incidents related to signing/download document resolution.
- SQL health checks remain at zero critical violations.
- No sustained rise in signing/download 4xx/5xx error rates.

## Optional Deprecation Steps (additive first)
1. Add runtime warning logs when legacy `contracts.file_*` fields are read in server flows.
2. Remove remaining server-side fallback reads to `contracts.file_*` where `current_document_id` is available.
3. Keep dual-write synchronization for one additional release cycle.
4. After one stable cycle, stop syncing legacy fields from document events.
5. Prepare separate migration plan for column deprecation (never in same release as fallback removal).

## Rollback Plan
- If incident occurs, revert only runtime behavior to prior read path while preserving schema.
- Keep `current_document_id` and versioning schema intact.
- Re-run health checks and incident postmortem before re-attempting deprecation.
