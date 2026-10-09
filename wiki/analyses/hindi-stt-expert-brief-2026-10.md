---
type: analysis
created: 2026-10-08
updated: 2026-10-08
sources: [ASHA AI Copilot — Final Product Requirements Document.md]
tags: [ai, whisper, hindi, cactus, stt, diagnostics]
---

# Expert brief: Hindi STT returns zero text on-device (English works, same path)

## Symptom (observed on physical arm64 Android phone, fully offline)

- In-app mic → speak Hindi ~10 s → stop → transcript box stays **empty**.
- Same flow with English speech transcribes correctly.
- No errors anywhere: every streaming chunk returns `rc == 0` with
  `{"success":true,"confirmed":"","pending":""}`; stop-flush also returns empty.
- Affects **both** `Cactus-Compute/whisper-tiny` (58 MB int8) and
  `Cactus-Compute/whisper-base` (99 MB int8) identically.

## Stack

- Cactus engine **v2.2.2**, built from source for `arm64-v8a` (NDK 27, CMake),
  `libcactus_engine.so` bundled in a React Native / Expo dev-build APK.
- Official RN bridge (`CactusModule.kt`): `init → streamTranscribeStart →
  streamTranscribeProcess → streamTranscribeStop → destroy`.
- Weights downloaded on-device from HuggingFace CDN, extracted from zip,
  `Cactus.init(extractedDir)`. Zip layout: flat per-tensor files + `config.txt`
  (439 B) + `tokenizer.json` / `vocab.txt` / `merges.txt` / `special_tokens.json`
  + `vad/` subdir.
- Streaming input: ~1 s chunks of 16 kHz mono 16-bit PCM as base64
  (32000 bytes/chunk). Options JSON per session: `{"language":"hi"}` or
  `{"language":"en"}` — the **only** difference between the failing and working
  case. Audio path, chunking, bridge parsing, and UI are therefore innocent
  (verified symmetric in app code; JSON keys match `stream.cpp::write_result`).

## Proven by inspection (no guessing)

- Converted vocab **contains** `<|hi|>` = **50276** and `<|en|>` = 50259
  (`special_tokens.json` read from the published zip).
- Engine swaps the decoder language token from the `language` option
  (`transcribe.cpp:290-304`): encodes `"<|hi|>"`, requires exactly 1 token, then
  replaces the first 6-char lowercase `<|xx|>` token in
  `decoder_prompt_token_ids`.
- Streaming inherits the same options (`stream.cpp::whisper_transcribe` forwards
  `options_json` to `cactus_transcribe`), so streaming and file transcription
  share the language mechanism.
- Streaming cadence is sane (1 s warm step, 6 s cold start, 10 s max window).
- **`config.txt` in the published zip contains NO `decoder_prompt_token_ids` key.**
- Stop-flush (`whisper_flush`) decodes the full buffered audio with no
  agreement filter — yet still returns empty for Hindi.

## Ruled out

- App routing/parsing (hi/en symmetric; keys verified against engine source).
- Audio format (English succeeds on the identical chunk path).
- Model strength (base fails exactly like tiny).
- Missing `<|hi|>` in vocab (proven present, id 50276).

## Questions for the expert

1. With these converted weights, what is `decoder_prompt_token_ids` at runtime
   given `config.txt` lacks the key — is a whisper default prompt injected at
   model load, and what language slot does it carry?
2. Does `tokenizer->encode("<|hi|>")` yield the single token 50276 through the
   C++ BPE path used at runtime, or does special-token handling split it
   (silently skipping the swap and leaving English-default decoding)?
3. Why would stop-flush (no agreement filter, full audio) still yield zero
   segments for Hindi — wrong-language decode with high no-speech, or a
   Devanagari detokenize/segment-drop issue? Which counter distinguishes them
   (`decode_tokens` 0 vs >0 with empty text)?
4. Recommended forcing function for Hindi on these artifacts: `language` option,
   initial `prompt`, or converted weights whose default prompt is already
   `<|hi|>` (e.g. converting `collabora/whisper-tiny-hindi` with
   `cactus convert` — is that supported, and does its Hindi-default config
   survive conversion)?
5. How to get engine internals on Android release (token ids used,
   per-pass segments): `CACTUS_LOG` to logcat, a debug `.so`, or an options flag?
