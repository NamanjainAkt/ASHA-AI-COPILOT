---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [entities/supervisor-backend-service.md, flows/sync-lifecycle.md]
tags: [backend, fastapi, sync, api]
---

# FastAPI Backend — `services/api/`

Three Python files, one SQLite file, and one HTML dashboard served through the API.
Every claim here is code-verified; the run-command problem was confirmed empirically on
2026-10-06.

## Running it — the documented command is broken

`README.md:54` and `package.json:14` (`"api:start": "python services/api/main.py"`) both
prescribe a command that **cannot work**:

```text
$ python services/api/main.py
File "C:\Andy projects\Asha\services\api\main.py", line 7, in <module>
    from .models import (
ImportError: attempted relative import with no known parent package
```

Cause: `main.py:7` and `:15` use leading-dot relative imports, and neither
`services/__init__.py` nor `services/api/__init__.py` exists (only `__pycache__`). Running by
path puts the module in `sys.modules` as `__main__` with `__package__ = None`, so `.models` has
no parent package to resolve against.

**Working command** (verified 2026-10-06, starts and serves):

```powershell
python -m services.api.main
```

Under `-m`, Python synthesizes namespace packages (PEP 420) so `__package__ == "services.api"`.
The same requirement is why `tests/sync_idempotency_test.py:3` must `sys.path.insert` the repo
root. The `uvicorn.run("services.api.main:app", …, reload=True)` call at `main.py:459` also
already assumes the repo root is on `sys.path`. Adding `__init__.py` files would fix the root
cause properly but would **not** make script-path invocation work — that needs absolute imports.

## Bootstrap side effects

