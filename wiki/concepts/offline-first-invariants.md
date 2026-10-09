---
type: concept
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-services.md, entities/sync-engine.md, entities/local-sqlite-store.md]
tags: [architecture, invariants, offline-first]
---

# The Four Offline-First Invariants

The docset states four invariants as the architectural spine
(`docs/wiki/principal-architecture.md:10-15`). This page checks each against the code, because
two of them hold for different reasons than claimed and one is not enforced at all.

## 1. Field Invariant — the core workflow never blocks on HTTP

**Claim:** no clinical screening step may wait on a network request.

**Verdict: holds, by construction.** The entire service layer contains exactly one `fetch` —
`syncService.triggerSync()` at `services/sync/syncService.ts:72` — and it is reached only from an
explicit user tap on the Sync tab (`(tabs)/sync.tsx:48`). Voice capture, extraction, validation,
rule evaluation, summary, on-device ONNX model loading, and SQLite persistence contain no network call
([[sources/mobile-services]]). The backend server is strictly reserved for database sync (`/sync/push`,
`/sync/pull`), never performing clinical AI inference.

A worker in a cellular dead zone loses nothing: the full clinical path, including audio capture,
transcription, triage, and explanation, is 100% on-device.

## 2. Clinical Safety Invariant — no LLM decides priority

**Claim:** priority is computed exclusively by deterministic rules; AI is limited to
transcription, extraction, and explanation.

**Verdict: holds, structurally.** `evaluateRules()` (`services/rules/engine.ts:338-362`) is pure
TypeScript with no model involvement, and `RuleResult.priority` is a closed union
(`types.ts:2`) so a model cannot introduce a severity level. Rule input is the *sanitized*
extraction, not the raw model output (`orchestrator.ts:97`), so the raw model output is
unreachable by any downstream consumer. See [[concepts/deterministic-triage]] for the one porous
edge.

## 3. Privacy Invariant — raw audio is ephemeral and strictly on-device

**Claim:** audio is processed in temporary storage and purged once transcription and extraction
are verified; only structured vitals are synced.

**Verdict: holds on-device.**
- **Elimination of Google SpeechRecognizer:** Previous builds relied on Android's system `SpeechRecognizer`,
  which could route microphone audio to Google cloud services. This has been replaced with pure local
  hardware `AudioRecord` (16kHz 16-bit mono PCM) in `CactusNativeModule.kt:66-150`, keeping audio processing
  100% on the physical device with zero network calls.
- **Audio transmission invariant holds:** Sync payloads are built exclusively from `item.payload`
  (`syncService.ts:57-63`), which the UI populates with structured JSON objects (`summary.tsx:175-182`) —
  raw audio is **never** transmitted over the network or saved to sync queues.
a system that does not yet exist ([[entities/screening-orchestrator]]).

## 4. Network Invariant — strict idempotency under replay

**Claim:** client-generated UUIDs plus upsert semantics make replay safe.

**Verdict: server side genuinely holds; client side does not use the guarantee.**

**Holds:** `/sync/push` upserts on the client-supplied `client_record_id`
(`main.py:286-330`) with no server-side id generation, and `tests/sync_idempotency_test.py:46-56`
replays an identical payload and asserts the patient count is unchanged. That is a real,
executed proof.

**Does not hold client-side**, on three counts ([[entities/sync-engine]]):

1. The client sends `client_record_id: item.entity_id` (`syncService.ts:58`), **discarding the
   queue row's own unique id** — so two queue rows for the same entity collide, and the server's
   second `REPLACE` silently overwrites the first.
2. The client **ignores the server's per-record verdict** (`:84`) and marks everything synced on
   any 2xx, so a record the server reported as failed is recorded locally as successful.
3. Ids are not UUIDs but `${entityType}-${entityId}-${Date.now()}` (`syncQueueRepo.ts:13`), so
   same-millisecond double-enqueue collides at the queue level too.

So the server is idempotent and the client is not careful enough to take advantage of it — which
means replay is safe *only* in the trivial case of a fully-replayed unchanged batch, exactly the
case the test covers.

## Where the invariants are documented but absent

Two behaviours the docset and PRD present as complete, which do not exist in code:

| Claimed | Reality |
| :--- | :--- |
| "Reconnection triggers sync — network monitor triggers batch push when online" (`README.md:94`) | **No network monitor at all.** No `@react-native-community/netinfo`, no `AppState` listener, no auto-sync timer. `expo-network` is a declared dependency imported by nothing. Sync is manual only ([[entities/sync-engine]]) |
| "Sync queue works — dedicated `sync_queue` table queues records for delayed upload" (`README.md:92`) | The queue exists and works. But `markFailed` has zero callers, so `attempts`/`last_error` are permanently `0`/`NULL` and there is **no retry or backoff** |

`README.md:78-100` is a definition-of-done checklist where all 20 items are marked `[x]`. Several
are aspirational — see [[analyses/release-readiness-2026-10]].

## Related

- [[concepts/deterministic-triage]] · [[concepts/silent-failure-pattern]] · [[concepts/explainability]]
- [[entities/local-sqlite-store]] · [[entities/sync-engine]] · [[entities/supervisor-backend-service]]
- [[sources/mobile-services]] · [[sources/backend-api]]
- [[flows/sync-lifecycle]] · [[analyses/release-readiness-2026-10]]
