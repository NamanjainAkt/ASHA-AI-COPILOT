---
type: entity
created: 2026-10-07
updated: 2026-10-07
sources: [sources/backend-api.md, sources/supervisor-dashboard.md]
tags: [backend, runtime, fastapi]
---

# `services.api.main:app` — the Supervisor Backend Service

The FastAPI application object as a runtime thing, as distinct from its endpoint list
([[sources/backend-api]]). This page covers the behaviours that affect how the system behaves
rather than what it serves.

## Verified running

```powershell
python -m services.api.main
# INFO: Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
# INFO:     Application startup complete.
```

Confirmed live on 2026-10-06: `GET /patients` returned **200** with 5 seeded patients plus
records from earlier test pushes. The docset's `python services/api/main.py` fails with
`ImportError` ([[sources/backend-api]]).

## Import-time database mutation

```python
init_db()             # main.py:41
seed_demo_data()      # main.py:42  — "Also initialize immediately so DB is ready for any synchronous test/import"
```

Both run at **module import**, in addition to the `lifespan` handler (`:19-23`). Three
consequences:

1. Importing `services.api.main` **writes to `services/api/asha_backend.db`** as a side effect.
2. `tests/sync_idempotency_test.py:7` depends on this implicitly — the DB is seeded by the import.
3. `seed_demo_data()` uses `INSERT OR REPLACE` unconditionally (`database.py:102-248`), so **every
   process start and every `/seed-demo` call overwrites the demo rows.** Any real record that
   happens to share a demo id (`p-001`…`p-005`, `s-001`, `s-002`, `f-001`, `f-002`) is destroyed
   on restart. That is fine for a demo and unacceptable for any deployment where those ids might
   collide — and client-generated ids (`p-${Date.now()}`) make collision unlikely, which is the
   only reason this is survivable today.

`withTestClient` and any future non-test import inherits the same mutation.

## CORS

```python
allow_origins=["*"], allow_credentials=True   # main.py:32-38
```

Browsers reject credentialed wildcard origins, so this pairing is effectively dead config. It
also never applies in practice: the dashboard is served by this same app from the same origin
(`apps/dashboard/index.html` via `FileResponse`, `main.py:47-54`), so its `fetch` calls are
same-origin and CORS never engages.

## Mock authentication

`POST /auth/login` (`:66-90`) accepts `username`/`password` and **discards both** (`:67-71`),
minting a fake token. The source comment is candid: `# Hackathon role-based demo auth` (`:68`).

The mobile app **never calls it**. Authentication on-device is a local PIN against SecureStore
([[flows/onboarding-and-auth]]) — the two auth systems share nothing, and the backend has no
authorisation on any route. Combined with `/sync/push` accepting arbitrary client ids, any process
that can reach port 8000 can inject or overwrite patients, screenings, and follow-ups.

## Resource handling

Plain `sqlite3.connect(DB_PATH)` with `row_factory = sqlite3.Row` (`database.py:9-12`):
no context manager, no connection pooling, no `check_same_thread` flag, and **no
`PRAGMA foreign_keys = ON`** — so the foreign keys declared in the schema (`database.py:56`,
`:62`) are inert under SQLite's default. Every handler opens and closes its own connection; error
paths that raise `HTTPException` before reaching `conn.close()` (e.g. `main.py:117-119`) rely on
garbage collection to release the handle.

## Reload mode

```python
uvicorn.run("services.api.main:app", host="0.0.0.0", port=8000, reload=True)  # main.py:459
```

The app is passed as an **import string** — required by `reload=True`. This is also why the file
assumes the repo root is on `sys.path`, coupling it to `python -m` invocation from the root.

Two operational notes: `reload=True` is on in the production-style entry point, and it is what
makes startup slow (a reloader process plus a child worker were both observed). `host="0.0.0.0"`
binds all interfaces.

## One genuine logic bug

`GET /dashboard/workers` (`:434-449`):

```sql
LEFT JOIN screenings s ON 1=1     -- :444
```

An unconditional cross join. `COUNT(DISTINCT s.id)` is therefore the **global** screening count
for every worker row, identical across rows and inflating with each screening. The dashboard
renders this number per worker card (`apps/dashboard/index.html:215-242`), so the supervisor sees
the same total attributed to every ASHA worker. This is the one place where a bug in the backend
directly misinforms a clinical supervisor about field activity.

## Deliberate behaviour worth preserving

- `INSERT OR REPLACE` keyed on the client-supplied id is the **right** idempotency primitive here,
  and it is genuinely verified by a replay test ([[sources/tests-and-tooling]]).
- `/sync/push` always reports `"created"` on success (`:338`) rather than distinguishing
  updated-vs-created. Honest only because the client discards the response
  ([[entities/sync-engine]]) — fix the client and this should become a real
  created/updated/ignored distinction.
- The dashboard footer carries a "Not an Autonomous Diagnosis System" disclaimer
  (`index.html:158`), correctly positioning the product as decision support
  ([[concepts/deterministic-triage]]).

## Related

- [[sources/backend-api]] · [[sources/supervisor-dashboard]] · [[sources/tests-and-tooling]]
- [[entities/sync-engine]] · [[flows/sync-lifecycle]]
- [[concepts/offline-first-invariants]] · [[analyses/release-readiness-2026-10]]
