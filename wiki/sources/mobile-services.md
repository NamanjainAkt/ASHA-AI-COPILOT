---
type: source
created: 2026-10-07
updated: 2026-10-08
sources: [entities/screening-orchestrator.md, entities/clinical-rule-engine.md, entities/local-sqlite-store.md, entities/sync-engine.md]
tags: [mobile, services, ai, database, sync]
---

# Mobile Service Layer

12 files under `apps/mobile/services/`:

```text
services/
├── ai/       types.ts · orchestrator.ts · cactusDriver.ts · simulatorDriver.ts · modelManager.ts
├── db/       database.ts · patientRepo.ts · screeningRepo.ts · followupRepo.ts · syncQueueRepo.ts
├── rules/    engine.ts · explainability.ts
└── sync/     syncService.ts
```

The five `ai/` files are where the "on-device AI" story lives; `db/`, `rules/` and `sync/` are
the ordinary plumbing. Detail lives on the entity pages; this page is the map.

## AI layer

- `ai/types.ts` (28 lines) — `AIEngineDriver` (`:14-20`: `name`, `isAvailable`, `transcribe`,
  `extractScreeningData`, `generateSummary`), `SummaryPromptPayload` (`:3-12`),
  `ScreeningPipelineResult` (`:22-28`) which is **dead code** — zero consumers, and its
  `missingFields` is never populated. The orchestrator actually returns `ProcessedScreeningResult`
  (`orchestrator.ts:14-21`), a different shape.
- `ai/orchestrator.ts` (130) — the pipeline and driver selection. See
  [[entities/screening-orchestrator]].
- `ai/modelManager.ts` (320 lines) — on-device model manager implementing PRD §52-54. Manages
  private storage at `/models/`, checksum verification, staged Wi-Fi download and container provisioning
  with animated progress reporting (`0% -> 15% -> 45% -> 70% -> 88% -> 100%` `:245-285`), and sequential
  memory lifecycle (`acquireModel`, `releaseModel` `:173-200`). Catalogs `whisper-hindi` (75 MB), `needle2`
  (45 MB), `qwen3-0.5b` (350 MB, lightweight default for 2-3 GB RAM rural devices), and `qwen3-1.7b` (1.1 GB,
  for high-spec phones) (`:36-81`). Tracks active user preferences via `setPreferredSummaryModel` (`:106-128`).
- `ai/cactusDriver.ts` (112) — native bridge. Integrates dynamically with `modelManager`: reports
  `name = Cactus Neural Engine (Whisper + Needle 2 + Qwen 0.5B/1.7B)` when local weights are ready,
  or honest offline fallback name (`:13-35`). `isAvailable()` (`:36-47`) probes native module readiness.
  The underlying Android module (`CactusNativeModule.kt`) embeds **ONNX Runtime Android v1.19.2**
  (`com.microsoft.onnxruntime:onnxruntime-android`), uses pure local hardware `AudioRecord` (16kHz PCM)
  instead of Google SpeechRecognizer, decodes PCM audio streams into Hindi/Hinglish clinical speech
  transcripts (`:266-295`), and manages native `OrtSession` models completely on-device.
- `ai/simulatorDriver.ts` (190) — offline simulation and rule driver. Updated to use the shared
  multilingual NLP extractor (`@asha/shared/src/nlp/multilingualExtractor.ts`) instead of naive hardcoded
  symptom lists or gestational week defaults. Reports `name = 'ASHA Multilingual NLP Engine (Offline Rule Driver)'`.

Two notable improvements to previous simulator gaps:

- Extraction no longer fabricates a fixed symptom array or a 28-week gestational age: missing
  fields remain `null` and trigger protocol review advisories.
- Numeral parsing handles Devanagari numerals (`०-९`) and spoken Hindi numbers (`एक सौ साठ बटा नब्बे`)
  directly via `packages/shared/src/nlp/numberNormalizer.ts`.

## Rules layer

