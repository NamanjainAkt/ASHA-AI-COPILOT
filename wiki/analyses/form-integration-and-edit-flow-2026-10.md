---
type: analysis
created: 2026-10-09
updated: 2026-10-09
sources: [
  FORMS.md,
  EXTRACTED_DATA.md,
  packages/shared/src/types.ts,
  packages/shared/src/engine.ts,
  apps/mobile/app/patients/edit.tsx,
  apps/mobile/app/patients/[id].tsx,
  apps/mobile/app/screening/summary.tsx,
  services/api/database.py,
  services/api/main.py,
  tests/clinical_rules_test.js,
  tests/sync_idempotency_test.py
]
tags: [forms, edit-flow, rule-engine, sync, backend, pnc, cbac]
---

# Form Integration, Beneficiary Edit Flow & Extended Clinical Engine

## Executive Summary

On branch `srishti`, clinical form specifications were expanded (`FORMS.md`, `EXTRACTED_DATA.md`, `@asha/shared/types.ts`, `@asha/shared/validation.ts`) to transition from a single-pass screening demo into a full visit-based frontline ASHA field workflow. This analysis documents the end-to-end integration across the mobile UI, rule engine, local SQLite persistence, backend FastAPI sync services, and automated test harness.

---

## 1. Beneficiary Demographics & Edit Flow

### Architecture
- **Dedicated Screen**: Created [`apps/mobile/app/patients/edit.tsx`](file:///C:/Andy%20projects/Asha/apps/mobile/app/patients/edit.tsx) providing pre-filled, editable form inputs matching the full Module A specification.
- **Repository Support**: Extended [`patientRepository.update()`](file:///C:/Andy%20projects/Asha/apps/mobile/services/db/patientRepo.ts) to update SQLite fields atomically:
  - `name`, `age`, `sex`, `phone`, `phone_owner` (`self`, `spouse`, `parent`, `neighbor`, `other`)
  - `village`, `hamlet_tola`
  - `household_id`, `relationship_to_head`
  - `abha_id` (14-digit format)
  - `disability_access_needs`
  - `consent_obtained` (0/1 boolean)
- **Atomic Queueing**: Wrapped in `db.withTransactionAsync` to update SQLite and simultaneously enqueue an `'update'` operation in `sync_queue`.
- **Profile Card Enrichment**: [`apps/mobile/app/patients/[id].tsx`](file:///C:/Andy%20projects/Asha/apps/mobile/app/patients/%5Bid%5D.tsx) now features an "Edit" CTA in the top header bar, and displays demographic chips for Hamlet/Tola, Head Relation, ABHA ID, Disability Access Needs, and Phone Ownership status.

---

## 2. Screening Verification Gate (`summary.tsx`)

### Reactive Rule Re-evaluation
In [`apps/mobile/app/screening/summary.tsx`](file:///C:/Andy%20projects/Asha/apps/mobile/app/screening/summary.tsx), the verification gate allows frontline workers to review, edit, and confirm extracted clinical vitals and questionnaire responses:
1. **Module B: Common Visit Assessment**:
   - `main_complaint` (string)
   - `complaint_onset` (string duration)
   - `complaint_course` chips (`worsening`, `unchanged`, `improving`, `fluctuating`)
   - `missed_medication_doses` switch (triggers `RULE_COMMON_VISIT_MISSED_MEDS`)
2. **CBAC / NCD Assessment**:
   - `bp_systolic`, `bp_diastolic`, `blood_glucose`
   - `waist_circumference_cm` (triggers `RULE_CBAC_WAIST_CIRCUMFERENCE` when >= 85 cm)
3. **Pregnancy Danger Signs**:
   - `vaginal_bleeding` switch
   - `convulsions` switch (triggers emergency `RULE_PREG_CONVULSIONS`)
   - `leaking_fluid` switch (triggers `RULE_PREG_LEAKING_FLUID`)
4. **PNC / Newborn Assessment**:
   - `poor_feeding_or_sucking`, `fast_breathing_or_indrawing` switches (triggers `RULE_PNC_NEWBORN_DANGER`)
   - `birth_weight_kg` (triggers `RULE_PNC_LOW_BIRTH_WEIGHT`)
5. **Referral & Action Tracking**:
   - `destination` chips (`sub_center`, `phc`, `chc`, `district_hospital`)
   - `urgency` chips (`immediate`, `urgent`, `routine`)
   - Automatically populates the generated `followup` record and sync queue payload on save.

---

## 3. Deterministic Clinical Rule Engine Extensions

In [`packages/shared/src/engine.ts`](file:///C:/Andy%20projects/Asha/packages/shared/src/engine.ts), all evaluations remain 100% deterministic TypeScript (zero LLM in priority triage):
- **`RULE_CBAC_WAIST_CIRCUMFERENCE`**: Triggers `medium` priority if waist circumference >= 85 cm.
- **`RULE_COMMON_VISIT_MISSED_MEDS`**: Triggers `medium` priority when missed medication doses are reported.
- **`RULE_PREG_CONVULSIONS`**: Eclampsia emergency triggering `high` priority with immediate 108 ambulance referral guidance.
- **`RULE_PREG_LEAKING_FLUID`**: Premature rupture of membranes (PROM) danger sign triggering `high` priority.
- **`RULE_PNC_NEWBORN_DANGER`**: Triggers `high` priority for poor feeding/sucking, fast breathing/indrawing, hypothermia, convulsions, lethargy, or jaundice.
- **`RULE_PNC_LOW_BIRTH_WEIGHT`**: Triggers `high` priority for birth weight < 1.8 kg, and `medium` priority for 1.8 kg - 2.5 kg.

---

## 4. Backend Database & Sync Services

### Schema & Migrations
In [`services/api/database.py`](file:///C:/Andy%20projects/Asha/services/api/database.py):
- `patients` schema updated with `phone_owner`, `hamlet_tola`, `relationship_to_head`, `abha_id`, `disability_access_needs`, and `consent_obtained`.
- `followups` schema updated with `destination`, `urgency`, `facility_reached`, `responsible_person`, and `outcome`.
- Non-destructive migration alter loops added during `init_db()` to automatically upgrade existing databases without data loss.

### Endpoint Persistence
In [`services/api/main.py`](file:///C:/Andy%20projects/Asha/services/api/main.py):
- `POST /patients`: Stores and returns all extended patient attributes.
- `POST /followups`: Stores and returns destination, urgency, facility reached, and responsible person.
- `PATCH /followups/{id}`: Supports updating action outcomes, destination, and urgency via `COALESCE`.
- `POST /sync/push`: Upserts all extended patient and follow-up attributes idempotently.
- `GET /sync/pull`: Returns full records through `SELECT *` across updated SQLite columns.

---

## 5. Verification Results

All 6 test suites pass with 100% success rate:
- **`npm run build --workspace=@asha/shared`**: Clean compilation (0 errors).
- **`npx tsc --noEmit --project apps/mobile/tsconfig.json`**: Clean compilation (0 errors).
- **`node tests/clinical_rules_test.js`**: 18 / 18 passed.
- **`python tests/sync_idempotency_test.py`**: 13 / 13 passed (including roundtrip verification of extended fields).
- **`node tests/edge_cases_test.js`**: 15 / 15 passed.
- **`node tests/model_harness_test.js`**: 32 / 32 passed.
- **`node tests/qwen_summary_test.js`**: 6 / 6 passed.
- **`node tests/route_smoke_test.js`**: 4 / 4 passed.
