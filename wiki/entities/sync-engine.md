---
type: entity
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-services.md, sources/backend-api.md]
tags: [sync, queue, idempotency, offline]
---

# Sync Engine — `syncQueueRepo` + `syncService`

Two files, ~190 lines total: `services/db/syncQueueRepo.ts` (71) and `services/sync/syncService.ts`
(118). The implementation of the Network Invariant ([[concepts/offline-first-invariants]]) — and
the source of the repo's most consequential correctness gaps.

## The queue repository

| Method | Line | SQL |
| :--- | :--- | :--- |
| `enqueue(entityType, entityId, operation, payload)` | `:5-33` | `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, attempts, last_error, created_at, updated_at) VALUES (?,?,?,?,?,0,NULL,?,?)` |
| `getPending()` | `:35-41` | `SELECT * FROM sync_queue ORDER BY created_at ASC` |
| `markSuccess(id)` | `:43-46` | **`DELETE FROM sync_queue WHERE id = ?`** |
| `markFailed(id, error)` | `:48-57` | `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?` |
| `getQueueCount()` | `:59-65` | `SELECT COUNT(*) as count FROM sync_queue` |
| `clearAll()` | `:67-70` | `DELETE FROM sync_queue` |

Four things to know:

1. **Ids are not UUIDs.** `:13` — `` `${entityType}-${entityId}-${Date.now()}` ``. Same entity
   enqueued twice in the same millisecond collides, and the entity type/id leaks into the key.
2. **`markSuccess` deletes the row** rather than flagging it. Successful items leave no audit
   trail; `lastSyncTime` is the only record.
3. **`getPending()` has no status filter** — it selects the whole queue. Equivalent only because
   `markSuccess` deletes.
4. **`markFailed` has zero callers.** Grepped the whole tree: only the definition at `:48`. So the
   `attempts` column is **always `0`** and `last_error` **always `NULL`** in practice — the retry
   bookkeeping the schema implies is not wired to anything. No backoff, no attempt cap, no jitter
   anywhere ([[concepts/silent-failure-pattern]]).

Only 6 `enqueue` call sites, all in the UI layer: `followups.tsx:47`, `patients/[id].tsx:72`,
`patients/new.tsx:73`, `manual-entry.tsx:94`, `summary.tsx:166`, `summary.tsx:175`. No
`worker` is ever enqueued, and no `workerRepo` exists despite the `workers` table and `'worker'`
being a legal `entity_type` in both unions (`syncQueueRepo.ts:6`, `types.ts:103`, `:115`).

## The service

State (`:16-21`) — three of five fields are hard-coded with **no setter**:

```ts
private backendUrl = 'http://127.0.0.1:8000';      // :16
private deviceId = 'device-android-asha-001';      // :17
private workerId = 'worker-001';                   // :18
private isSyncing = false;
private lastSyncTime: string | null = null;
private lastError: string | null = null;
```

Public surface: `setBackendUrl` (`:23-25`), `getBackendUrl` (`:27-29`), `getStatus` (`:31-39`),
`triggerSync` (`:41-115`).

### `triggerSync`, step by step

| Step | Lines | Behaviour |
| :--- | :--- | :--- |
| 0 re-entrancy guard | `:42-44` | `if (isSyncing) return {success:false, error:'Sync already in progress'}` — rejected, not queued |
| 1 latch | `:46-47` | `isSyncing = true; lastError = null;` |
| 2 fetch | `:50` | `getPending()` — **no LIMIT** |
| 3 empty short-circuit | `:51-55` | stamps `lastSyncTime` even though nothing was sent |
| 4 map | `:57-63` | `client_record_id: item.entity_id`; `JSON.parse(item.payload)` |
| 5 payload | `:65-69` | `{device_id, worker_id, records}` |
| 6 HTTP | `:71-78` | `POST ${backendUrl}/sync/push` |
| 7 status check | `:80-82` | `throw new Error(\`Server returned HTTP ${status}\`)` — body discarded |
| 8 parse | `:84` | `const data = await response.json();` — **never used** |
| 9 mark synced | `:86-97` | `markSuccess` then per-entity `updateSyncStatus` |
| 10 success | `:99-105` | `processedCount = pendingItems.length` — rows *attempted*, not confirmed |
| 11 failure | `:106-114` | queue left fully intact |

