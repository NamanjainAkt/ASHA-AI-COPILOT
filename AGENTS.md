# AGENTS.md — ASHA AI Copilot

Offline-first, Hindi voice-enabled AI copilot for frontline Accredited Social Health Activists (ASHA) and community healthcare workers.

---

## 1. Core Architecture & Philosophy

The system assists frontline workers during household visits (NCD community screening & maternal danger signs) without replacing clinical judgment or government infrastructure.

### The Pipeline Separation of Concerns
```text
Speech Recognition (Whisper Tiny Hindi)
        ↓
Information Extraction (Cactus Needle 2)
        ↓
Data & Schema Validation (Strict Plausibility Checks)
        ↓
Deterministic Protocol Rules (TypeScript Engine)
        ↓
Risk / Follow-up Flags (Closed Priority Union)
        ↓
Simple Summary (Qwen3-1.7B Plain Hindi)
        ↓
Human Confirmation (Worker Review & Edits)
        ↓
Offline Persistence (Expo SQLite)
        ↓
Idempotent Delayed Sync (FastAPI + Supabase / SQLite)
```

> **Crucial Rule:** The LLM must **never** diagnose a patient, assign clinical risk, or calculate medical thresholds.

---

## 2. Wiki First — Read Before Touching Code

This repository maintains an **LLM-owned wiki** under `wiki/`. Treat it as the definitive living architectural map.

1. **Read `wiki/index.md` first** — Catalogue of all source docs, entities, concepts, and analyses.
2. **Check recent history** — Run `grep "^## \[" wiki/log.md | tail -20` to see recent audits, ingests, and diagnoses.
3. **Consult specific pages before editing raw code** — Every claim in the wiki contains `path:line` citations.
4. **Read `wiki/overview.md`** for top-level synthesis.
5. **Code is authoritative; `docs/wiki/` is secondary.** Discrepancies between legacy markdown and actual code must be logged under `## Contradictions` in the appropriate wiki page.
6. **Maintain the wiki:** After any non-trivial architectural or code change, update the affected wiki pages and append an entry to `wiki/log.md`. File detailed diagnoses under `wiki/analyses/`.

---

## 3. Core Invariants (Do Not Weaken)

1. **Field Offline-First:** The clinical workflow must never block on HTTP or network connectivity. The only network call in the service layer is manual or background sync.
2. **Clinical Safety (Rules over Models):** No LLM decides risk or priority. `evaluateRules()` is pure deterministic TypeScript. `RuleResult.priority` is a closed union (`EMERGENCY` | `HIGH` | `MEDIUM` | `LOW`).
3. **Privacy:** Raw audio must be discarded immediately after local transcription. Audio buffers or files must never be retained or synced to the backend.
4. **Network Idempotency:** Sync replay must be idempotent, keyed on client-generated UUIDs for all patients, screenings, and follow-ups.
5. **Human-in-the-Loop:** All extracted fields, rule flags, and summaries require explicit confirmation/editing by the worker before being committed to the database.

---

## 4. Unwired Manual Steps & Gotchas

Be aware of the repository's known setup and build dependencies:

1. **`npm run build --workspace=@asha/shared`**  
   *Must be executed after any edit to `packages/shared/src/**`.* Mobile and test suites consume the compiled `dist/` bundle, not raw TypeScript sources.
2. **`node scripts/patch-expo-router.js`**  
   Patches files under `node_modules/expo-router/`. Verify this hook runs in CI/EAS builds (`Patched ... successfully`).
3. **`python -m services.api.main`**  
   Must be launched as a module from the repo root. Executing `python services/api/main.py` directly fails due to package-relative imports.

---

## 5. Repository Layout

```text
.
├── apps/
│   ├── mobile/             # React Native + Expo mobile client (Expo Router, Expo SQLite)
│   └── dashboard/          # Supervisor Command Center web UI (HTML/Tailwind/JS)
├── packages/
│   └── shared/             # Types, clinical validation, protocol JSON definitions
├── services/
│   └── api/                # FastAPI sync backend (SQLite / Supabase, endpoints, models)
├── tests/
│   ├── clinical_rules_test.js      # Rules and validation assertions
│   └── sync_idempotency_test.py    # Backend sync push/pull idempotency tests
├── wiki/                   # LLM-maintained living wiki and analysis docs
├── scripts/                # Build and patching helper scripts
└── ASHA AI Copilot — Final Product Requirements Document.md # Canonical PRD
```

---

## 6. AI Model Boundaries

| Model / Component | Exact Responsibility | Forbidden Actions |
|---|---|---|
| **Whisper Tiny Hindi** | Converts Hindi/Hinglish speech to raw text transcript | Medical diagnosis or entity extraction |
| **Cactus Needle 2** | Extracts structured JSON conforming to schema | Risk determination or triage calculation |
| **Validation Layer** | Validates schema, plausibility ranges, and consistency | Modifying clinical data without worker consent |
| **Rule Engine** | Deterministic protocol rules (`protocols/*.json`) | Natural language reasoning or guessing |
| **Qwen3-1.7B** | Simple Hindi summary and plain explanations | Autonomous clinical decisions, altering numbers, prescriptions |
| **ASHA Worker** | Reviews, corrects, and confirms the screening record | — |

---

## 7. Developer & Verification Commands

```powershell
# 1. Rebuild shared package contracts (Run after editing packages/shared)
npm run build --workspace=@asha/shared

# 2. Typecheck mobile codebase
npx tsc --noEmit --project apps/mobile/tsconfig.json

# 3. Run Clinical Rule & Validation test suite
node tests/clinical_rules_test.js

# 4. Run Backend Sync Idempotency test suite
$env:PYTHONIOENCODING="utf-8"; python tests/sync_idempotency_test.py

# 5. Start FastAPI Backend & Supervisor Dashboard (:8000 & :8000/dashboard)
python -m services.api.main

# 6. Start Mobile App (Expo dev server)
npm run start:mobile
```

---

## 8. Code Conventions & Best Practices

- **Protocols in JSON:** Clinical thresholds and bilingual strings live in `packages/shared/src/protocols/*.json` rather than hardcoded in TypeScript.
- **Fail-Closed Error Handling:** For clinical operations and rules, prefer fail-closed. Treat missing/malformed data as an explicit signal requiring human review.
- **Fixture Data vs Engine Output:** Seed data (`services/db/database.ts`, `services/api/database.py`) is hand-written test fixture prose. Never cite seeded text as actual engine output.
- **Bilingual Design:** All patient-facing and field-facing strings must support clear Hindi terms with optional Hinglish/English transliteration for medical units (e.g., BP, mg/dL).
