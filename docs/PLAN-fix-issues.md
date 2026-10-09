# Master Implementation Plan: Complete Resolution of ISSUES.md (88 Issues)

**Date:** 2026-10-07  
**Owner:** Orchestrator (`@[orchestrator]`)  
**Project:** ASHA AI Copilot (`apps/mobile`, `packages/shared`, `services/api`, `apps/dashboard`, `tests/`, `scripts/`)

---

## Strategic Objectives & Invariants

1. **The Field Invariant (Offline Completeness)**: Screening workflow must never block on HTTP.
2. **The Clinical Safety Invariant (Deterministic Triage)**: Deterministic TypeScript rules decide priority; LLMs/simulators only transcribe and summarize. No fake/manufactured triage flags.
3. **The Privacy Invariant (Data Protection & Ephemeral Audio)**: Raw audio purged; PHI protected; on-device and transit security hardened; XSS eliminated.
4. **The Network Invariant (Strict Idempotency)**: Sync queue keyed on UUIDs, robust ack correlation, server-side duplicate prevention.

---

## Execution Phases & Milestones

### Phase 1: P0 Release Blockers (11 issues)
- [ ] **ISS-001 & ISS-002 & ISS-003**: Mobile Auth Hardening
  - Remove hardcoded PIN `1234` check in `apps/mobile/app/login.tsx`
  - Remove master PIN hint in UI
  - Fix login `catch` to fail closed (alert error, stay on login)
  - Fix splash screen `catch` in `apps/mobile/app/splash.tsx` to route to `/login` with an error message instead of failing open to `/(tabs)`
- [ ] **ISS-004 & ISS-005 & ISS-008**: Backend Authentication & Endpoint Authorization
  - Implement real JWT auth in `services/api/main.py`: `users` table with password hashing (PBKDF2/bcrypt)
  - Default supervisor credentials seeded safely (`supervisor` / `password123`)
  - Enforce `Depends(verify_jwt)` on all sensitive endpoints (`/patients`, `/screenings`, `/followups`, `/sync/push`, `/sync/pull`, `/dashboard/*`)
  - Gate `/seed-demo` behind admin role and env flag, using non-destructive insert
- [ ] **ISS-012**: Supervisor Dashboard Security & Stored XSS Elimination
  - Add auth header / login barrier to `apps/dashboard/index.html`
  - Replace dangerous `innerHTML` rendering with DOM element creation (`document.createElement`, `textContent`)
  - Add strict `Content-Security-Policy` header in backend serving dashboard
- [ ] **ISS-018 & ISS-154**: Mobile Navigation & Router Patch Verification
  - Ensure `scripts/patch-expo-router.js` throws an error on missing target files instead of silently passing
  - Verify patch integrity in router fork
- [ ] **ISS-019 & ISS-020**: Data Integrity & Screening Attribution Guards
  - Sanitize screeningId params: do not pass `undefined` or string `'undefined'`; fallback to `screen-${Date.now()}`
  - Guard `summary.tsx`, `manual-entry.tsx`, and `voice-capture.tsx` against missing patient; block save if `!patientId`
- [ ] **ISS-021 & ISS-022**: QA Process & Test Automation
  - Update root `package.json` `"test"` script to run both clinical rule tests and backend tests
  - Add a route smoke check runner in `tests/` verifying route declarations

### Phase 2: P1 Wrong Behavior Reachable by Users (27 issues)
- [ ] **Clinical Safety & Extraction**:
  - ISS-101: Default HITL consent checkbox to `false`; save disabled until reviewed
  - ISS-102: Remove manufactured critical vitals defaults on cache miss; prompt user for real vitals
  - ISS-104: Handle `field_status: 'uncertain'` in validation & rules engine (skip or downgrade out-of-range triage)
  - ISS-105: Check `isValid` in `orchestrator.ts` before creating definitive summary
  - ISS-108: Remove 3-digit regex fallback for systolic BP in `simulatorDriver.ts`
  - ISS-110: Edema rule requires elevated BP qualifier
  - ISS-111: Fetal movement rule gates on gestational age >= 24 weeks
