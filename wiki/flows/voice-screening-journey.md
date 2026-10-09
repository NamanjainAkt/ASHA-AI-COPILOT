---
type: flow
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-ui-navigation.md, entities/screening-orchestrator.md, entities/clinical-rule-engine.md, entities/local-sqlite-store.md]
tags: [flow, clinical, voice, screening]
---

# Flow — Voice Screening, End to End

The core product journey: a worker speaks a consultation in Hindi, reviews what the device
understood, corrects it, and confirms. Everything here is local
([[concepts/offline-first-invariants]]).

```text
Home ──"Start Field Visit"──▶ Voice Capture ──analyze──▶ Summary ──confirm──▶ SQLite + queue
                                                                       └──high rule──▶ Follow-up
```

**Blocker:** steps 1 and 2 do not complete on the release APK — see
[[analyses/navigation-crash-2026-10-06]]. The flow below is as designed and as exercised in
development.

## 1. Entering voice capture

`router.push({ pathname: '/screening/voice-capture', params: { scenarioId: activeScenario.id } })`
— `(tabs)/index.tsx:100-103`, object form from inside the nested Tabs navigator. **This is one of
the two transitions that crash.**

The route reads four params (`voice-capture.tsx:29-34`): `scenarioId` selects a demo fixture
(`:68`), and `patientId`/`patientName`/`screeningType` pre-select a beneficiary
(`:41-45`). Entered from a patient hub instead, the shape is
`{ patientId, patientName, screeningType }` (`patients/[id].tsx:179-186`) with
`screeningType` derived as `sex === 'female' && age < 50 ? 'pregnancy' : 'ncd'`.

The screen loads all patients on mount (`voice-capture.tsx:76-104`) and auto-selects the first,
flipping type to `pregnancy` for a female under 45 (`:84-89`).

## 2. Capture & Live STT

`Audio.requestPermissionsAsync()` on mount (`:137-143`). `startRecording` (`:185-245`) →
`stopRecording` (`:247-295`).
- **Live dictation (2026-10-08, Cactus-first):** when Whisper weights are downloaded
  (Profile → AI Models), native `AudioRecord` emits ~1s PCM chunks (`onSpeechChunk`)
  and `AIOrchestrator` streams them through `Cactus.streamTranscribeStart/Process/Stop`
  (`language: hi`), so confirmed + pending words fill the notes box in real time —
  fully offline. Without weights, platform dictation remains the fallback with the
  same inline hints. Post-record file transcription uses `transcribeAudio` (base64 PCM).
  Extraction uses Needle 3 (`needle_complete` + schema tools, field states
  known/unknown/uncertain/not_applicable) with deterministic `extractMultilingualScreeningData`
  fallback; summaries use the selected Qwen (0.6B default) with deterministic template
  fallback. Sequential load → run → release per stage; one major model resident.
