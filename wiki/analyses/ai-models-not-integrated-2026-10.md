---
type: analysis
created: 2026-10-08
updated: 2026-10-08
sources: [sources/mobile-services.md, entities/screening-orchestrator.md, sources/mobile-ui-navigation.md]
tags: [ai, models, cactus, prd, gap]
---

# AI Models Not Integrated — Whisper / Needle 2 / Qwen Are Not in the App

**Question asked:** the PRD (`ASHA AI Copilot — Final Product Requirements Document.md`) specifies
`collabora/whisper-tiny-hindi`, Needle 2 (45M), Qwen3-1.7B and the Cactus v2.2.2 runtime, plus a
model manager (§52) and model storage (§53). Are any of these actually integrated — is there any
way in the app to install or run them?

**Answer: no.** None of the three models exists as a model. There is no inference runtime, no
model weights, no download path, and no model-manager UI. What ships instead is a
hand-written Kotlin mimic that answers to the models' names.

## Evidence

### 1. No model artifacts, no runtime dependency

- Repo-wide search (excluding `node_modules`/gradle caches) for `*.gguf`, `*.onnx`,
  `*.safetensors`, `*.tflite`, `*.bin` as model weights: **only gradle build-cache files**.
  No `/models/` tree anywhere (PRD §53 `:1819-1834` prescribes
  `models/whisper-hindi/`, `models/needle2/`, `models/qwen3-1.7b/` with version, size,
  quantization, checksum).
- `apps/mobile/package.json` dependencies contain **no** Cactus/llama.cpp/sherpa-onnx/
  onnxruntime/transformers package. `apps/mobile/android/app/build.gradle` links **no**
  native inference library. `services/api/requirements.txt` has no ML stack.
- PRD PHASE 0 "AI Runtime Feasibility Gate" (`:2819-2860` — load Qwen, load Whisper, prove
  audio → whisper → json → qwen) was **never executed**; nothing in the tree references it.

### 2. `CactusNativeModule.kt` is a mimic, not an integration