`lifespan` calls `init_db()` then `seed_demo_data()` (`main.py:19-23`, wired at `:29`), **and**
both are *also* called at import time (`main.py:41-42`, comment: "Also initialize immediately so
DB is ready for any synchronous test/import"). So merely importing `services.api.main` writes to
`services/api/asha_backend.db`. The Python test relies on this implicitly.

CORS is `allow_origins=["*"]` with `allow_credentials=True` (`main.py:32-38`) — browsers reject
credentialed wildcard origins, so the combination is effectively dead config. It never applies in
practice anyway, since the dashboard is served same-origin.

## Endpoint inventory

| Method | Path | Handler | Line | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/` | `serve_dashboard` | `:49-54` | serves `apps/dashboard/index.html` |
| GET | `/dashboard` | `serve_dashboard` | `:50-54` | same handler, stacked decorator |
| GET | `/health` | `health_check` | `:56-63` | ad-hoc dict |
| POST | `/auth/login` | `login` | `:66-90` | **mock** — discards credentials, mints a fake token (`:68` comment: "Hackathon role-based demo auth") |
| GET | `/patients` | `list_patients` | `:93-109` | `?search=&village=`, raw dicts |
| GET | `/patients/{id}` | `get_patient` | `:111-120` | 404 if missing |
| POST | `/patients` | `create_patient` | `:122-150` | `PatientCreate` → `PatientResponse` |
| GET | `/screenings` | `list_screenings` | `:153-177` | `?patient_id=&screening_type=`, decodes JSON columns |
| GET | `/screenings/{id}` | `get_screening` | `:179-192` | |
| POST | `/screenings` | `create_screening` | `:194-224` | returns an ad-hoc dict (no `response_model`) |
| GET | `/followups` | `list_followups` | `:227-248` | `?status=&priority=`, joined |
| PATCH | `/followups/{id}` | `update_followup` | `:250-262` | status only |
| POST | `/sync/push` | `sync_push` | `:265-349` | the idempotent batch upsert |
| GET | `/sync/pull` | `sync_pull` | `:351-380` | `?since=`, incremental |
| GET | `/dashboard/summary` | `dashboard_summary` | `:383-415` | KPI counts |
| GET | `/dashboard/high-priority` | `dashboard_high_priority` | `:417-432` | triage list |
| GET | `/dashboard/workers` | `dashboard_workers` | `:434-449` | **has a real bug**, below |
| POST | `/seed-demo` | `reset_seed_data` | `:451-455` | re-runs the seeder |

There is **no JSON route at `/dashboard`** — that path serves HTML. There is also **no
`POST /followups`**: follow-ups can only be created through `/sync/push`.

## `/sync/push` — the idempotency mechanism

Per record, in order (`main.py:280-338`):

1. Device upsert (`main.py:272-275`) — `INSERT OR REPLACE INTO devices (id, worker_id, last_sync_at)`.
2. Dispatch on `item.entity`, then a single upsert per entity, all hardcoding `sync_status='synced'`:

```sql
-- patient   main.py:286-299
INSERT OR REPLACE INTO patients (id, name, age, sex, phone, village, household_id,
                                created_at, updated_at, sync_status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')

-- screening main.py:301-315   (same shape, 11 columns)
-- followup  main.py:317-330   (same shape, 10 columns)
```

3. Event log (`main.py:333-336`) — `INSERT INTO sync_events (device_id, client_record_id, entity,
   operation, status, timestamp)` with `status='success'`.

**There is no server-side id generation.** For all three entities the primary key is the
client's `client_record_id` (`main.py:290`, `:305`, `:321`). Idempotency is entirely a
consequence of `INSERT OR REPLACE` keyed on that id — which is exactly what
`tests/sync_idempotency_test.py:46-56` asserts.

Three gaps in the same handler:

- **`worker` is a legal entity but has no branch.** `SyncRecordItem.entity` includes `'worker'`
  (`models.py:67`), but there is no `worker` branch in the if/elif chain — a worker record falls
  through, still logs a success event, and reports `status="created"` while writing nothing
  (`main.py:332-338`).
- **`operation` is never branched on.** A `delete` record performs an upsert.
- **Every replay appends another `sync_events` row** — the table has no unique constraint on
  `client_record_id` (`database.py:78-85`), so it grows unboundedly on repeated sync.

Response: `success` is `len(failed) == 0` (`:346`); status is always `"created"` on success
(`:338`) or `"error"` on exception (`:340`) — it never emits `"updated"` or `"ignored"` even
though both are in the model Literal (`models.py:79`).

## `/sync/pull`

Incremental read using `updated_at > ?` against patients, screenings, followups
(`main.py:356-371`). The f-string interpolation only splices a fixed literal `WHERE` fragment,
not user input, so it is safe. `workers` and `devices` are never returned, and there are **no
delete tombstones** — a record deleted server-side can never be deleted client-side.

## `sync_status` is `'synced'` server-side, always

Every backend write path hardcodes `'synced'` in the SQL literal (`main.py:132`, `:203`,
`:319`; `database.py:117`, `:158`, `:175`, `:218`, `:234`), and the column default is also
`'synced'` (`database.py:38`, `:52`, `:66`). So `SyncStatus`'s `'pending'` and `'failed'`
members (`types.ts:1`) are unreachable on the server — they exist only in the mobile SQLite
queue.

## `/dashboard/workers` — a genuine bug

```sql
SELECT w.*, COUNT(DISTINCT s.id) as screening_count, MAX(d.last_sync_at) as last_sync_time
FROM workers w
LEFT JOIN devices d ON w.id = d.worker_id
LEFT JOIN screenings s ON 1=1          -- main.py:444
GROUP BY w.id
```

`ON 1=1` is an unconditional cross join, so `screening_count` is the **global** screening total
repeated on every worker row and growing with each screening. `last_sync_time` is `NULL` for
workers with no device row. The dashboard renders this number directly
([[sources/supervisor-dashboard]]).

## Schema and seeding

`services/api/asha_backend.db` (`database.py:7`). 6 tables (`database.py:18-85`): `workers`,
`patients`, `screenings`, `followups` (all with `sync_status DEFAULT 'synced'`), plus
`devices` and `sync_events` which exist only server-side. `followups.screening_id` has **no FK**
to `screenings`, though `/dashboard/high-priority` left-joins on it (`main.py:426`).

Connections are plain `sqlite3.connect(DB_PATH)` with `row_factory = sqlite3.Row`
(`database.py:9-12`) — no context manager, no pooling, **no `PRAGMA foreign_keys = ON`**, so the
declared foreign keys are inert under SQLite defaults. Every handler opens and closes its own
connection; error paths that raise `HTTPException` before `conn.close()` rely on GC.

`init_db()` seeds 2 workers only when empty (`database.py:88-97`): `worker-001` Sunita Devi
(asha, Rampur) and `supervisor-001` Dr. Rajesh Verma (supervisor, PHC Rampur).

`seed_demo_data()` (`database.py:102-248`) runs **unconditionally** on every startup and every
`/seed-demo` call, with `INSERT OR REPLACE`: 5 patients (`p-001`..`p-005`, `:106-112`),
2 screenings (`s-001` NCD hypertension for Sunita, `:121-170`; `s-002` maternal danger signs for
Meena, `:189-230`), 2 follow-ups (`:173-186`, `:232-245`). Because it runs at import time
(`main.py:42`), **importing the app rewrites these rows** — including when the Python test
imports it.

## Pydantic models

`services/api/models.py:1-93` — 15 models. All entity-create models declare
`id: str = Field(..., description="Client-generated UUID")`, which documents the idempotency
contract at the type level.

`ScreeningResponse` and `FollowUpResponse` are **defined but never used** — no route references
them. `datetime` is imported (`:3`) and never used.

## Dependencies

`services/api/requirements.txt` (4 lines): `fastapi>=0.110.0`, `uvicorn>=0.28.0`,
`pydantic>=2.6.0`, `python-multipart>=0.0.9`.

Gaps: **`httpx` is not listed** but is required by `fastapi.testclient.TestClient`, so a clean
install following the file cannot run the sync test. `python-multipart` is listed but imported
nowhere. There is **no `pyproject.toml`** anywhere in the repo. Installed and verified working:
fastapi 0.136.3, pydantic 2.13.4, Python 3.14 (cpython-314 bytecode).

## Related

- [[entities/supervisor-backend-service]] · [[flows/sync-lifecycle]] · [[entities/sync-engine]]
- [[sources/supervisor-dashboard]] · [[sources/tests-and-tooling]] · [[sources/monorepo-overview]]
- [[concepts/offline-first-invariants]]