- **Web browsers:** Web Speech API (`:203-228`). **Expo Go:** Expo AV recording.
  - On Web browsers: routes to Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`) (`:203-228`) for streaming Hindi/English speech recognition.
  - On Expo Go / Simulator: safely records via Expo AV `Audio.Recording.createAsync` (`:230-244`).
- **Hardware Mic Contention Resolution:** Native STT and Expo AV recording no longer run simultaneously, eliminating Android exclusive-mic lock collisions (`ERROR_AUDIO`).
- **Unmount & Rapid Tap Guards:** unmount cleanup (`:146-167`) destroys native recognizers, cancels dangling recordings, and resets audio mode. `isStartingRef`/`isProcessingRef` guard rapid taps.
- **Safety Fallback:** If audio hardware was completely silent upon stopping, an immediate clinical fallback provides realistic vitals so the frontline worker is never blocked from proceeding.

## 3. Analyse

```ts
const result = await screeningOrchestrator.processVoiceScreening(
  finalAudioUri || 'live_voice_session.m4a',
  activeType,
  { id: selectedPatientId || 'p-001', name: patientName },
  activeText                              // ← supplied transcript bypasses transcription
);
screeningOrchestrator.setLastResult(result);
router.replace({ pathname: '/screening/summary', params: { patientId, patientName, screeningType } });
```

`voice-capture.tsx:275-296`. Because `activeText` is passed, `orchestrator.ts:71-72` short-circuits
the transcribe stage — so the demo exercises extraction, validation, rules and summary, but never
STT.

Pipeline internals: [[entities/screening-orchestrator]]. Stage order is
extract → validate → rule → summarise, with rules evaluated on the *sanitized* extraction
(`orchestrator.ts:94-97`).

In practice the input is `DEMO_SCENARIOS[activeScenarioIndex].transcript`
(`simulatorDriver.ts:16-49`) and the extraction is regex-based (`:76-163`):

| Pattern | Example |
| :--- | :--- |
| BP | `/(\d{2,3})\s*(बटा|\/|by|-|\s)\s*(\d{2,3})/i` (`:120`) — Hindi "बटा", `/`, `by`, `-`, bare space |
| Glucose | dual-order: `(?:शुगर\|sugar\|glucose)\s*(\d{2,3})` or `(\d{2,3})\s*(?:शुगर\|…)` (`:130-135`) |
| Gestation | `/(\d+)\s*(हफ्ते\|सप्ताह\|week)/i` (`:84`), default 28 |
| Symptoms | `खून`/`सिरदर्द`/`पेट में`/`बुखार`/`सूजन` (`:87-91`) |

Four known extraction imprecisions: `known_hypertension` is set true by **any** BP reading
(`:140`, `systolic != null`), so even the healthy scenario is "hypertensive"; `symptoms` emits
both strings whenever any token matches (`:154`); `blurred_vision` and `reduced_fetal_movement`
are hard-coded `false` and never inferred (`:101`, `:104`); the pregnancy summary asserts
abdominal pain unconditionally (`:175`).

## 4. Review — the human-in-the-loop gate

`screening/summary.tsx`. Reads the result from the orchestrator cache (`:38`), falling back to
parsing `resultJson` from route params (`:38-45`) — the legacy path, kept for compatibility.

**Editable vital fields** (`:69-113`) re-run `evaluateRules(currentStructuredData)` on **every
render** (`:116`), so correcting a systolic value updates the risk badges instantly. This is the
best interaction in the app: a worker who hears "165" but the app heard "105" can fix it and watch
the triage change.

Below the fields: `RiskCard` per triggered rule (`:308-310`), the Qwen Hindi summary, and a
mandatory `isHumanConfirmed` checkbox (`:119-127` gates the save).

`evaluateRules` output is persisted as `rule_results`, and read screens filter that stored JSON
rather than re-evaluating ([[entities/clinical-rule-engine]]).

## 5. Persist

`handleConfirmAndSave` (`summary.tsx:118-194`) — the only place a screening is written:

1. Gate on the confirmation checkbox (`:119-127`).
2. `screeningId = params.screeningId || \`screen-${Date.now()}\`` (`:131`).
3. `screeningRepository.create({...structured_data: currentStructuredData, rule_results: dynamicRules,
   summary: summaryText, confirmed: true, sync_status: 'pending'})` (`:135-145`).
4. **If any rule is `high`** (`:148`) → `followupRepository.create({... priority: 'high',
   due_date: today + 3 days})` (`:150-164`) **and** `syncQueueRepository.enqueue('followup', …)`
   (`:166-171`).
5. `syncQueueRepository.enqueue('screening', screeningId, 'create', {...})` (`:175-182`).
6. `router.replace('/(tabs)')` (`:188`).

Follow-ups are **not** created for `medium` rules, despite `docs/wiki/mobile-application.md:142`
saying a high *or medium* rule schedules one.

Two defects on this path:

- **`highRuleReasonHi` is used at `:159` but declared at `:196`** — a `const` function-expression
  below its use site. It works only because the use is inside an async callback that runs after
  render. Fragile, and it will throw a TDZ `ReferenceError` if that code is ever hoisted.
- `patientRepository.getById(params.patientId)` at `:57-63` has **no `.catch()`** — the only
  unhandled repo promise in the app.

## 6. The manual-entry alternative

`screening/manual-entry.tsx` — the zero-AI path for broken mics or extreme noise. Direct numeric
entry, immediate `evaluateRules` (`:75`), same confirmation gate (`:46-52`), same persistence
(`:79-101`). Asymmetric with summary: it creates a high-risk follow-up (`:111-120`) but **never
enqueues it** to the sync queue, so that follow-up only syncs if the worker later edits it from
the Follow-ups tab.

## Related

- [[entities/screening-orchestrator]] · [[entities/clinical-rule-engine]] · [[entities/local-sqlite-store]]
- [[sources/mobile-ui-navigation]] · [[concepts/deterministic-triage]] · [[concepts/explainability]]
- [[flows/sync-lifecycle]] · [[analyses/navigation-crash-2026-10-06]] · [[analyses/release-readiness-2026-10]]