Four defects in that flow, in descending severity:

**1. The server's per-record verdicts are discarded (`:84`).** `SyncPushResponse` carries
`processed[]` with per-record `'created'|'updated'|'ignored'` and `failed[]` with error strings
(`types.ts:127-137`). Both are ignored. Consequences: a record the server reports as **failed** is
still deleted from the queue and marked `synced` locally; so is one reported `ignored`. The
client's notion of "synced" therefore means only "the HTTP request returned 2xx", not "the server
accepted this record".

**2. Delete-before-update ordering (`:86-97`).**

```ts
for (const item of pendingItems) {
  await syncQueueRepository.markSuccess(item.id);        // DELETE the queue row
  if (item.entity_type === 'patient')   await patientRepository.updateSyncStatus(...);
  else if (item.entity_type === 'screening') await screeningRepository.updateSyncStatus(...);
  else if (item.entity_type === 'followup')  await followupRepository.updateSyncStatus(...);
}
```

The queue row is deleted **before** the entity's status is updated, and there is **no
transaction**. A process death in between leaves the queue row gone and the entity stuck at
`sync_status = 'pending'` **forever** — nothing will ever re-queue it. Additionally the
`entity_type` chain has **no `worker` branch**, so a worker record would have its queue entry
deleted with no state change at all.

**3. `client_record_id` is `entity_id`, not `item.id` (`:58`).** The queue row's own unique id is
discarded. Two queue rows for the same entity (create then update) serialise to the **same**
`client_record_id`, so the server cannot distinguish them and per-record acks cannot be
correlated. Server-side `INSERT OR REPLACE` keyed on that id means the second silently overwrites
the first ([[sources/backend-api]]).

**4. Unguarded `JSON.parse(item.payload)` (`:62`).** The only unguarded parse of queue data in the
layer. One corrupt `payload` row throws inside the `try`, is caught at `:106`, and fails the
**entire** batch — and since `markFailed` is never called, nothing records which row was bad.

Also: `"batch"` means **all-or-nothing, not chunked**. A large backlog becomes one unbounded
`fetch` with no `AbortController` and no timeout (`:71-78`). If the host accepts the connection
then stalls, the `await` never settles, `isSyncing` stays `true`, and the step-0 guard makes every
later attempt fail permanently until restart. The only user control is a free-text URL field
(`(tabs)/sync.tsx:24`, `:45`) with no validation.

## Retry / reconnect: entirely absent

Grepped `services/` for `NetInfo|@react-native-community/netinfo|addEventListener|AppState|
setInterval`:

- **no** `@react-native-community/netinfo` dependency anywhere — there is no network monitor.
- **no** `AppState` listener — no sync-on-foreground.
- **no** auto-sync timer — sync is exclusively user-initiated via the Sync tab button
  (`(tabs)/sync.tsx:48`).
- **no** retry, backoff, or attempt cap.

This contradicts the documented design intent in `docs/wiki/sync-protocol.md` and
`README.md:94` ("Reconnection triggers sync — network monitor triggers batch push when online"),
which is checked off as done in the PRD checklist (`README.md:94`). The behaviour does not exist.
`expo-network` is a declared dependency (`apps/mobile/package.json:19`) and is imported by **no**
screen.

## What works

The all-or-nothing failure semantics are correct for an offline-first app: on any throw, the queue
is left fully intact (`:106-114`), nothing is lost, and the user can retry. And the server's
`INSERT OR REPLACE` on the client id does make replay genuinely idempotent — which the replay
test actually verifies ([[sources/tests-and-tooling]]).

## Related

- [[entities/local-sqlite-store]] · [[sources/backend-api]] · [[sources/mobile-services]]
- [[flows/sync-lifecycle]] · [[concepts/offline-first-invariants]] · [[concepts/silent-failure-pattern]]
- [[sources/supervisor-dashboard]] · [[analyses/release-readiness-2026-10]]