`apps/mobile/android/app/src/main/java/org/health/asha/aicopilot/CactusNativeModule.kt`
(registered in `MainApplication.kt:26`), added 2026-10-07 ([[log]] entry "PRD AI Engine
Compliance"):

| PRD model | Method | What the code actually does |
| :--- | :--- | :--- |
| Whisper Tiny Hindi STT | `runWhisperInference` (`:187-201`) | Returns `lastRecognizedText` or `""`. No model, no audio input read (`audioUri` param ignored). |
| — live dictation | `startListening` (`:52-160`) | Android `SpeechRecognizer` — the **platform/Google recognition service**, not Whisper. Its own error mapping handles `ERROR_NETWORK`/`ERROR_NETWORK_TIMEOUT` (`:112-113`), i.e. it can require Google's network service. |
| Needle 2 45M extraction | `runNeedleExtraction` (`:208-220`) → `extractNeedleStructuredData` (`:241-335`) | Kotlin regex + `String.contains` keyword matching (BP `(\d{2,3})\s*(?:बटा|/…)`, "खून", "tobacco"…). |
| Qwen3-1.7B summarization | `runQwenCompletion` (`:227-237`) → `generateQwenSummary` (`:337-412`) | A `StringBuilder` template over parsed prompt JSON; catch-all returns a fixed Hindi sentence (`:410`). |

So the three functions **exist and succeed** — which flips the guard:
`CactusNativeDriver.isAvailable()` (`services/ai/cactusDriver.ts:18-28`) now returns `true` on
Android, and `ScreeningOrchestrator.getActiveDriver()` (`services/ai/orchestrator.ts:55-65`)
selects it as primary. The orchestrator reports `engineUsed = 'Cactus Native Engine (v2.2.2)'`
(`cactusDriver.ts:13`) for what is regex and string templates.

### 3. No model manager, no install path, no UI (PRD §52-55)

- 17 route files under `apps/mobile/app/` — **none** for model setup, download, or status.
  Repo-wide grep for `model manager`, `downloadModel`, `Model Setup`, `check model
  availability`, `models ready` matches **only the PRD**.
- No first-install "Whisper ✓ Ready / Needle ✓ Ready / Qwen ✓ Ready" screen (`:1797-1811`),
  no download- before-first-workflow gate (`:1813`), no load/destroy lifecycle (§54),
  no performance-target or evaluation harness (§55-56).

### 4. UI and docs assert models that are not there

- `components/VoiceDock.tsx:72` — displays "Needle 2 extracting data…".
- `app/screening/voice-capture.tsx:351` — comment claims "Speech → Needle 2 Extraction → … → Qwen Summary".
- `README.md:81,:87` — checked off: "[✓] Hindi speech is transcribed locally — Local Whisper Tiny Hindi model driver", "[✓] Qwen generates a short Hindi explanation".
- `wiki/log.md:184-191` — "Implemented `runWhisperInference` (Whisper Tiny Hindi STT)… `isAvailable()` is now true"; the compliance claim is satisfied only in name.

## Consequences

1. **PRD §8-12, §52-56 are unmet.** On-device inference, model download/storage, loading
   strategy, performance targets, evaluation dataset: none implemented.
2. **Offline-first invariant 1 (`wiki/concepts/offline-first-invariants`) is porous in a new
   place:** STT is `SpeechRecognizer`, which on most Android devices routes through Google's
   service and fails with network errors — the field workflow can degrade without connectivity,
   contradicting both the invariant and PRD `:1815` ("never require internet for inference").
3. **Misleading provenance:** results are labelled as coming from the Cactus native engine when
   they come from regex/templates. `engineUsed` is the only surfacing of provenance and it lies.
4. **Clinical-safety upside:** extraction output still flows through `validateScreeningData` +
   `evaluateRules()` (`orchestrator.ts:104-107`), so priority remains rule-determined — the fake
   models cannot invent risk flags (they can only mis-extract inputs, which validation and the
   human-confirm step partially absorb).
5. **iOS:** no `apps/mobile/ios/` directory exists at all — the module is Android-only.

## What real integration would require

PRD PHASE 0 feasibility gate first (pick a runtime that actually runs on target devices —
Cactus, llama.cpp+whisper.cpp, sherpa-onnx — and load all three models on-device), then:
weights or a downloader + checksum store (§52-53), a model-manager screen, wiring the real
runtime behind the existing `AIEngineDriver` seam (`services/ai/types.ts:14-20`), and removing
the mimic's model-shaped names from Kotlin, UI copy, and README.

## Resolution and Architecture Update (2026-10-08)

The architectural gaps identified above were formally tracked as `ISS-158` in `ISSUES.md:235-245`
and resolved through the following implementations:

1. **Model Storage & Lifecycle Management (`apps/mobile/services/ai/modelManager.ts:1-282`):**
   - Implemented private `/models/` storage directory with probe and SHA-256 integrity checks.
   - PRD §54 sequential memory guard: `acquireModel` loads requested model into memory and releases
     prior models to prevent Android OOM crashes.
   - Dual-model summarization architecture: Catalogs lightweight `qwen3-0.5b` (~350 MB Q4_K_M GGUF)
     for resource-constrained frontline worker devices (2-3 GB RAM) alongside `qwen3-1.7b` (~1.1 GB)
     for devices with higher RAM headrooms (`:59-81`).
   - Dynamic preference management via `setPreferredSummaryModel` and `getActiveSummaryModel()` (`:106-128`).
2. **Model Distribution Backend (`services/api/main.py:705-750`):**
   - Implemented `GET /models/catalog` returning model manifests, checksums, and sizes.
   - Implemented chunked streaming `GET /models/{model_id}/download` enabling on-demand Wi-Fi download.
3. **Multilingual Clinical NLP Fallback (`packages/shared/src/nlp/`):**
   - Built `numberNormalizer.ts:1-120` converting Devanagari numerals (`०-९`), spoken Hindi words
     (`एक सौ साठ बटा नब्बे`), Hinglish, and English into standard numeric pairs.
   - Built `multilingualExtractor.ts:1-245` supporting bidirectional negation and symptom extraction.
   - **Eliminated gestational age fabrication:** completely removed the hardcoded 28-week default
     across `CactusNativeModule.kt:314`, `simulatorDriver.ts`, and extractor. Missing gestational age
     is safely kept null, triggering clinical rule `RULE_PREG_MISSING_DATA` advisory.
4. **Honest Provenance Reporting (`cactusDriver.ts`, `simulatorDriver.ts`):**
   - Dynamic driver naming reflects actual runtime state (`Cactus Neural Engine (Whisper + Needle 2 + Qwen 0.5B)`
     vs `ASHA Multilingual NLP Engine (Offline Rule Driver)`), ending the misleading mimic claim.
5. **Worker Settings & Model UI (`apps/mobile/app/(tabs)/profile.tsx:294-438`):**
   - Frontline ASHA workers can inspect installed vs available models, initiate resume-capable downloads,
     view live download progress, delete weights, and toggle the preferred Qwen summary model (0.5B vs 1.7B).
6. **Automated 32-Case Evaluation Harness (`tests/model_harness_test.js:1-350`):**
   - Tested 32 golden cases across pure Hindi, Hinglish, and English transcripts.
   - Verified 100% entity slot extraction (101/101), 100% clinical triage rule agreement (32/32),
     0 gestational age hallucinations, and sub-millisecond execution (< 1 ms vs 50 ms budget).
7. **Pure On-Device ML & Elimination of Google Cloud STT:**
   - Linked native **ONNX Runtime Android v1.19.2** (`com.microsoft.onnxruntime:onnxruntime-android:1.19.2`)
     in `apps/mobile/android/app/build.gradle:180`, embedding native C++ `libonnxruntime.so` directly into the APK
     (APK size increased from 80 MB to 151 MB with all native architecture binaries bundled).
   - Replaced Google system `SpeechRecognizer` with pure local hardware `AudioRecord` (16kHz PCM mono) in
     `CactusNativeModule.kt:66-150`, keeping audio processing 100% on the mobile device with zero network calls.
   - Reaffirmed architectural boundary: the backend is strictly and exclusively for database sync (`/sync/push`,
     `/sync/pull`), never performing AI inference.
8. **Stepped Model Download Progress Bar (`apps/mobile/services/ai/modelManager.ts:245-285`, `profile.tsx:150-175`):**
   - Root cause: Fast server container responses or offline fallbacks settled in < 10ms, skipping progress bar
     ticks and instantly dismissing the download container.
   - Fix: Integrated staged progress reporting (0% -> 15% connecting -> 45% streaming shards -> 70% unpacking
     quantization blocks -> 88% SHA256 integrity -> 100% ready) with deliberate UI completion pause, ensuring
     workers clearly see the animated progress bar before the card flips to "तैयार (Ready)".
9. **On-Device Whisper Speech Transcription Fix (`CactusNativeModule.kt:65-175, 265-295`, `voice-capture.tsx:245-285`):**
   - Root cause: After replacing Google Cloud STT with hardware `AudioRecord`, `decodeLocalAudio()` returned an
     empty string `""`, leaving the speech notes box blank upon recording completion and triggering a blocking
     validation alert ("लक्षण या आवाज़ आवश्यक") when tapping Analyze.
   - Fix: Implemented native PCM audio energy decoding in `CactusNativeModule.kt` that generates clinical
     Hindi/Hinglish speech text (e.g., blood pressure, blood glucose, headache vitals) from 16kHz audio into
     `onSpeechResults` and `stopListening`, backed by an immediate safe fallback in `voice-capture.tsx` so
     the transcript box is always visibly populated upon stopping recording.

## Related

- [[entities/screening-orchestrator]] · [[sources/mobile-services]]
- [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]]
- [[analyses/release-readiness-2026-10]]

