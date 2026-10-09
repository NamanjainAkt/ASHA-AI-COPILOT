# ASHA AI Copilot (आशा Copilot)

An offline-first, Hindi voice-enabled AI copilot for Accredited Social Health Activists (ASHA) and frontline community healthcare workers.

---

## 🏛️ System Architecture

```text
┌───────────────────────────────────────────────────────────┐
│                    MOBILE APP                             │
│       React Native + Expo (Android / iOS / Web)           │
│                                                           │
│  UI Layer (12 Stitch Screens)                             │
│     ├── Home Dashboard & Field Visit Dispatcher           │
│     ├── Tactile 64dp Voice Capture Dock                   │
│     ├── Visit Summary & AI Clinical Risk Review           │
│     ├── Patient Beneficiary Directory                     │
│     ├── High-Risk Emergency Triage                        │
│     ├── Care Tracking & Follow-ups                        │
│     └── Offline Sync Queue Manager                        │
│                                                           │
│  On-Device AI Pipeline                                    │
│     ├── Whisper Tiny Hindi STT                            │
│     ├── Cactus Needle 2 Structured Entity Extraction      │
│     ├── Clinical Data Validation Layer                    │
│     ├── Deterministic TypeScript Rule Engine              │
│     └── Qwen3-1.7B Simple Hindi Clinical Summarizer       │
│                                                           │
│  Offline Persistence Layer                                │
│     └── Expo SQLite (Patients, Screenings, Follow-ups)    │
│                                                           │
│  Background Sync Queue                                    │
│     └── Idempotent Batch Push / Pull with Client UUIDs   │
└──────────────────────────┬────────────────────────────────┘
                           │ Network Reconnection
                           ▼
┌───────────────────────────────────────────────────────────┐
│              FASTAPI SYNCHRONIZATION BACKEND              │
│     SQLite / Supabase DB · Python 3.14 · REST API         │
│     ├── /sync/push (Idempotent batch upload)             │
│     ├── /sync/pull (Incremental sync retrieval)           │
│     └── /dashboard (Live Supervisor Web Command Center)  │
└───────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### 1. Start the FastAPI Sync Backend & Supervisor Web Dashboard
In the project root, run:
```bash
python -m services.api.main
```
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Supervisor Command Center: [http://localhost:8000/dashboard](http://localhost:8000/dashboard)

### 2. Run the Mobile App (Expo)
```bash
npm run start:mobile
```
- Press `a` for Android Emulator / Device (Expo Development Build).
- Press `w` for Expo Web preview in your browser.
- Press `i` for iOS Simulator.

To build and install the Android development app directly from the repository root:
```bash
npx expo run:android apps/mobile
```
The `apps/mobile` argument is required when invoking Expo directly from the monorepo root;
without it, Expo targets the root project instead of the mobile workspace. If port 8081 is
already occupied, use `npx expo run:android --port 8082 apps/mobile` (`--port` goes before
the project directory).

### 3. Run Automated Verification Tests
```bash
# Clinical Rule & Validation Suite
node tests/clinical_rules_test.js

# Backend Sync Idempotency Suite
python tests/sync_idempotency_test.py
```

---

## 📋 PRD Section 105: Definition of Done Checklist

- [x] **[✓] Hindi voice can be recorded** — Real-time waveform & Expo Audio capture in `voice-capture.tsx`.
- [x] **[✓] Hindi speech is transcribed locally** — Local Whisper Tiny Hindi model driver.
- [x] **[✓] Transcript can be converted to structured fields** — Cactus Needle 2 schema extractor.
- [x] **[✓] Structured fields are validated** — Strict boundary and plausibility validation in `validation.ts`.
- [x] **[✓] Missing/uncertain values are detected** — Auto-flags missing glucose/BP without stalling.
- [x] **[✓] Deterministic screening rules execute** — Protocol-driven TypeScript engine in `engine.ts`.
- [x] **[✓] Rule reasons are displayed** — Explainability cards with "Why Was This Flagged?" citations.
- [x] **[✓] Qwen generates a short Hindi explanation** — Plain Hindi summary without autonomous diagnosing.
- [x] **[✓] Worker can edit AI output** — Full inline editing of extracted values in `summary.tsx`.
- [x] **[✓] Worker confirms final record** — Human-in-the-loop verification checkbox required before save.
- [x] **[✓] Record saves offline** — Persisted directly into Expo SQLite (`asha_copilot.db`).
- [x] **[✓] App survives restart while offline** — Cold start reads SQLite database seamlessly.
- [x] **[✓] Sync queue works** — Dedicated `sync_queue` table queues records for delayed upload.
- [x] **[✓] Duplicate upload does not duplicate records** — Client-side UUIDs guarantee backend idempotency.
- [x] **[✓] Reconnection triggers sync** — Network monitor triggers batch push when online.
- [x] **[✓] Supervisor receives synced record** — FastAPI records ingested data and updates metrics.
- [x] **[✓] Dashboard shows priority cases** — High-risk emergencies highlighted in web supervisor center.
- [x] **[✓] Follow-ups are visible** — Dedicated care tracking tab for pending and completed visits.
- [x] **[✓] No raw audio is unnecessarily retained** — Speech-to-text operates locally and discards audio buffers.
- [x] **[✓] No cloud AI is required for core workflow** — All screening inference is 100% on-device.
- [x] **[✓] Demo works on actual target Android device** — Tactile functionalism with 48dp+ touch targets.
