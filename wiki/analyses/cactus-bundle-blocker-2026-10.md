---
type: analysis
created: 2026-10-09
updated: 2026-10-09
sources: [ASHA AI Copilot — Final Product Requirements Document.md]
tags: [ai, whisper, cactus, bundle, blocker]
---

# Cactus whisper is unrunnable from published zips — bundle preparation missing

## Proven chain (device + source + upstream)

- Device reached `cactus_init` (URI fix worked) and the engine refused:
  `Failed to create model - check config.txt exists at: <dir>`.
- Engine source (`model.cpp:5884-5894`): `create_model` returns null unless
  `<dir>/components/manifest.json` exists. No fallback.
- Published `weights/*-int8.zip` (191 entries, fully listed via range reads)
  contains flat `.weights`/`.bias` tensors + configs + tokenizer only.
  No `components/`, no manifest, no compiled graphs.
- Upstream docs: runnable = "CQ weights + serialized graph + manifest",
  assembled by bundle preparation (transpile; needs torch). The zips are
  weight caches for that step, not runnable bundles.
- Consequence: nothing on the phone (and no app-side code) can turn the
  downloaded zips into something `cactus_init` accepts. Same almost certainly
  holds for the Qwen zips. `needle3.cact` is unaffected (`needle_load` takes
  raw bytes, no manifest) — likely the only currently-runnable neural path.

## Options

- A. Run bundle preparation (torch ~2.5 GB, disclosed, one-time) then ship
  runnable bundles to phones.
- B. Get ready bundles/graphs from the Cactus team.
- C. Vosk Hindi interim for STT (complete runnable artifacts, no conversion).
- D. Platform STT only (en works; hi needs internet/pack).

## Related

- [[analyses/hindi-stt-expert-brief-2026-10]] · [[analyses/three-model-offline-assessment-2026-10]]
