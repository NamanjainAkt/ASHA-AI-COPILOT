# ASHA AI Copilot (आशा Copilot)

> **"बोली उनकी, भरोसा विज्ञान का — हर गाँव तक स्वास्थ्य सुरक्षा।"**  
> *(Their Voice, Trusted Clinical Science — Healthcare Security in Every Village.)*

[![Clinical Safety](https://img.shields.io/badge/Clinical%20Safety-100%25%20Deterministic-emerald.svg)](packages/shared/src/engine.ts)
[![Offline First](https://img.shields.io/badge/Architecture-100%25%20Offline--First-blue.svg)](apps/mobile/services/db/database.ts)
[![Sync Idempotency](https://img.shields.io/badge/Sync-Idempotent%20Replay-teal.svg)](services/api/main.py)
[![Test Suite](https://img.shields.io/badge/Harness%20Tests-87%2F87%20Passing-success.svg)](tests/)

An **offline-first, Hindi voice-enabled AI copilot** designed specifically for Accredited Social Health Activists (ASHA) and frontline community healthcare workers across rural India.

---

## 🌟 The Core Value Proposition

* **Hands-Free Hindi Voice Capture:** Frontline workers speak naturally in Hindi, Hinglish, or English. The assistant extracts vitals, complaints, and obstetric danger signs in under 1 second.
* **100% Offline-First (No Internet Required in the Field):** Runs on local device storage (Expo SQLite). Screenings, entity extraction, protocol evaluations, and follow-up tasks function completely in zero-connectivity rural hamlets (*tolas*).
* **Deterministic Clinical Safety (Zero LLM Hallucinations):** AI strictly extracts and explains text. **No LLM decides triage priority or clinical risk.** Approved MoHFW/ICMR protocols execute through audited, pure-TypeScript deterministic rules.
* **Supervisor Command Center:** Synchronizes field screening data idempotently to Primary Health Centre (PHC) Medical Officers via a live web command dashboard.

---

## 🏛️ System Architecture

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                        MOBILE APPLICATION (EXPO)                          │
│            React Native + Expo SDK 52 + Hermes (Android / iOS / Web)      │
│                                                                           │
│  UI Layer (Accessible Tactile Design System)                             │
│     ├── Home Dashboard & Daily Visit Dispatcher                           │
│     ├── Beneficiary Directory with Sub-10ms Fast Indexed Search           │
│     ├── 1-Tap Hindi Speech Dictation Dock & Manual Entry Prefill          │
│     ├── Clinical Review Screen with Confidence-Aware Badge Pills          │
│     ├── Care Tracking & Follow-up Task Manager (Overdue / Pending)        │
│     └── Offline Sync Queue Status Widget                                  │
│                                                                           │
│  On-Device AI & Safety Pipeline                                           │
│     ├── Whisper Tiny Hindi STT / Native Android SpeechRecognizer          │
│     ├── Cactus Needle 3 Structured Entity Extractor (< 1ms Latency)       │
│     ├── Fail-Closed Validation Layer (Inverted BP, Extremes, Sex Guards)  │
│     ├── Deterministic TypeScript Rule Engine (18 Protocol Rules)          │
│     └── Qwen3 Clinical Summarizer (< 120 Words Concise Hindi Guidance)    │
│                                                                           │
│  Local SQLite Persistence (PRAGMA v2)                                     │
│     └── Indexed Tables: patients, screenings, followups, sync_queue       │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ Background Sync Push / Pull
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       FASTAPI SYNCHRONIZATION BACKEND                     │
│                  Python 3.10+ · SQLite / PostgreSQL · REST API            │
│     ├── POST /sync/push   (Idempotent batch push with client UUIDs)       │
│     ├── GET  /sync/pull   (Delta updates, workers & tombstones)           │
│     ├── POST /auth/login  (Role-based JWT authentication)                 │
│     └── GET  /dashboard   (Supervisor Web Command Center & Triage Heatmap)│
└───────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ The 4 High-Impact Features

| Feature | Problem Solved | Technical Implementation |
| :--- | :--- | :--- |
| **1. Fast Patient Search** | In-memory filtering lagged on large registers (> 50 patients). | Sub-10ms SQLite B-Tree indexing (`name COLLATE NOCASE`, `phone`, `village`) with debounced querying and 1-tap voice search. |
| **2. Confidence-Aware Extraction** | AI transcription errors (e.g. 160/10 BP) accepted silently. | 4-state review tagging (`ready`, `needs_review`, `missing`, `invalid`) with colored badges and a blocking confirmation gate on invalid vitals. |
| **3. Smart Offline Sync Status** | Workers could not tell if records were saved locally or synced. | Granular SQLite queue counts (`saved_locally`, `pending`, `syncing`, `synced`, `retry_scheduled`), 10-record micro-batching, and transparent Home Widget. |
| **4. Follow-Up Task Management** | Screening flags were forgotten after visit without next steps. | Automated follow-up task generation, lazy SQL overdue calculation (`due_date < date('now')`), and outcome resolution modal. |

---

## 🛡️ Clinical Safety & Edge Cases

The clinical safety layer enforces fail-closed defensive checks verified across our comprehensive edge-case test suite:

1. **Physiologically Inverted BP:** Catches Systolic $\le$ Diastolic ($80/120\text{ mmHg}$) as an explicit `CONTRADICTION`, sanitizes both to `null`, and prompts for re-testing.
2. **Implausible Vital Suppression:** Sensor artifacts ($> 260/160\text{ mmHg}$ or glucose $> 600\text{ mg/dL}$) are tagged `uncertain`, preventing false emergency ambulance dispatches while prompting a cuff/strip check.
3. **Biological Contradiction:** Blocks recording pregnancy screenings on male patients.
4. **Early Gestation Fetal Movement Fence:** Suppresses reduced movement alerts prior to 24 weeks gestation (quickening period) to eliminate false panic.
5. **Bidirectional Symptom Negation:** Analyzes context around Hindi denials (*"कोई सिरदर्द नहीं है"*, *"उल्टी बिल्कुल नहीं है"*), preventing false-positive symptom tagging.
6. **Devanagari & Spoken Words Normalizer:** Translates Devanagari numerals (`०-९`) and compound spoken words (*"एक सौ सत्तर"* = 170) to standard Arabic numbers.
7. **Sync Idempotency:** Client-generated permanent UUIDs and database unique constraints (`device_id, client_record_id, operation`) guarantee zero duplicate records on network retry.

---

## 🧪 Automated Test Harness (100% Green)

| Suite | Command | Cases | Verification Focus |
| :--- | :--- | :---: | :--- |
| **Clinical Protocol Rules** | `node tests/clinical_rules_test.js` | **18 / 18** | Evaluates MoHFW NCD & Pregnancy guidelines, emergency danger signs, and boundary transitions. |
| **Safety & Edge Cases** | `node tests/edge_cases_test.js` | **15 / 15** | Audits extremes, Devanagari numerals, bidirectional negations, and biological sex guards. |
| **Multilingual Model Harness** | `node tests/model_harness_test.js` | **32 / 32** | Pure Hindi, Hinglish, and English entity extraction with sub-1ms latency budget. |
| **Qwen Clinical Summaries** | `node tests/qwen_summary_test.js` | **6 / 6** | Plain Hindi summary explanations with < 120-word length bounds. |
| **Mobile Route Integrity** | `node tests/route_smoke_test.js` | **3 / 3** | All 19 navigation routes, static/dynamic route precedence, and query string patches. |
| **Sync Idempotency & Auth** | `python tests/sync_idempotency_test.py` | **13 / 13** | JWT authentication, multi-entity batch push/pull, and duplicate replay stability. |

To run all suites locally:
```powershell
node tests/clinical_rules_test.js
node tests/edge_cases_test.js
node tests/model_harness_test.js
node tests/qwen_summary_test.js
node tests/route_smoke_test.js
python tests/sync_idempotency_test.py
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js v18+ (tested on v22.18.0)
- Python 3.10+
- npm workspaces support

### 1. Start the FastAPI Sync Backend & Supervisor Command Center
```powershell
python -m services.api.main
```
- **Backend API:** `http://127.0.0.1:8000`
- **Swagger Documentation:** `http://127.0.0.1:8000/docs`
- **Supervisor Web Dashboard:** `http://127.0.0.1:8000/dashboard`
  *(Default Credentials: Username: `supervisor` | Password: `password123`)*

### 2. Start the Mobile Application (Expo)
```powershell
npm run start:mobile
```
- Press `a` for Android Emulator / Device.
- Press `w` for Web Preview.

### 3. Build Shared Packages (When editing protocols/types)
```powershell
npm run build --workspace=@asha/shared
```

---

## 📁 Repository Structure

```text
ASHA-AI-COPILOT/
├── apps/
│   ├── mobile/                 # React Native Expo Mobile App (19 screens)
│   │   ├── app/                # Expo Router routes (tabs, screening, patients)
│   │   ├── components/         # Accessible tactile UI components (48dp+)
│   │   ├── services/           # SQLite repos, Model Manager, Sync Service
│   │   └── constants/          # Bilingual design tokens and typography
│   └── dashboard/              # Supervisor Web Command Center (index.html)
├── packages/
│   └── shared/                 # Shared TypeScript package (@asha/shared)
│       ├── src/engine.ts       # 18 Deterministic MoHFW clinical rules
│       ├── src/validation.ts   # Fail-closed vital and demographic validation
│       ├── src/nlp/            # Number normalizer and multilingual extractor
│       └── src/protocols/      # Bilingual JSON clinical protocols
├── services/
│   └── api/                    # FastAPI Synchronization Backend
│       ├── main.py             # REST API routes & supervisor endpoints
│       ├── database.py         # Cloud SQLite schema, migrations & seeds
│       └── auth.py             # JWT bearer authentication & password hashing
├── tests/                      # Automated test harnesses (87 automated test cases)
└── docs/                       # PRD specifications and clinical guidelines
```

---

## 📜 Documentation Index

* [`SUPERVISOR_DASHBOARD.md`](SUPERVISOR_DASHBOARD.md) — Architecture and guide for the Supervisor Command Center.
* [`PROBLEMS_AND_CHALLENGES.md`](PROBLEMS_AND_CHALLENGES.md) — Breakdown of problems solved and technical challenges overcome.
* [`EDGE_CASES.md`](EDGE_CASES.md) — Comprehensive catalogue of clinical and linguistic edge cases.
* [`ASHA_AI_Copilot_Feature_Implementation_Brief.md`](ASHA_AI_Copilot_Feature_Implementation_Brief.md) — Architectural brief for the 4 core features.
* [`AGENTS.md`](AGENTS.md) — Engineering rules, invariants, and monorepo conventions.

---

## ⚖️ Safety & Ethical Compliance

**ASHA AI Copilot is an assistive screening aid, not an autonomous medical diagnostic device.**
All risk flags and referral advisories are computed deterministically from approved government protocols. Final clinical verification and data commitment always require explicit human-in-the-loop confirmation by the healthcare worker. Raw consultation audio is transcribed locally in memory and never synced to remote servers.
