---
type: entity
created: 2026-10-07
updated: 2026-10-08
sources: [sources/mobile-services.md, sources/shared-package.md]
tags: [ai, pipeline, orchestrator]
---

# `screeningOrchestrator` — the AI Pipeline

`services/ai/orchestrator.ts` (130 lines), exported as a module singleton at `:130`.
The one component that decides **which** AI engine runs and **in what order** stages execute.

## Public surface

| Symbol | Line |
| :--- | :--- |
| `ProcessedScreeningResult` | `:14-21` |
| `ScreeningOrchestrator` | `:23-128` |
| `.getLastResult()` | `:33-35` |
| `.setLastResult(r)` | `:37-39` |
| `.getSimulator()` | `:41-43` |
| `.getActiveDriver()` | `:45-55` |
| `.processVoiceScreening(audioUri, screeningType, patient, customTranscript?)` | `:61-127` |

```ts
export interface ProcessedScreeningResult {  // :14-21
  transcript: string;
  extracted: StructuredScreeningData;
  validationIssues: ValidationIssue[];
  ruleResults: RuleResult[];
  summary: string;
  engineUsed: string;
}
```

## Driver selection — the native driver runs, but contains no models

> **Updated 2026-10-08.** The original claim below ("no such native module exists") was true
> when written; `CactusNativeModule.kt` was added later on 2026-10-07 ([[log]] "PRD AI Engine
> Compliance"). It changes *which* driver runs, not *what* runs: see
> [[analyses/ai-models-not-integrated-2026-10]].

```ts
async getActiveDriver(): Promise<AIEngineDriver> {          // orchestrator.ts:55-65
  try {
    const isNativeAvailable = await withTimeout(this.nativeDriver.isAvailable(), 5000, 'native-probe');
    if (isNativeAvailable) return this.nativeDriver;
  } catch (e) { logger.warn(...); }
  return this.simulatorDriver;
}
```

`CactusNativeDriver.isAvailable()` (`cactusDriver.ts:18-28`) requires a native module exposing
`runWhisperInference`, `runNeedleExtraction` **and** `runQwenCompletion`. The Kotlin module that
now provides them (`apps/mobile/android/.../CactusNativeModule.kt`, registered in
`MainApplication.kt:26`) provides Android platform bridges.

With the resolution of `ISS-158`, `modelManager.ts` governs weights storage and availability.
`cactusDriver.ts:13-35` now dynamically queries `modelManager.getActiveSummaryModel()` and
`modelManager.isModelReady()`. If weights are present, it reports
`Cactus Neural Engine (Whisper + Needle 2 + Qwen 0.5B/1.7B)`. When weights are absent, it
transparently runs the bundled multilingual NLP engine and reports honest provenance. On iOS and
Expo Go, `simulatorDriver.ts` runs the `@asha/shared/src/nlp/multilingualExtractor.ts` NLP engine,
reporting `ASHA Multilingual NLP Engine (Offline Rule Driver)`.

`isAvailable()` returns `true` unconditionally for the simulator (`simulatorDriver.ts:63-65`),
so the pipeline can never fail to obtain a driver.

## Pipeline order

Declared intent (`orchestrator.ts:57-60`): *Voice → STT → Needle 2 → Validation → Rules → Qwen
Summary*. Actual execution:

| # | Stage | Lines | Driver? | Fallback |
| :--- | :--- | :--- | :--- | :--- |
| 0 | resolve driver | `:67` | — | → simulator (`:51-53`) |
| 1 | transcribe | `:70-81` | `:75` | **none on the live-audio path** — STT failure rethrows (2026-10-08), never substitutes a demo fixture |
| 2 | extract structured | `:84-91` | `:86` | `:87-91` → simulator, **and reassigns `driver`** |
| 3 | validate | `:94` | **no** — `validateScreeningData` | none |
| 4 | rules | `:97` | **no** — `evaluateRules` | none |
| 5 | summarise | `:100-114` | `:102-106` | `:107-113` → simulator, **does not reassign** |
| 6 | assemble + cache | `:116-126` | — | — |

Three ordering consequences:

1. **A supplied transcript bypasses stage 1 entirely.** `:71-72` —
   `if (customTranscript?.trim().length > 0) transcript = customTranscript.trim();` and
   `audioUri` is then never used. The demo path passes `activeText` as the 4th argument
   (`voice-capture.tsx:270`, `:282`), so **the demo never exercises transcription at all** — and
   since the simulator ignores `audioUri` anyway (`simulatorDriver.ts:67-74`), *no* path in the
   app ever transcribes captured audio.
2. **Stages 4 and 5 consume `validation.sanitizedData`, never the raw extraction** (`:97`,
   `:102-106`), and the returned `extracted` is also the sanitized object (`:118`). The model's
   raw output is discarded and unreachable by callers — which is the correct design for the
   safety invariant, and also means a caller can never see what the model actually said.
3. **`engineUsed` can lie.** The summary-stage fallback (`:109`) calls
   `this.simulatorDriver.generateSummary(...)` directly without reassigning the local `driver`,
   but `engineUsed: driver.name` is read at `:122` *after* that stage. So a run whose summary came
   from the simulator still reports the primary driver's name.

## Latency

The orchestrator has **no timing instrumentation at all** — no `Date.now()` deltas, no
`performance.now()`, no stage timings, no `AbortSignal`, **and no timeout on any driver call**.
A hanging native `isAvailable()` would block the pipeline indefinitely.

All simulated latency is in the simulator driver: 600 ms transcribe (`:69`), 350 ms extract
(`:78`), 400 ms summarise (`:167`) — a **1350 ms floor** per run whenever the simulator is the
active driver (iOS, Expo Go, or any stage-level fallback). On Android the native Kotlin driver
runs instead: its regex/template stages are ~instant, but stage 1 then waits on
`SpeechRecognizer` (device-dependent, network-capable) — and no path ever reads the recorded
`audioUri`, so capture-to-transcript is still unexercised. The caller guards re-entry with
`isProcessingRef` (`voice-capture.tsx:259`) and shows a spinner, so it degrades rather than
freezes. This is the "latency budget (<3.5 s)" the docset claims (`docs/wiki/README.md:43`) —
real, but never measured (the orchestrator still has no timing instrumentation).

## The one-slot result cache

`lastResult` (`:26`) is a single nullable field — not a keyed map, no eviction, no TTL. Written
on every successful run (`:125`), read by `summary.tsx:38`, also externally writable via
`setLastResult`.

It exists to avoid serialising the full AI result into router params
(`voice-capture.tsx:285-286` comments "Store in memory cache to avoid URI encoding bottlenecks"),
which is the documented fix for an earlier `URIError` crash
([[concepts/silent-failure-pattern]]).

Two consequences of it being a one-slot register in process memory:

- **Concurrent or interleaved screenings overwrite each other.** Run A → navigate away without
  saving → run B → visit summary for A → you get B's result. There is no key, so nothing
  prevents this.
- **A process kill between the two screens loses the extraction entirely.** `summary.tsx` then
  falls back to **hard-coded vitals** (`systolic '165'`, `diastolic '105'`, `glucose '142'`,
  `gestationalWeeks '28'`, `hasBleeding` default `true` for pregnancy,
  `isHumanConfirmed` default `true` — `summary.tsx:69-92`), plus hard-coded
  `known_hypertension: true`, `medication_adherence: false`, `severe_headache: true`,
  `swelling: true` (`summary.tsx:98-113`). A worker who lands there can save and sync a screening
  that was never measured — with the confirmation box already ticked.

That is the single most dangerous interaction in the app, and it is a direct consequence of a
memory-only cache.

## Related

- [[sources/mobile-services]] · [[sources/shared-package]]
- [[flows/voice-screening-journey]] · [[entities/clinical-rule-engine]]
- [[concepts/deterministic-triage]] · [[concepts/silent-failure-pattern]]
- [[analyses/release-readiness-2026-10]]
