---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [sources/backend-api.md]
tags: [dashboard, supervisor, web]
---

# Supervisor Dashboard — `apps/dashboard/`

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
2. **Top Shell & Navigation:** Catchment indicator ("PHC Rampur · Sector 3"), real-time sync pill, and 5 primary navigation tabs:
   - 🚨 **Triage & Surveillance (`/triage`)**: 4 KPI cards with trend indicators, urgent danger sign queue with triage button, and active field worker summary.
   - 👥 **Beneficiary Directory (`/patients`)**: Search with debounce, village/hamlet filter chips, pagination (10/25/50), add/edit/archive modals.
   - 📋 **Clinical Screenings (`/screenings`)**: Full inspection list with collapsible drawer for vitals breakdown, rule engine evaluations, AI summaries, and voice transcripts.
   - 🏥 **Referrals & Follow-ups (`/followups`)**: Status tabs, priority filter chips, destination facility tracking, and interactive disposition modal.
   - 👩‍⚕️ **Field Workers & Devices (`/workers`)**: Deployment grid with live sync health pills, screening counts, and registration modal.
3. **Interactive CRUD Modals:**
   - `PatientModal.tsx`: Beneficiary registration, edit, and monotonic soft delete.
   - `FollowupModal.tsx`: Facility escalation, urgency classification, and assignee tracking via `PATCH /followups/:id`.
   - `WorkerModal.tsx`: Registration of ASHA/ANM workers.
4. **Live Polling & Visibility API:** Polls `/dashboard/summary` and `/dashboard/high-priority` every 15s; pauses automatically when tab is hidden (`document.hidden`).
5. **CSV Export Action:** One-click download of filtered surveillance datasets into CSV format.

## Related

- [[sources/backend-api]] · [[entities/supervisor-backend-service]]
- [[flows/sync-lifecycle]] · [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]]
- [[concepts/bilingual-design-system]]