- [ ] **Display & Mobile UI**:
  - ISS-107: Derive patient card risk from actual `rule_results`, not array index
  - ISS-114: Use `expo-network` (`getNetworkStateAsync`) for live connectivity indicator
  - ISS-115: Remove fabricated coverage statistics in `village/index.tsx`
  - ISS-118: Strip patient names from URL navigation params; look up by ID from SQLite
  - ISS-121: Full logout clearing PIN/profile/session and orchestrator state
  - ISS-146: Move static `high-risk` route configuration so `[id]` does not swallow it
- [ ] **Sync Protocol & Data Integrity**:
  - ISS-112: Enqueue high-risk followups created in `manual-entry.tsx`
  - ISS-123: Handle `worker` entity, `delete` operation, and accurate status in `/sync/push`
  - ISS-127: Fix `/dashboard/workers` cross-join query to avoid repeating global screening counts
  - ISS-130: Include tombstones and workers in `/sync/pull`
  - ISS-132: Optimize `getMetrics` into a single SQL query
  - ISS-136: Add per-record try/catch in `syncService.ts` and call `markFailed` on corrupt rows
  - ISS-150: Seed demo data only on empty tables with `INSERT OR IGNORE`
  - ISS-153: Do not stamp fake lastSyncTime on empty queue; display "Never synced" when null
  - ISS-155: Add unique index on `sync_events(device_id, client_record_id, operation)`
  - ISS-157: Use UUIDs for queue items; transmit proper unique `client_record_id`
- [ ] **Build & QA**:
  - ISS-138: Update `tests/clinical_rules_test.js` to run `evaluateRules`
  - ISS-139: Expand `tests/sync_idempotency_test.py` to cover multiple entities, operations, and auth
  - ISS-156: Build `@asha/shared` before running test suite

### Phase 3: P2 Robustness, Performance & Debt (34 issues)
- [ ] Clinical & Simulator Refinements (ISS-201, ISS-202, ISS-203, ISS-204, ISS-205, ISS-206)
- [ ] Mobile UI & Native Safety (ISS-207 tel validation, ISS-218 audio cleanup, ISS-219 hashed PIN, ISS-220 useFocusEffect, ISS-221 onboarding checks, ISS-222 role persistence, ISS-223 RiskCard i18n, ISS-224 Language memoization, ISS-225 FlatList pagination, ISS-234 Android permissions cleanup, ISS-237 design align)
- [ ] Database & Backend Hardening (ISS-208 batch limits & pagination, ISS-209 atomic transactions, ISS-210 ScreeningResponse model, ISS-211 connection PRAGMAs & timeout, ISS-212 persist follow-up notes, ISS-213 POST /followups, ISS-214 sync_status enum, ISS-215 CORS restrictions, ISS-216 127.0.0.1 dev bind, ISS-217 HTTPS default sync, ISS-226 search index, ISS-227 database indexes, ISS-228 CHECK constraints, ISS-229 json_valid checks, ISS-230 dynamic due dates, ISS-231 PRAGMA user_version migrations, ISS-232 schema drift alignment, ISS-233 polling efficiency)
- [ ] Documentation & DX (ISS-235 fix python -m command in package.json & README, ISS-236 sync docs update)

### Phase 4: P3 Hygiene, Dead Code & Release Polish (16 issues)
- [ ] Dead code removal (ISS-301 ScreeningPipelineResult, ISS-302 language param, ISS-303 unused Platform imports, ISS-304 app_state usage, ISS-305 dead UI bindings, ISS-306 dead models/dependencies, ISS-307 orphaned script, ISS-311 bleeding status ternary, ISS-315 VoiceDock prop)
- [ ] Git repository hygiene (ISS-308 root .gitignore for APK/DB/pycache)
- [ ] Test harness modernization & logging (ISS-309 seed endpoint test, ISS-310 build versioning doc, ISS-312 test assertion counters & PYTHONPATH, ISS-313 logger service with error level, ISS-314 spacing token md2, ISS-316 protocol validation test cases)

---

## Verification Criteria
- `npm run build --workspace=@asha/shared` succeeds.
- `npx tsc --noEmit --project apps/mobile/tsconfig.json` passes with 0 type errors.
- `node tests/clinical_rules_test.js` passes all tests including rule engine execution and validation edge cases.
- `python tests/sync_idempotency_test.py` passes all tests with JWT auth and multi-entity replays.
- Root `npm test` runs both suites and exits with code 0.
