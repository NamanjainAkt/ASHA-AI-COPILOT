---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [sources/backend-api.md]
tags: [dashboard, supervisor, web]
---

# Supervisor Dashboard — `apps/dashboard/index.html`

A single 253-line HTML file. No JS/CSS/asset directory, no build step. It is standalone in
origin but **served by FastAPI** as a `FileResponse` on both `/` and `/dashboard`
(`services/api/main.py:47-54`), so it is same-origin with the API.

## Path resolution

```python
DASHBOARD_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..",
                                              "apps", "dashboard", "index.html"))  # main.py:47
```

Two `..` hops from `services/api/` reaches the repo root. Registered via stacked decorators on
one handler (`main.py:49-50`), falling back to a JSON message if the file is missing
(`:52-54`). There is no `StaticFiles` mount.

## Styling

CDN Tailwind with an inline config (`index.html:7`, `:11-29`) plus Google Fonts (Inter, Material
Symbols). The palette deliberately mirrors the mobile theme: `primary #0F766E`,
`primaryBright #14B8A6`, `primaryDark #005C55`, `clinicalDanger #DC2626`,
`clinicalWarning #F59E0B`, `clinicalSuccess #16A34A` (`index.html:15-22`) — the same clinical
teal/amber/crimson system as `apps/mobile/constants/theme.ts`. A coherent choice for a
triage UI: one visual language across the worker's phone and the supervisor's screen.

## Data flow

`API_BASE = window.location.origin` (`index.html:162`), then three **sequential** awaits in
`fetchDashboardData()`:

1. `GET /dashboard/summary` → fills `stat-patients`, `stat-screenings`, `stat-high-priority`,
   `stat-followups` (`index.html:167-174`).
2. `GET /dashboard/high-priority` → renders the 5-column triage table; empty state shows
   "All clear!" (`:177-212`).
3. `GET /dashboard/workers` → worker cards with `screening_count` (`:215-242`).

Runs once on load and then **polls every 10 s** (`:249-250`). A manual refresh button calls the
same function (`:49`). All failures are swallowed to `console.warn` (`:243-245`) with **no
user-visible error state** — a supervisor looking at a stale or empty screen has no way to tell
"no high-risk cases" from "the backend is down".

## What it renders

| Region | Content | Lines |
| :--- | :--- | :--- |
| KPI row | 4 cards: Total Patients, Screenings Recorded, High-Risk Triage, Pending Follow-ups | `:60-108` |
| Triage table | Beneficiary, Village/Phone, Clinical Trigger, Due Date, Action — 5 columns | `:122-137` |
| Worker panel | Field worker deployment cards | `:142-153` |
| Footer | "Not an Autonomous Diagnosis System" disclaimer | `:158` |

The disclaimer is the right instinct for a clinical triage surface: the tool positions itself as
decision *support*, matching the deterministic-triage invariant
([[concepts/deterministic-triage]]).

## Three functional gaps

1. **The triage button is a stub.** The "Referral Triage" control only fires a native
   `alert()` (`index.html:204`). No `PATCH` ever reaches `PATCH /followups/{id}`
   (`services/api/main.py:250-262`) — so **the dashboard cannot close a follow-up**. The
   supervisor sees the queue and can acknowledge it in a browser dialog, and nothing else.
2. **Active-worker count is hard-coded.** `active-workers-count` is static markup reading
   "2 Active" (`index.html:148`) and is never updated by the fetch logic, despite
   `DashboardSummary` having an `active_workers` field (`types.ts:145`).
3. **`screening_count` per worker is wrong**, because of the `LEFT JOIN screenings s ON 1=1`
   cross join in the endpoint it reads (`services/api/main.py:444`). Every worker card shows the
   same global total. See [[sources/backend-api]].

## Why it matters to the field loop

This screen is the only place a PHC Medical Officer sees field activity, and it is the payoff
for the entire offline-sync architecture — the reason a worker's queued records exist at all.
It is also the thinnest-tested part of the system: no test touches it, its two data-critical
controls are broken, and it has never been exercised against a populated database in this
session's testing.

## Related

- [[sources/backend-api]] · [[entities/supervisor-backend-service]]
- [[flows/sync-lifecycle]] · [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]]
- [[concepts/bilingual-design-system]]
