---
type: flow
created: 2026-10-07
updated: 2026-10-07
sources: [entities/sync-engine.md, entities/supervisor-backend-service.md, sources/supervisor-dashboard.md]
tags: [flow, sync, offline, network]
---

# Flow — Offline to Supervisor

How a screening recorded in a village reaches a PHC Medical Officer. The design intent is
store-and-forward: nothing in the clinical path waits for this flow, and the flow never loses a
record. Both halves of that are true; several details are not.

```text
Worker confirms screening
  → INSERT screenings (sync_status='pending')  + INSERT sync_queue
  ── … arbitrary offline period, app restarts, no network needed … ──
  → [manual] Sync tab → "Sync Now"
  → POST /sync/push (whole queue, one request)
  → INSERT OR REPLACE per record, keyed on client id
  → DELETE queue row + set entity sync_status='synced'
Supervisor browser polls /dashboard/* every 10 s
```

## Stage 1 — dual write

Every write screen performs a local insert **and** a queue insert in the same handler:
`summary.tsx:135-182`, `manual-entry.tsx:79-101`, `patients/new.tsx:70-73`,
`followups.tsx:46-47`, `patients/[id].tsx:71-72`.

Both writes use `runAsync`. Across all five write paths (`summary.tsx`, `new.tsx`,
`followups.tsx`, `manual-entry.tsx`, `patients/[id].tsx`), both writes execute inside a shared
`withTransactionAsync` with the tx handle threaded through `runner = tx || getDatabase()`, ensuring
on-device atomicity so a crash cannot leave a split write or orphaned sync entry.

Note `followupRepository.updateStatus` **does not enqueue**; callers must, and all five do. So the
invariant "persist ⇒ queue" holds only by caller discipline, not by the repository.

## Stage 2 — the offline period

Records accumulate in `sync_queue` indefinitely. App restarts, cold boots and reboots are all
non-events: everything is in SQLite ([[entities/local-sqlite-store]]). This is the Field
Invariant working correctly and it is the strongest part of the system.

Two accumulating-cost notes: `sync_queue` has **no indexes** (`database.ts:83-92`) despite
`getPending()` ordering by `created_at`; and `followupRepo.list()` has **no LIMIT**, so the
Follow-ups tab does a full scan + join on every focus.

## Stage 3 — manual trigger

**There is no automatic trigger of any kind.** No `NetInfo`, no `@react-native-community/netinfo`,
no `AppState` listener, no interval, no retry/backoff
([[entities/sync-engine]]). Sync runs only when a worker taps "Sync Now"
(`(tabs)/sync.tsx:48`) — which directly contradicts `README.md:94`'s checked-off "Reconnection
triggers sync".

`triggerSync` (`:41-115`): re-entrancy guard (`:42-44`) → latch (`:46-47`) → `getPending()` with
**no LIMIT** (`:50`) → map records (`:57-63`) → `POST` (`:71-78`) → parse (`:84`) → mark
synced (`:86-97`).

`backendUrl` defaults to `http://127.0.0.1:8000` (`:16`) — plaintext HTTP, and on Android
loopback resolves to **the device itself**, so a dev-machine backend is unreachable until the
worker (or a tester) edits the URL field on the Sync screen. `deviceId` and `workerId` are
hard-coded with no setters (`:17-18`), so every device reports as the same worker
(`worker-001`).

## Stage 4 — server upsert

`/sync/push` (`services/api/main.py:265-349`). Per record: device upsert (`:272-275`), then
`INSERT OR REPLACE` on the entity keyed **entirely** on the client's `client_record_id`
(`:286-330`), then an audit row in `sync_events` (`:333-336`). No server-side id generation.

Idempotency is real and tested: `tests/sync_idempotency_test.py:46-56` replays an identical
payload and asserts the patient count is unchanged ([[sources/tests-and-tooling]]).

Gaps: `worker` records fall through with no branch yet still report `created` (`:332-338`);
`operation` is never branched on, so `delete` upserts; every replay appends another `sync_events`
row with no unique constraint (`database.py:78-85`).

## Stage 5 — client ack

```ts
for (const item of pendingItems) {
  await syncQueueRepository.markSuccess(item.id);      // DELETE the queue row
  // then per-entity updateSyncStatus('synced')
}
```

`markSuccess` **deletes** rather than flags (`syncQueueRepo.ts:43-46`), the delete happens
**before** the status update, and there is no transaction. Three consequences
([[entities/sync-engine]]):

1. A crash between the two leaves the entity at `'pending'` **forever** — its queue row is gone.
2. `response.json()` at `:84` is parsed and **discarded**, so records the server reported as
   failed or ignored are still deleted and marked synced. The client cannot tell success from
   silent data loss.
3. `client_record_id` is `item.entity_id`, not `item.id` (`:58`), so two queue rows for the same
   entity collide server-side and the second overwrites the first.

On any thrown error the queue is left fully intact (`:106-114`) — that part is correct and is what
makes the flow retry-safe in the common case.

## Stage 6 — supervisor view

`apps/dashboard/index.html` polls `/dashboard/summary`, `/dashboard/high-priority`,
`/dashboard/workers` every 10 s (`:249-250`) over same-origin `fetch` (`:162`).

`/dashboard/high-priority` left-joins followups to screenings on `followups.screening_id`
(`main.py:426`) — which has **no FK** (`database.py:65`) and may be `NULL` for the three seeded
non-clinical follow-ups.

The supervisor can see but not act: the triage button only fires `alert()` (`index.html:204`), so
no `PATCH /followups/{id}` ever occurs, and the active-worker count is static markup (`:148`).
Per-worker screening counts are wrong because of `LEFT JOIN screenings s ON 1=1`
(`main.py:444`) — every worker shows the same global total.

## Conflict resolution — documented, not implemented

`sync-protocol.md` specifies a conflict policy (client-authoritative vitals; latest-timestamp-wins
for follow-up status and demographics; `sync-protocol.md:165-175`). **None of it exists in code.**
`INSERT OR REPLACE` means last-write-wins uniformly, with no field-level authority — so a
supervisor PATCH to a follow-up status, or a replayed batch, silently overwrites a point-of-care
BP reading that the protocol says must take precedence.

## Where records can be lost

| # | Mechanism | Consequence |
| :--- | :--- | :--- |
| 1 | queue row deleted before status update, no transaction (`:88-91`) | entity orphaned at `pending` permanently |
| 2 | server response discarded (`:84`) | server-rejected records recorded as synced |
| 3 | insert-and-enqueue with no transaction | record persisted but never queued |
| 4 | `client_record_id = entity_id` (`:58`) | two queue rows collide; first silently overwritten |
| 5 | `seed_demo_data()` on every backend start (`database.py:102-248`) | records sharing a demo id are destroyed on restart |
| 6 | `INSERT OR REPLACE` with no conflict policy | point-of-care vitals overwritten by replay |
| 7 | unbounded `fetch`, no timeout (`:71-78`) | sync wedged until process restart |

Mechanisms 1–4 are all in the ~40 lines of `triggerSync`, and each is a small fix.

## Related

- [[entities/sync-engine]] · [[entities/local-sqlite-store]] · [[entities/supervisor-backend-service]]
- [[sources/backend-api]] · [[sources/supervisor-dashboard]] · [[concepts/offline-first-invariants]]
- [[concepts/silent-failure-pattern]] · [[flows/voice-screening-journey]]
- [[analyses/release-readiness-2026-10]]