- `rules/engine.ts` (362) — `HealthRule` (`:9-15`), `ncdRules` (`:17-194`, 6 rules),
  `pregnancyRules` (`:196-336`, 6 rules), `evaluateRules()` (`:338-362`).
  See [[entities/clinical-rule-engine]].
- `rules/explainability.ts` (39) — `formatRuleExplanation` (`:16-35`) and
  `generateClinicalExplainabilityCards` (`:37-39`). A pure presentational projection of
  `RuleResult`; its `language` parameter (`:16`) is declared and never used. See
  [[concepts/explainability]].

## Database layer

- `db/database.ts` (374) — `asha_copilot.db` (`:4`), the `dbPromise` singleton (`:6-23`),
  6-table DDL (`:27-98`), one dead `ALTER` migration (`:102`), a legacy-name repair pass
  (`:107-117`), the seed gate (`:119-123`), and `seedDemoData` (`:126-374`).
  See [[entities/local-sqlite-store]].
- Repos, all thin SQL wrappers with no transactions:
  `patientRepo.ts` (7 methods, `:5-88`), `screeningRepo.ts` (`safeJsonParse` `:4-11`, 6 methods),
  `followupRepo.ts` (7 methods, join to patients for display names `:7-12`),
  `syncQueueRepo.ts` (6 methods). See [[entities/sync-engine]] for the queue repo.

Two consistency notes: `safeJsonParse` is **module-private to `screeningRepo.ts`** — the other
three repos have no JSON-safety helper, though only screenings carry JSON columns. And
`screeningRepo.getMetrics` computes `highRisk` with a **text `LIKE` over the JSON column**
(`screeningRepo.ts:133`): `rule_results LIKE '%"priority":"high"%'`, which depends on
`JSON.stringify`'s exact spacing and is not scoped by `triggered`.

## Sync layer

`sync/syncService.ts` (118) — the only network call in the entire service layer is
`fetch(`${this.backendUrl}/sync/push`)` at `:72`, with **no timeout/AbortController and no auth
header**. Default `backendUrl = 'http://127.0.0.1:8000'` (`:16`, plaintext HTTP loopback),
overridable via `setBackendUrl` (`:23-25`) from the sync screen's free-text field. `deviceId`
and `workerId` are hard-coded constants with no setters (`:17-18`). There is **no reconnect
trigger, no retry, no backoff, and no `NetInfo`/`AppState` listener** — sync is exclusively
user-initiated. See [[entities/sync-engine]] and [[flows/sync-lifecycle]].

The unbounded `fetch` is the layer's one genuine UI-blocking hazard: if the host accepts the TCP
connection then stalls, `triggerSync` never settles, `isSyncing` stays `true`, and the
re-entrancy guard at `:42-44` makes every later attempt fail until the process restarts.

## Cross-cutting: error handling idiom

- `console.warn` — 4 in `services/`, all in `orchestrator.ts` (`:52`, `:77`, `:88`, `:108`),
  all on the silent fallback path. `console.error` — 0. `TODO`/`FIXME`/`HACK` — 0 in
  `services/`.
- Because the simulator always succeeds, **a user never sees an error when the native engine
  fails**; the only signal is the result's `engineUsed` string and a console line.
- Unused imports: `Platform` in `database.ts:2` and `syncService.ts:1`.
- `withTransactionAsync` now wraps seeding, sync-ack, and the `summary`/`new`/`followups`
  write pairs (round-3 fix), with the tx handle threaded through `runner = tx || getDatabase()`.
  `manual-entry` and `patients/[id]` pairs remain unwrapped.

## Related

- [[entities/screening-orchestrator]] · [[entities/clinical-rule-engine]]
- [[entities/local-sqlite-store]] · [[entities/sync-engine]]
- [[concepts/deterministic-triage]] · [[concepts/silent-failure-pattern]] · [[concepts/explainability]]
- [[flows/voice-screening-journey]] · [[flows/sync-lifecycle]]
- [[sources/mobile-ui-navigation]] · [[sources/monorepo-overview]]
