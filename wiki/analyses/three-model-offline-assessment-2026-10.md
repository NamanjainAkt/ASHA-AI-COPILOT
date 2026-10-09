---
type: analysis
created: 2026-10-08
updated: 2026-10-08
sources: [ASHA AI Copilot — Final Product Requirements Document.md]
tags: [ai, models, cactus, architecture, offline]
---

# Three-model all-offline assessment — the PRD vision is real and buildable

**Question asked:** we want three models in the app, all offline (STT + extraction + summary).
Is that the right architecture?

**Verdict: yes — and the PRD's named stack exists.** Cactus (`cactus-compute/cactus`,
docs.cactuscompute.com, YC-backed) is a real source-available mobile inference engine with
Kotlin and React Native bindings; Needle 2 (`Cactus-Compute/needle2`, 45M params, 14 MB
binary, ~28 MB session RAM) is real with prebuilt `android-arm64/libneedle.a` + `needle.h`;
pre-converted weights live at `huggingface.co/Cactus-Compute` (`whisper-tiny`, `Qwen3-0.6B`,
`Qwen3-1.7B`, `silero-vad`). The RN binding exposes exactly our pipeline seams:
`Cactus.init` → `streamTranscribeStart/Process/Stop` (`confirmed` + `pending` per chunk) →
`Cactus.complete` → `destroy`. Build machine already has NDK (25–27) + CMake 3.22.1.

## Corrections to the PRD bill of materials

- `Qwen3-0.5B` does not exist (0.5B is Qwen2.5; Qwen3's small is **0.6B**). Lightweight slot
  should be `Cactus-Compute/Qwen3-0.6B`; full slot stays `Qwen3-1.7B`. Catalogs
  (`modelManager.ts:60-81`, `services/api/main.py:724-745`) must be updated.
- `collabora/whisper-tiny-hindi` exists (PyTorch, 10.1% WER Hindi FLEURS) but is **not** in
  Cactus-Compute's converted set (only base `whisper-tiny/base/small/medium`). Either confirm
  Cactus ingests custom whisper checkpoints or accept base tiny multilingual Hindi quality.
- Cactus transcription markets a **hybrid** (on-device + cloud handoff on low confidence).
  Field use must pin local-only mode (no network path) or offline invariant 1 is broken.
- Needle 2's Android surface is its own static engine (`libneedle.a` + `needle.h`, JNI wrapper
  required), not the Cactus completion API. Two native integrations, not one.

## Why three models (not one, not zero)

- STT: highest value — genuine speech understanding; no regex can replace it.
- Needle 2: medium value — grammar-constrained JSON (byte-level grammar from our schemas)
  beats regex on paraphrase; 14 MB / 28 MB is nearly free. Confidence head enables
  escalate-below-threshold → human review, matching our fail-closed rule.
- Qwen: lowest value, highest risk — summary prose only, must never touch risk/thresholds
  (PRD §11 prohibitions hold; `evaluateRules()` stays the sole triage authority).
- RAM: sequential load/release per stage (already in `modelManager.ts:179-205`) is mandatory;
  concurrent residency is impossible on 2–3 GB field phones. Qwen-1.7B is 4 GB+ devices only.

## Build order

1. Toolchain: install Cactus CLI, `cactus build --android` → `libcactus.so` + bridge files +
   `CactusPackage()` registration; JNI wrapper for `libneedle.a`.
2. Weights staging: `data/models/<id>/` on backend; `/models/catalog` + `/models/download`
   serve real bytes with resume + SHA-256; profile page downloads with staging progress.
3. Wire stages behind the existing `AIEngineDriver` seam; keep deterministic
   `validate → evaluateRules → human confirm` untouched.
4. On-device Hindi evaluation harness (WER on field-like audio) before claiming STT works.

## Related

- [[analyses/ai-models-not-integrated-2026-10]] · [[entities/screening-orchestrator]]
- [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]]
