---
type: source
created: 2026-10-07
updated: 2026-10-10
sources: [sources/backend-api.md]
tags: [dashboard, supervisor, web]
---

# Supervisor Dashboard — `apps/dashboard/src/`

A modern React 18 + Vite SPA architecture with Tailwind CSS, Lucide icons, and zero-dependency bilingual engine (`hi` / `en`).

## Build & Production Serving

- **Source Code:** `apps/dashboard/src/` (`App.tsx`, `main.tsx`, `views/`, `components/`, `context/`, `i18n/`, `services/api.ts`).
- **Production Build:** `npm run build --workspace=@asha/dashboard` compiles into `apps/dashboard/dist/`.
- **FastAPI Serving (`services/api/main.py`):**
  - Mounts `/assets` statically from `apps/dashboard/dist/assets`.
  - Serves `dist/index.html` on `/` and `/dashboard` (falling back to `apps/dashboard/index.html` if unbuilt).
  - Dev server proxy forwards API calls from `localhost:5173` to `127.0.0.1:8000`.

## Architecture & Features (Milestones 1–4)

1. **Zero-Dependency Bilingual Engine:** Synchronized Hindi & English dictionaries (`src/i18n/translations.ts`) with persistent storage and instant toggle.
2. **Top Shell & Navigation:** Generic supervisor workspace label and 5 primary navigation tabs:
   - 🚨 **Triage & Surveillance (`/triage`)**: 4 backend-derived KPI cards, danger sign queue with triage button, and field worker summary.
   - 👥 **Beneficiary Directory (`/patients`)**: Search with debounce, village/hamlet filter chips, pagination (10/25/50), add/edit/archive modals.
   - 📋 **Clinical Screenings (`/screenings`)**: Full inspection list with collapsible drawer for vitals breakdown, rule engine evaluations, AI summaries, and voice transcripts.
   - 🏥 **Referrals & Follow-ups (`/followups`)**: Status tabs, priority filter chips, destination facility tracking, and interactive disposition modal.
   - 👩‍⚕️ **Field Workers & Devices (`/workers`)**: Worker grid with recorded sync state, screening counts, and registration modal.
3. **Interactive CRUD Modals:**
   - `PatientModal.tsx`: Beneficiary registration, edit, and monotonic soft delete.
   - `FollowupModal.tsx`: Facility escalation, urgency classification, and assignee tracking via `PATCH /followups/:id`.
   - `WorkerModal.tsx`: Registration of ASHA/ANM workers.
4. **Live Polling & Visibility API:** Polls `/dashboard/summary` and `/dashboard/high-priority` every 15s; pauses automatically when tab is hidden (`document.hidden`).
5. **CSV Export Action:** One-click download of filtered surveillance datasets into CSV format.

## Data integrity and empty state

- Dashboard KPIs and workers are fetched through `src/services/api.ts:55-74`; the React client has no sample-row fixture.
- Removed fixed catchment labels (`src/i18n/translations.ts:8,194`), fabricated KPI trends/status pills (`src/views/TriageView.tsx:24-115`, `src/components/Header.tsx:24-77`), and `Rampur` fallbacks (`src/views/TriageView.tsx:190`, `src/views/FollowupsView.tsx:154`). Missing location or facility values render as `—`.
- Patient and worker forms start without a prefilled catchment (`src/components/modals/PatientModal.tsx:25-36`, `src/components/modals/WorkerModal.tsx:22-29`). Patient sex must be explicitly selected before save (`src/components/modals/PatientModal.tsx:88-90`).
- Backend test scripts use temporary SQLite files (`tests/supervisor_api_test.py:8-10`, `tests/sync_idempotency_test.py:6-8`) and `ASHA_DB_PATH` (`services/api/database.py:8`); test rows no longer accumulate in the dashboard's persistent database.
- The existing database was purged of records whose IDs matched known demo/test fixtures; default demo seeding remains opt-in. Default demo auth accounts remain to support the current dashboard auto-login flow.

## Related

- [[sources/backend-api]] · [[entities/supervisor-backend-service]]
- [[flows/sync-lifecycle]] · [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]]
- [[concepts/bilingual-design-system]]
