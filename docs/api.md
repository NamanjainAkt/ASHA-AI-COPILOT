# Backend API Specification

FastAPI Sync and Supervisor Backend (`services/api`).

## Endpoints

### 1. Authentication
- `POST /auth/login`: Seeded demo worker and supervisor authentication.

### 2. Patients
- `GET /patients`: List patients with optional `search` and `village` filters.
- `GET /patients/{id}`: Retrieve patient details.
- `POST /patients`: Idempotently create or update patient record.

### 3. Screenings
- `GET /screenings`: List screenings with optional `patient_id` and `screening_type` filters.
- `GET /screenings/{id}`: Retrieve detailed screening record.
- `POST /screenings`: Store verified screening record.

### 4. Follow-ups
- `GET /followups`: Retrieve pending and completed follow-up tasks with priority sorting.
- `PATCH /followups/{id}`: Update follow-up status (`pending` -> `completed`).

### 5. Sync Queue
- `POST /sync/push`: Batch upload client records (`patient`, `screening`, `followup`) with UUID idempotency.
- `GET /sync/pull`: Retrieve latest records modified since given timestamp.

### 6. Supervisor Command Center
- `GET /dashboard`: Live Web Supervisor Command Center interface.
- `GET /dashboard/summary`: KPI summary metrics (total patients, screenings, priority cases).
- `GET /dashboard/high-priority`: Triage list of danger-sign cases and urgent referrals.
- `GET /dashboard/workers`: Worker sync statuses and record count.
