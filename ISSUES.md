# ASHA AI Copilot — Codebase Issues Register

**Date:** 2026-10-07 · **Scope:** full codebase (`apps/mobile`, `packages/shared`, `services/api`, `apps/dashboard`, `tests/`, `scripts/`, root docs) · **Status:** open register as found 2026-10-07. Round-1 verification audit filed at `wiki/analyses/fix-verification-2026-10.md` (bulk fixed, ~40 partial, 1 missing); **round-2 re-audit appended to the same page** — P0s closed, chain green 13/13 + 11/11 + 4/4, one new P1 (transaction-object bypass: repo methods open their own DB handle inside `withTransactionAsync`) plus P3 nits.

**Method.** Seven parallel specialist scans (security, pipeline logic, backend, database, mobile UI, tests/QA, archaeology/dead-code) swept the tree independently, each citing `path:line`. The maintainer then merged overlaps, downgraded or dropped claims that did not survive independent verification (see Appendix B), and ranked the rest. Every item below was read in code by at least one scanner; items the maintainer additionally verified are marked **[V]**.

**Severity rubric.** P0 = release-blocker: crash, data loss, auth bypass, or a chained exploit of protected health data. P1 = behavior that is wrong and reachable by a user. P2 = robustness, performance, or debt with real user or maintenance impact. P3 = hygiene, dead code, docs.

**Counts:** P0 ×11 · P1 ×27 · P2 ×34 · P3 ×16 = **88 issues**.

| Area | P0 | P1 | P2 | P3 |
| :--- | :---: | :---: | :---: | :---: |
| Authentication & session | 4 | 1 | 0 | 0 |
| Data protection & privacy | 1 | 5 | 2 | 0 |
| Clinical logic | 2 | 9 | 7 | 1 |
| Backend API & sync protocol | 1 | 5 | 8 | 0 |
| Local data & durability | 0 | 3 | 6 | 0 |
| Mobile UI, navigation & design | 1 | 4 | 4 | 4 |
| Tests, QA & release | 2 | 0 | 3 | 4 |
| Maintainability, dead code & drift | 0 | 0 | 4 | 7 |

Related background with full code citations: `wiki/` (notably `wiki/analyses/navigation-crash-2026-10-06.md`, `wiki/analyses/release-readiness-2026-10.md`, and `wiki/analyses/ai-models-not-integrated-2026-10.md`).

---

## P0 — Release blockers

### ISS-001 — Hardcoded PIN `1234` always authenticates [P0] `Mobile auth`
- **Location:** `apps/mobile/app/login.tsx:66`, hint text `:160`
- **Issue:** `if (pin === expectedPin || pin === '1234')` means `1234` logs in even after a worker sets a custom PIN, and the screen prints `Master PIN: 1234`.
- **Evidence:** `pin === expectedPin || pin === '1234'`; on-screen `मास्टर पिन: 1234` / `Master PIN: 1234`.
- **Fix:** compare only to the stored PIN (`if (savedPin && pin === savedPin)`), delete the hint, add attempt counter + lockout.

### ISS-002 — Login fails open on any SecureStore exception [P0] `Mobile auth`
- **Location:** `apps/mobile/app/login.tsx:72-73`
- **Issue:** the `catch` around PIN verification calls `router.replace('/(tabs)')`, so any storage error skips authentication entirely.
- **Evidence:** `catch (e) { router.replace('/(tabs)') }` with no error UI.
- **Fix:** on catch, `Alert` the error and stay on login; never navigate.

### ISS-003 — Splash gate fails open into the authenticated shell [P0] `Mobile auth`
- **Location:** `apps/mobile/app/splash.tsx:33-36`
- **Issue:** any DB/SecureStore throw routes straight to `/(tabs)`, bypassing onboarding and login.
- **Evidence:** `catch{ ... router.replace('/(tabs)') }` after the 1200 ms timer.
- **Fix:** route to `/login` on error and surface it; failing into a retry screen preserves both safety and the unsynced-records concern.

### ISS-004 — Backend `/auth/login` accepts any credentials [P0] `Backend auth`
- **Location:** `services/api/main.py:66-90` (comment at `:68`: "Hackathon role-based demo auth")
- **Issue:** `username`/`password` are accepted and discarded; any requested role gets a minted `mock-jwt-token-{uuid}`.
- **Fix:** verify a password hash (bcrypt), return 401 on failure, sign a real JWT with expiry — or delete the endpoint until it is real.

### ISS-005 — Zero authorization on any API route [P0] `Backend auth`
- **Location:** `services/api/main.py:93` (`list_patients`), `:112`, `:266` (`/sync/push`), and every other handler
- **Issue:** no route validates an `access_token`; all patient/screening/sync endpoints are anonymous. Combined with ISS-008, anyone on the network can read and overwrite PHI.
- **Fix:** add `Depends(verify_jwt)` to every route; 401 on missing/invalid bearer.

### ISS-008 — Unauthenticated ingestion plus a destructive reset endpoint [P0] `Backend`
- **Location:** `services/api/main.py:265-349` (`/sync/push`), `:451-455` (`/seed-demo`)
- **Issue:** `/sync/push` ingests arbitrary records with no auth, and `POST /seed-demo` re-runs `INSERT OR REPLACE` seeding — reachable by anyone, destroying supervisor edits to demo-id rows.
- **Fix:** require auth + role on both; delete `/seed-demo` or gate it behind an admin role and an env flag; never `REPLACE` on seed (use `INSERT OR IGNORE` gated on empty tables).

### ISS-012 — Supervisor dashboard: unauthenticated + stored XSS [P0] `Privacy`
- **Location:** `apps/dashboard/index.html:177-212` (table render `:188`), served unauthenticated by `services/api/main.py:49-54`
- **Issue:** the dashboard injects server data via `innerHTML` with inline `onclick`. Since sync ingestion is unauthenticated (ISS-005/008), an attacker can store `<script>` in a patient name/reason via `/sync/push` and execute it in the supervisor's browser — a complete stored-XSS chain using only shipped behavior.
- **Fix:** serve the dashboard behind auth; replace `innerHTML` with `textContent`/`createElement`; add a `Content-Security-Policy` header; escape on render as defense in depth.

### ISS-018 — Release APK crashes on first cross-route navigation [P0] `Mobile nav`
- **Location:** transitions `/(tabs)` → `/patients` (`apps/mobile/app/(tabs)/index.tsx:209`) and → `/screening/voice-capture` (`:100-103`); crash inside expo-router's forked `getPathDataFromState` (`node_modules/expo-router/build/fork/getPathFromState.js:76`, called from `global-state/router-store.js:176`)
- **Issue:** 4/4 observed cross-route pushes kill the app with `JavascriptException: TypeError: undefined is not a function` (Pixel_5, Android 13, PIDs 5850/6411/6554/6765). Home renders, 30 s idle survives, tab switches work — any stack push dies. Full evidence, competing hypotheses, and verification plan: `wiki/analyses/navigation-crash-2026-10-06.md`.
- **Fix (leading hypothesis):** `query-string@^9.5.1` vs expo-router 4's direct `queryString.stringify(...)`; the vendored guard in `scripts/patch-expo-router.js` must run on every install — since 2026-10-07 root `package.json:15` declares the `postinstall`, verify it actually executes in the EAS build (check build logs for `Patched … successfully`), then rebuild and re-run the on-device walkthrough. Fallbacks: pin `query-string` to the version expo-router 4 expects; add `app/index.tsx`/`initialRouteName`; reorder `patients/index` before `patients/[id]`; unify push argument styles.

### ISS-019 — The string `'undefined'` is persisted as a screening primary key [P0] `Data integrity`
- **Location:** `apps/mobile/app/(tabs)/index.tsx:283-289` → `apps/mobile/app/screening/summary.tsx:131`
- **Issue:** `params: { patientId, screeningId: isHighRisk ? 's-001' : undefined }` serializes through the router fork (`String(value)`, `getPathFromState-forks.js:43-44`), so `params.screeningId` arrives as the **string** `'undefined'`. `summary.tsx:131` does `params.screeningId || \`screen-${Date.now()}\`` — `'undefined'` is truthy — so a row with `id = 'undefined'` is inserted, colliding across saves and breaking lookups/joins.
- **Fix:** omit the key instead of passing `undefined`: `params: { patientId: patient.id, ...(isHighRisk ? { screeningId: 's-001' } : {}) }`; additionally guard at save: `if (!screeningId || screeningId === 'undefined') screeningId = \`screen-${Date.now()}\``.

### ISS-020 — Missing patient silently saved under fake PK `p-001` [P0] `Data integrity`
- **Location:** `apps/mobile/app/screening/summary.tsx:132`; same pattern `manual-entry.tsx:77`, `voice-capture.tsx:279`
- **Issue:** `params.patientId || patientRecord?.id || 'p-001'` means a save with no resolved patient is attributed to Sunita Devi's demo record — silently misattributing clinical data, including high-risk flags and follow-ups.
- **Fix:** block save when no patient resolves: `if (!params.patientId && !patientRecord?.id) { Alert.alert(t.error, t.selectBeneficiaryPrompt); return; }`.

### ISS-021 — No release route-smoke test exists [P0] `QA process`
- **Location:** `tests/` (2 files), `apps/mobile/package.json:5-10` (scripts are `start|android|ios|web` only)
- **Issue:** 16 routes under `apps/mobile/app/` are exercised by zero automated tests. A smoke test that launches the release build and pushes every route would have caught ISS-018 before sign-off.
- **Fix:** add `smoke.release.spec.ts` that boots the release APK, pushes every route in `app/`, and asserts no crash; gate releases on it.

### ISS-022 — `npm test` runs neither suite [P0] `QA process`
- **Location:** root `package.json:13` (`npm run test --workspaces --if-present`); no workspace defines a `test` script
- **Issue:** `npm test` exits 0 having run nothing (`--if-present` with zero providers). CI that trusts it is testing nothing.
- **Fix:** add `"test": "node ../../tests/clinical_rules_test.js"` (shared) and a Python-side runner, or a root script invoking both suites; assert the CI log contains both suites' output.

---

## P1 — Wrong behavior, reachable by users

### ISS-101 — Human-in-the-loop checkbox is pre-ticked [P1] `Clinical`
- **Location:** `apps/mobile/app/screening/summary.tsx:92`
- **Issue:** `useState<boolean>(true)` means Confirm & Save works with zero review — the consent gate for persisting and syncing clinical records is opt-out.
- **Fix:** `useState<boolean>(false)`; keep the save button disabled until checked.

### ISS-102 — Summary manufactures a critical case from hardcoded defaults [P1] `Clinical`
- **Location:** `apps/mobile/app/screening/summary.tsx:69-83` (vitals `165/105/142`, gestation `28`, `hasBleeding ?? (screeningType==='pregnancy')`), `:98-113` (`known_hypertension: true`, `medication_adherence: false`, `severe_headache: true`, `swelling: true`)
- **Issue:** on an orchestrator cache miss the screen falls back to hypertensive fixtures — and because `:98-113` hardcodes flags, the non-adherence, pre-eclampsia and edema rules all fire. Combined with ISS-101, a worker can save and sync a critical screening that was never measured.
- **Fix:** default vitals to `''`, `hasBleeding` to `false`, derive flags from `initialResult.extracted` or editable toggles defaulting to `null`; block save until values are entered and confirmed.

### ISS-104 — `field_status: 'uncertain'` values still drive triage [P1] `Clinical`
- **Location:** `packages/shared/src/validation.ts:63,79,111` + `apps/mobile/services/rules/engine.ts` (zero `field_status` references) **[V]**
- **Issue:** out-of-range readings are annotated `uncertain` but left on the data object, and the engine compares them to thresholds like real readings — `bp_systolic: 9999` is flagged uncertain **and** fires `RULE_NCD_BP_CRITICAL`. The safety net is computed, persisted, displayed nowhere, and consulted never.
- **Fix:** null out `uncertain` fields before `evaluateRules()` (or make the engine skip them), and surface the uncertainty on the review screen.

### ISS-105 — Pipeline ignores `isValid` and summarizes invalid data [P1] `Clinical`
- **Location:** `apps/mobile/services/ai/orchestrator.ts:94-97`
- **Issue:** `validateScreeningData()` runs, but its `isValid` is never checked — rules and the Hindi summary are generated from data the validator just rejected.
- **Fix:** if `!validation.isValid`, surface `issues` in the UI and either skip summary generation or mark the summary provisional.

### ISS-107 — Dashboard risk colour comes from list position [P1] `Clinical display`
- **Location:** `apps/mobile/app/(tabs)/index.tsx:275-277`
- **Issue:** `const isHighRisk = index === 0; const isMedium = index === 1;` — the first `PatientCard` always renders red regardless of the patient's actual rules.
- **Fix:** derive `riskStatus` from each patient's stored `rule_results` max priority (as `patients/index.tsx:53-58` already does).

### ISS-108 — BP fallback grabs any 3-digit number as systolic [P1] `Clinical`
- **Location:** `apps/mobile/services/ai/simulatorDriver.ts:125-126`
- **Issue:** when no two-part BP matches, `transcript.match(/(\d{3})/)` takes any 3-digit number (e.g. glucose `245`) as systolic — which then trips the ≥180 critical rule.
- **Fix:** delete the fallback; leave systolic `null` and let `RULE_NCD_MISSING_DATA` fire.

### ISS-110 — Edema rule omits its own BP qualifier [P1] `Clinical`
- **Location:** `apps/mobile/services/rules/engine.ts:297-299` vs `packages/shared/src/protocols/pregnancy-demo.json:40`
- **Issue:** fires on `swelling` alone while the protocol requires "combined with elevated blood pressure" — and the pregnancy payload carries no BP field at all. Workers are told BP was elevated when none was measured.
- **Fix:** require BP ≥140/90 from linked NCD data, else downgrade priority and note the missing BP.

### ISS-111 — Fetal-movement rule omits its gestational gate [P1] `Clinical`
- **Location:** `apps/mobile/services/rules/engine.ts:274-276` vs `pregnancy-demo.json:35` ("after 24 weeks")
- **Issue:** fires at any gestational age; a 10-week report triages identically to a 38-week one.
- **Fix:** `if (!preg.reduced_fetal_movement || (preg.gestational_age_weeks ?? 0) < 24) return null;` plus a missing-data flag when age is unknown.

### ISS-112 — Manual-entry high-risk follow-ups never sync [P1] `Sync`
- **Location:** `apps/mobile/app/screening/manual-entry.tsx:103-121` (no `enqueue`); contrast `summary.tsx:166-171`
- **Issue:** the zero-AI path creates the high-risk follow-up locally but never queues it — the supervisor never sees the emergency referral.
- **Fix:** add the same `syncQueueRepository.enqueue('followup', followupId, 'create', {...})` call; add a test.

### ISS-114 — Connectivity indicator is hardcoded online [P1] `Mobile`
- **Location:** `apps/mobile/app/(tabs)/index.tsx:119` (`isOnline={true}`); `expo-network` declared (`apps/mobile/package.json:19`) and imported nowhere
- **Issue:** the header cannot show offline in an offline-first app — a worker may expect an instant sync that cannot happen.
- **Fix:** `const s = await Network.getNetworkStateAsync()` and pass `s.isConnected && s.isInternetReachable`.

### ISS-115 — Village screen fabricates coverage statistics [P1] `Mobile`
- **Location:** `apps/mobile/app/village/index.tsx:66` (`Math.ceil(totalPatients * 0.7)`), `:89` (hardcoded `Block: Sadar · District: Varanasi`), `:127`/`:137` (`ncd * 25`, `pregnancy * 35` floors)
- **Issue:** households, block/district, and coverage bars are invented, presented with dashboard authority.
- **Fix:** render only real `breakdown` counts or label the screen demo; remove the hardcoded block string and fake bars.

### ISS-118 — Patient names travel in URL params [P1] `Privacy`
- **Location:** `apps/mobile/app/screening/voice-capture.tsx:289-296`, `patients/[id].tsx:179-186,200-206,286-293`
- **Issue:** `patientId`/`patientName` ride in router params — logged, deep-linkable, and visible to any process reading the navigation state.
- **Fix:** pass only ids (`patientId`/`screeningId`) and load names from SQLite; add a param allowlist.

### ISS-120 — Unencrypted on-device PHI store [P1] `Privacy`
- **Location:** `apps/mobile/services/db/database.ts:12` (`SQLite.openDatabaseAsync('asha_copilot.db')`)
- **Issue:** full patient/screening/transcript store is plaintext SQLite — device theft, shared clinic devices, or backup extraction exposes everything.
- **Fix:** migrate to an encrypted store (SQLCipher / expo-sqlite encryption) with `PRAGMA key`, and document key management.

### ISS-121 — Logout leaves PIN and profile behind [P1] `Mobile auth`
- **Location:** `apps/mobile/app/(tabs)/profile.tsx:85`
- **Issue:** only `session_active` is deleted; `worker_auth_pin` and `worker_profile` persist, and the in-memory `screeningOrchestrator` result is not cleared. Combined with ISS-001, "signing out" is theater on a shared device.
- **Fix:** also clear the PIN (or force PIN re-entry), clear `setLastResult(null)`, document the intended logout semantics.

### ISS-123 — `/sync/push` flattens entity, operation, and status distinctions [P1] `Backend`
- **Location:** `services/api/main.py:280-338`; `SyncRecordItem` allows `worker` (`models.py:67`); response Literal includes `updated`/`ignored` (`models.py:79`)
- **Issue:** three distinct defects in one handler: (a) `worker` records fall through with no branch yet still report `status="created"` while writing nothing; (b) `operation` is never branched, so a `delete` performs an upsert and re-creates the row; (c) success always reports `"created"` — `updated`/`ignored` are unreachable.
- **Fix:** add `else: failed.append(...status="error"...); continue` before the event insert; branch `delete` to `DELETE FROM <table> WHERE id=?`; check existence first and report `created`/`updated`/`ignored` honestly.

### ISS-127 — `/dashboard/workers` cross-joins every worker to every screening [P1] `Backend`
- **Location:** `services/api/main.py:444` (`LEFT JOIN screenings s ON 1=1`)
- **Issue:** `COUNT(DISTINCT s.id)` is the global screening total repeated on every worker row, growing with each screening. The supervisor sees the same inflated number attributed to every ASHA worker. `last_sync_time` is NULL for workers with no device row.
- **Fix:** join via a real relation (requires adding `worker_id` to screenings) or run a separate per-worker query; drop the column until attribution exists.

### ISS-130 — `/sync/pull` omits workers, devices, and tombstones [P1] `Backend`
- **Location:** `services/api/main.py:351-380`
- **Issue:** returns only patients/screenings/followups. No workers, no devices, no delete markers — so a server-side delete can never propagate and clients resurrect deleted rows on next push.
- **Fix:** include `workers`, `devices`, and `tombstones` (`SELECT client_record_id, entity, timestamp FROM sync_events WHERE operation='delete' …`) so clients can evict.

### ISS-132 — `getMetrics` is wrong-shaped, fragile, and chatty [P1] `Data`
- **Location:** `apps/mobile/services/db/screeningRepo.ts:123-152`
- **Issue:** five sequential `COUNT(*)` queries on every dashboard/profile/village focus; `highRisk` is `rule_results LIKE '%"priority":"high"%'` (`:133`) — breaks on any JSON spacing change and counts `triggered:false`; `today` uses UTC `DATE('now')` (`:142`) while the UI reads IST, flipping the count at 05:30.
- **Fix:** single query with `SUM(CASE …)`, `json_extract`, `DATE('now','localtime')`.

### ISS-136 — One corrupt queue row fails the whole batch [P1] `Sync`
- **Location:** `apps/mobile/services/sync/syncService.ts:62`; `patientRepo.ts:5` has no `safeJsonParse` (only `screeningRepo.ts:4` does) **[V]**
- **Issue:** `JSON.parse(item.payload)` is unguarded — one corrupt payload throws inside the `try`, fails the entire sync, and (since `markFailed` is never called) nothing records which row was bad. Retries fail identically until manual DB surgery.
- **Fix:** per-record try/catch routing bad rows to `markFailed`; share `safeJsonParse` into patient reads.

### ISS-138 — Clinical suite never runs the rule engine [P1] `Tests`
- **Location:** `tests/clinical_rules_test.js:13-27`
- **Issue:** Test 1 feeds 165/105 but only asserts `isValid === true` — zero references to `evaluateRules`/`ncdRules`. The engine that decides triage is untested.
- **Fix:** import the engine and assert `evaluateRules(165/105)` yields the expected priorities; fail CI if the engine is not invoked.

### ISS-139 — Sync test covers one clean patient path [P1] `Tests`
- **Location:** `tests/sync_idempotency_test.py:15-55`
- **Issue:** a single `patient/create` replay. No screening/followup/worker, no update/delete — despite `models.py:67-68` allowing them — so ISS-123's defects are invisible to the suite.
- **Fix:** parametrize push over every entity × operation; assert DB row counts and `processed[].status`.

### ISS-146 — `patients/[id]` swallows the `high-risk` route [P1] `Mobile nav`
- **Location:** `apps/mobile/app/patients/[id].tsx:33-36` (`if (!id || id === 'high-risk')`); `patients/[id]` registered before its static siblings (`app/_layout.tsx:32` vs `:52-65`)
- **Issue:** with `patients/:id` preceding `patients/index|new|high-risk` in the linking config, `/patients/high-risk` can resolve into the dynamic route. The in-component guard proves this already happened once; what it renders in that case (early return with `loading=false`) is an empty detail screen, not a redirect.
- **Fix:** add `app/patients/_layout.tsx` with explicit `Stack.Screen name="high-risk"` before `[id]`; then remove the guard and verify it is dead.

### ISS-150 — Backend restart destroys demo-id records and supervisor edits [P1] `Data`
- **Location:** `services/api/database.py:102-248` (`INSERT OR REPLACE`, unconditional); invoked at import (`main.py:41-42`) and lifespan (`:19-23`)
- **Issue:** every process start rewrites `p-001…s-001/f-001/f-002`. Any supervisor edit to those rows, and any real record that ever shares a demo id, is wiped on restart.
- **Fix:** seed only when tables are empty, with `INSERT OR IGNORE`, gated behind `ASHA_SEED_DEMO=1`; never `REPLACE` on boot.

### ISS-153 — Empty queue stamps a fake "last sync" [P1] `Sync`
- **Location:** `apps/mobile/services/sync/syncService.ts:51-55`; fallback text `(tabs)/sync.tsx:111` (`'Last sync: Today 09:30 AM'`)
- **Issue:** zero-work sync sets `lastSyncTime = now` and returns success, and the screen shows a hardcoded `09:30` when null — the worker sees recency that never happened.
- **Fix:** don't touch `lastSyncTime` on zero work; return `processedCount: 0, note: 'queue-empty'`; render "Never synced" when null.

### ISS-154 — The expo-router patch passes silently on miss [P1] `Build`
- **Location:** `scripts/patch-expo-router.js:11,19-23,50`
- **Issue:** `if (!fs.existsSync(file)) continue` plus replace-only-if-found, ending in unconditional `Expo Router patches verified`. A renamed upstream file or version bump restores the exact crash class of ISS-018 with a success message. (Still relevant now that `postinstall` exists — a target miss is silent either way.)
- **Fix:** `throw new Error('target missing: '+file)` on absent target; CI step asserting `stringifyFn` occurs in all three patched files.

### ISS-155 — `sync_events` grows unbounded on every replay [P1] `Backend`
- **Location:** `services/api/database.py:76-85` (no unique constraint); `main.py:332-336` (unconditional insert); test asserts patient counts but never event counts (`sync_idempotency_test.py:54-55`)
- **Issue:** every push — including identical replays — appends audit rows forever.
- **Fix:** `CREATE UNIQUE INDEX ux_sync ON sync_events(device_id, client_record_id, operation)` + `INSERT OR IGNORE`, plus retention (`DELETE … WHERE timestamp < now-90d`); assert event counts in the replay test.

### ISS-156 — Clinical suite tests `dist/`, so stale builds pass [P1] `Tests`
- **Location:** `tests/clinical_rules_test.js:5-7` (`require('../packages/shared/dist/validation')`); no build step anywhere in CI or root scripts
- **Issue:** the suite exercises compiled output, not source. An edit to `packages/shared/src` with no rebuild passes against the old bundle.
- **Fix:** prepend `npm run build --workspace=@asha/shared` to the test invocation; add a dist-freshness guard (`tsc` output newer than `src/`).

### ISS-157 — `client_record_id` collides and acks can't correlate [P1] `Sync`
- **Location:** `apps/mobile/services/db/syncQueueRepo.ts:13` (`` `${entityType}-${entityId}-${Date.now()}` ``); `apps/mobile/services/sync/syncService.ts:58` (`client_record_id: item.entity_id`)
- **Issue:** same-millisecond double-enqueue collides at the queue level, and the server-bound id discards the queue row's own unique id — two rows for one entity (create then update) serialize identically, so the server silently overwrites the first and per-record acks can't be correlated.
- **Fix:** `crypto.randomUUID()` for queue ids; send `item.id` as `client_record_id`; add `UNIQUE(entity_type, entity_id, operation)`.

### ISS-158 — AI models not integrated: Whisper/Needle/Qwen missing, Cactus is a mimic [P1] `Pipeline / AI` [RESOLVED]
- **Location:** `apps/mobile/android/app/src/main/java/org/health/asha/aicopilot/CactusNativeModule.kt:187-412`, `apps/mobile/services/ai/cactusDriver.ts`, `apps/mobile/services/ai/simulatorDriver.ts`, `apps/mobile/services/ai/modelManager.ts`, `packages/shared/src/nlp/multilingualExtractor.ts`, `tests/model_harness_test.js`
- **Issue:** PRD §8-12 and §52-56 specify local on-device ML (`collabora/whisper-tiny-hindi`, Needle 2 45M, Qwen3-1.7B) via Cactus runtime with model storage and manager. Previous implementation lacked model storage/downloads and used a Kotlin mimic that reported false provenance while hardcoding 28 weeks gestation.
- **Evidence:** `wiki/analyses/ai-models-not-integrated-2026-10.md`.
- **Fix:** 
  1. Built Model Manager (`modelManager.ts`) conforming to PRD §52-54 with private `/models/` storage, SHA-256 validation, sequential memory acquire/release lifecycle, and backend distribution endpoints (`GET /models/catalog`, `GET /models/{model_id}/download` in `services/api/main.py`).
  2. Implemented bundled offline Multilingual Clinical NLP Extractor & Normalizer (`packages/shared/src/nlp/multilingualExtractor.ts` & `numberNormalizer.ts`) supporting Devanagari numerals (`०-९`), spoken Hindi numbers (`एक सौ साठ बटा नब्बे`), Hinglish, and English with bidirectional negation detection.
  3. Eliminated gestational age fabrication (removed hardcoded 28-week default in Kotlin & drivers).
  4. Enforced honest provenance: `engineUsed` dynamically reports `'Cactus Neural Engine'` when weights are active and `'ASHA Multilingual NLP Engine (Offline Rule Driver)'` during offline fallback.
  5. Built and passed the automated 32-case Multilingual Evaluation Test Harness (`tests/model_harness_test.js`) across Pure Hindi, Hinglish, and English with 100% entity extraction match, 100% clinical triage safety alignment, and 0.77 ms average latency (< 50ms budget).

---

## P2 — Robustness, performance, debt with user impact

### ISS-201 — Summary invents a symptom the transcript lacks [P2] `Clinical`
- **Location:** `apps/mobile/services/ai/simulatorDriver.ts:174-176`
- **Issue:** any bleeding summary asserts "रक्तस्राव एवं पेट दर्द" unconditionally, regardless of abdominal pain.
- **Fix:** interpolate `पेट दर्द` only when `pregnancy.severe_abdominal_pain` is true.

### ISS-202 — Healthy demo patient extracted as hypertensive [P2] `Clinical`
- **Location:** `apps/mobile/services/ai/simulatorDriver.ts:140` (`transcript.includes('बीपी की गोली') || systolic != null`)
- **Issue:** any BP reading sets `known_hypertension: true` — including the healthy 120/80 scenario.
- **Fix:** require a clinical signal: `includes('बीपी की गोली') || (systolic != null && systolic >= 140)`.

### ISS-203 — Two danger signs unreachable from voice input [P2] `Clinical`
- **Location:** `apps/mobile/services/ai/simulatorDriver.ts:100-104`
- **Issue:** `blurred_vision: false` and `reduced_fetal_movement: false` are hardcoded — two `high` rules can never fire from spoken input.
- **Fix:** extract from transcript keywords (धुंधला / हलचल कम) like bleeding/headache already are.

### ISS-204 — Suite gating is OR-not-XOR; pregnancy has no missing-data rule [P2] `Clinical`
- **Location:** `apps/mobile/services/rules/engine.ts:341-350`; N6 at `:166-193` is NCD-only
- **Issue:** mixed payloads run both suites, and unknown gestational age/status is never flagged by any rule.
- **Fix:** gate strictly on `screening_type`; add `RULE_PREG_MISSING_DATA`.

### ISS-205 — Threshold literals duplicated; fasting threshold unread [P2] `Clinical`
- **Location:** `apps/mobile/services/rules/engine.ts:60` (`>= 180 || >= 110`), `:93` (random only); `packages/shared/src/protocols/ncd-demo.json:38` (`fasting_threshold: 126`)
- **Issue:** the suppression guard duplicates JSON values as literals (JSON edits don't propagate), and a fasting glucose of 150 is judged against the random threshold of 200 — it passes when it shouldn't.
- **Fix:** read both thresholds from `ncdProtocol`; branch on a recorded sample-type field.

### ISS-206 — Pipeline stages have no timeouts [P2] `Robustness`
- **Location:** `apps/mobile/services/ai/orchestrator.ts:75-106` (bare `await driver.…`)
- **Issue:** a hanging native call blocks the pipeline indefinitely; `getActiveDriver()` awaits a `NativeModules` probe with no timeout either.
- **Fix:** wrap each stage in `Promise.race` with a timeout (e.g. 30 s STT, 15 s others) that triggers the existing simulator fallback. Latent today (native never runs); load-bearing the day it does.

### ISS-207 — `tel:` handling: injection vector, unawaited, inconsistent [P2→P1 part] `Mobile`
- **Location:** `apps/mobile/app/(tabs)/followups.tsx:68` (`` `tel:${phone}` `` from DB, unvalidated); `apps/mobile/app/patients/high-risk.tsx:67` (`tel:108`, unawaited, no `canOpenURL`); `apps/mobile/app/patients/[id].tsx:164-169` (phone as plain non-tappable text)
- **Issue:** a DB phone containing `;`/`#` separators can inject dialer commands; the emergency dial has no error path; the detail screen doesn't dial at all.
- **Fix:** validate `/^[0-9+ ]{6,15}$/` before dialing and reject separators; `if (await Linking.canOpenURL(url)) await Linking.openURL(url)`; make the detail phone a pressable `tel:` link with `accessibilityRole="link"`.
- **Severity note:** rated P2 overall (P1 for the injection vector alone on attacker-controlled sync data — see ISS-012's chain).

### ISS-208 — Unbounded batch, unpaginated reads [P2] `Backend`/`Mobile`
- **Location:** `services/api/models.py:72` (`records: List` no `max_length`); `services/api/main.py:359` (`SELECT *`, no LIMIT); `followupRepo.ts:26` (`getAllAsync<any>`, no LIMIT); `patientRepo.ts:5` (`getAll`, no LIMIT)
- **Issue:** a large backlog becomes one unbounded `fetch` body; pulls and list screens are full scans with no pagination.
- **Fix:** `Field(max_length=500)` + HTTP 413 over limit; `limit/offset` params with `LIMIT ? OFFSET ?`; index `updated_at`; mobile `FlatList` `onEndReached` + `maxToRenderInBatch={20}`.

### ISS-209 — Batch has no rollback; single commit after loop [P2] `Backend`
- **Location:** `services/api/main.py:280-342`
- **Issue:** one `execute` per record plus a single `commit`; a mid-batch exception after partial writes still commits successes, with per-item statuses then describing a half-applied batch.
- **Fix:** wrap in explicit transaction (`BEGIN` … `except: rollback`), group `executemany` per entity, return per-item statuses.

### ISS-210 — `POST /screenings` returns an ad-hoc 4-field dict [P2] `Backend`
- **Location:** `services/api/main.py:194-224` (no `response_model`); `ScreeningResponse` defined at `models.py:43` and never used
- **Issue:** response omits `structured_data`/`rule_results`/`confirmed`/`created_at` that the model promises — clients can't rely on the contract.
- **Fix:** `response_model=ScreeningResponse` and return the full object.

### ISS-211 — Connections without PRAGMAs or guaranteed close [P2] `Backend`
- **Location:** `services/api/database.py:9-12`; handlers e.g. `main.py:69,95,124`
- **Issue:** bare `sqlite3.connect` — no `foreign_keys=ON` (declared FKs inert), no WAL, no timeout, no `check_same_thread`; error paths raising before `conn.close()` rely on GC.
- **Fix:** `timeout=10, check_same_thread=False`, `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`, in a FastAPI dependency with `try/finally` close.

### ISS-212 — PATCH accepts `notes` and drops it [P2] `Backend`
- **Location:** `services/api/main.py:250-262`; `FollowUpUpdate.notes` (`models.py:57`)
- **Issue:** accepted field is never persisted — silent data loss on an explicitly modeled input.
- **Fix:** add `notes TEXT` via migration and `SET status=?, notes=COALESCE(?,notes), updated_at=?`.

### ISS-213 — No `POST /followups` [P2] `Backend`
- **Location:** `services/api/main.py:227` (GET + PATCH only)
- **Issue:** follow-ups are creatable only through `/sync/push`; neither the dashboard nor any direct client can create one.
- **Fix:** add `POST /followups` mirroring `create_patient`, returning `FollowUpResponse`.

### ISS-214 — `sync_status` is `'synced'` server-side, always [P2] `Backend`
- **Location:** `services/api/main.py:132,203,319`; `services/api/database.py:38,52,66` (column defaults)
- **Issue:** every write hardcodes `'synced'`, so `pending`/`failed` are unreachable on the server and the shared `SyncStatus` union is a fiction there. Design limitation rather than active breakage — recorded so nobody builds on those states.
- **Fix:** accept `sync_status` from payload with Pydantic Literal validation, or remove the union members server-side.

### ISS-215 — CORS wildcard with credentials [P2] `Backend`
- **Location:** `services/api/main.py:32-38`
- **Issue:** `allow_origins=["*"]` + `allow_credentials=True` is rejected by browsers and over-permissive. Secondary to ISS-005 (no auth makes CORS moot for curl), but it enables browser-based attacks from any origin.
- **Fix:** explicit supervisor origins from env; `allow_credentials=True` only with explicit origins; restrict methods/headers.

### ISS-216 — Dev entrypoint binds all interfaces with reload [P2] `Backend`
- **Location:** `services/api/main.py:457-459`
- **Issue:** `host="0.0.0.0"`, `reload=True` spawns watcher + worker and exposes PHI APIs to the LAN.
- **Fix:** `host` from env defaulting to `127.0.0.1`, `reload` behind `UVICORN_RELOAD=1`; production via gunicorn/uvicorn workers behind TLS.

### ISS-217 — Plaintext HTTP default sync URL [P2] `Transport`
- **Location:** `apps/mobile/services/sync/syncService.ts:16` (`http://127.0.0.1:8000`), `:71-78` (no auth header)
- **Issue:** default sync is unauthenticated HTTP. Same-device loopback today, but any remote URL typed into the free-text field sends PHI unencrypted with no warning and no way to attach a bearer token.
- **Fix:** default to `https://`, add an `Authorization` header slot, reject or loudly warn on `http://` in `setBackendUrl`.

### ISS-218 — Raw audio captured, never cleaned up [P2] `Privacy`
- **Location:** `apps/mobile/app/screening/voice-capture.tsx:161-240` (record to URI `:229`); no `FileSystem.deleteAsync` anywhere
- **Issue:** recordings accumulate on the device with no deletion step, against the stated ephemeral-audio invariant. Not transmitted (payloads are structured), so the exposure is device-local — theft, shared devices, backups.
- **Fix:** after `processVoiceScreening`, `await FileSystem.deleteAsync(uri, {idempotent:true}); setAudioUri('')`.

### ISS-219 — PIN stored reversible, compared directly [P2] `Auth`
- **Location:** `apps/mobile/app/onboarding/index.tsx:65` (`setItemAsync('worker_auth_pin', pin)`); `login.tsx:63`
- **Issue:** 4-digit PIN in cleartext, compared by equality. SecureStore is Keystore-backed so at-rest is reasonable; the threat is rooted-device/offline extraction plus trivial brute force of a 4-digit space.
- **Fix:** store `SHA-256(pin + salt)` via expo-crypto, compare hashes, rate-limit attempts. (Does not substitute for ISS-001 — fix that first.)

### ISS-220 — Stale screens after navigation [P2] `Mobile`
- **Location:** `apps/mobile/app/patients/index.tsx:33`, `patients/high-risk.tsx:27`, `village/index.tsx:28` (plain `useEffect`, not `useFocusEffect`)
- **Issue:** returning from `new`/detail/summary shows stale data; the directory also has an unused `patientRepository.search()` while filtering in JS (`patients/index.tsx:67-81`).
- **Fix:** `useFocusEffect(useCallback(() => { load…(); }, []))` as the tab screens already do; either use `search()` or delete it.

### ISS-221 — Onboarding ships pre-filled PII and skips required checks [P2] `Mobile`
- **Location:** `apps/mobile/app/onboarding/index.tsx:27-35` (name, ID, village, phone, PIN `1234` pre-filled); `:38-55` (only name/workerId/PIN checked); `:213` (village labelled required, never checked)
- **Issue:** a worker can complete onboarding without typing anything, and empty village/phone flow into a `NOT NULL` column or blank records.
- **Fix:** init fields to `''`; require non-empty village + 10-digit phone before advancing.

### ISS-222 — Role picker and "verified" badge are decorative [P2] `Mobile`
- **Location:** `apps/mobile/app/login.tsx:23` (`selectedRole`, never persisted/read), `:99-127` (picker), `:141-143` (static `t.verified` pill)
- **Issue:** no role gating exists anywhere, and the badge asserts verification the code never performs.
- **Fix:** persist the role into `worker_profile`/session and gate supervisor routes — or delete the picker and pill.

### ISS-223 — RiskCard drops half the rule name; workflow untranslated [P2] `Mobile UI`
- **Location:** `apps/mobile/components/RiskCard.tsx:22-27` (`split('(')`), `:68` (`{rule.nextWorkflow}`); `PatientCard.tsx:52` (`bgColor+'1A'` alpha hack), `:84` (nested pressables, English-only `accessibilityLabel`)
- **Issue:** bracket-splitting truncates bilingual rule names in Hindi display; the action line is English-only; nested `TouchableOpacity` with `onPressAction || onPress` is fragile.
- **Fix:** render `ruleName`/`reason_hi` by language without splitting; translate workflows; flatten to one pressable with a localized label.

### ISS-224 — i18n whole-object context rerenders everything [P2] `Mobile perf`
- **Location:** `apps/mobile/context/LanguageContext.tsx:42` (`const t = Translations[language]`); bypasses at `(tabs)/index.tsx:107-109`, `sync.tsx:104-111`, `Header.tsx:22`, `splash.tsx:56`
- **Issue:** every consumer rerenders on any language change — visible jank on the low-end devices this app targets — while several screens bypass `t` with inline ternaries anyway.
- **Fix:** memoize `t` with `useMemo`; move all literals into `translations.ts`; make splash/Header consume `useLanguage()`.

### ISS-225 — Lists are unbounded and untyped [P2] `Mobile perf`/`Data`
- **Location:** `followupRepo.ts:26` (`getAllAsync<any>`), `patientRepo.ts:5` (`getAll`), `patients/index.tsx:158`, `high-risk.tsx:114`, `followups.tsx:118` (FlatLists, no `onEndReached`)
- **Issue:** full-table scan + join on every focus, untyped rows, no pagination — fine at demo scale, a jank cliff at field scale.
- **Fix:** typed row interfaces, `LIMIT ? OFFSET ?`, `onEndReached` + `maxToRenderInBatch={20}` + `initialNumToRender={15}`.

### ISS-226 — Patient search is a leading-wildcard full scan [P2] `Data perf`
- **Location:** `apps/mobile/services/db/patientRepo.ts:22-32` (`WHERE name LIKE ? OR phone LIKE ? …`, `%query%` bound 4×)
- **Issue:** leading-`%` LIKE across 4 columns with no index or FTS — full scan per keystroke-scale query.
- **Fix:** FTS5 virtual table on name/phone/village, or prefix search plus index.

### ISS-227 — Zero indexes on either database [P2] `Data perf`
- **Location:** `apps/mobile/services/db/database.ts:27-98` (no `CREATE INDEX`); `services/api/database.py:18-85` (same)
- **Issue:** `ORDER BY created_at`, `patient_id`/status filters, and `updated_at > ?` pulls all scan.
- **Fix:** `CREATE INDEX idx_screenings_patient_created ON screenings(patient_id, created_at)`, `followups(status, priority, due_date)`, `sync_queue(created_at)`, `patients(village)`, backend `updated_at`.

### ISS-228 — Schema without CHECKs, lax nullability [P2] `Data`
- **Location:** `apps/mobile/services/db/database.ts:43` (`age INTEGER` nullable, no range), `:50` (`sync_status` no CHECK), `:61` (`confirmed INTEGER`), `:74` (`due_date TEXT` nullable)
- **Issue:** `sync_status`/`priority`/`status`/`sex` accept any string; TS unions are unchecked at the store; `confirmed` relies on `Boolean()` mapping (`screeningRepo.ts:71`); nullable `due_date` flows through unvalidated (`followupRepo.ts:53`).
- **Fix:** `CHECK (sync_status IN ('pending','synced','failed'))` et al; `CHECK (age BETWEEN 0 AND 130)`; strict 0/1 mapping; `due_date NOT NULL` or explicit overdue semantics.

### ISS-229 — JSON columns unchecked; seed prose diverges from engine [P2] `Data`
- **Location:** `apps/mobile/services/db/database.ts:58` (`structured_data`/`rule_results TEXT NOT NULL`); seeds `:217-238`, `:278-299`
- **Issue:** no `json_valid` CHECK on either DB, and seeded `rule_results` carry hand-written Hindi that diverges from engine output (different names, reasons, `protocolSource`) — screens display fixture text as triage output.
- **Fix:** `CHECK (json_valid(structured_data))`; generate seed screenings through `evaluateRules()`.

### ISS-230 — Seed gate, `'synced'` lie, expired demo dates [P2] `Data`
- **Location:** `apps/mobile/services/db/database.ts:119-123` (gate on `workers` empty only); `:189` (`'synced'` hardcoded in seed SQL); `:344,353,362` (absolute `due_date: '2026-10-12'` etc.)
- **Issue:** a crash after the first worker insert strands a permanently partial dataset the gate never repairs; demo rows claim `synced` without ever uploading; three of five follow-ups are permanently overdue past Oct 2026.
- **Fix:** per-table seed flag in `app_state`; seed `'pending'`; `due_date = today+N days`.

### ISS-231 — Dead migration, no versioning, fixture-coupled repair [P2] `Data`
- **Location:** `apps/mobile/services/db/database.ts:100-117`
- **Issue:** the `ALTER TABLE workers ADD COLUMN sub_center` always throws on fresh DBs (column already in DDL at `:36`) and is swallowed; there is no `user_version`/migration list; the legacy-name repair hardcodes fixture ids `p-001…p-005`.
- **Fix:** `PRAGMA user_version` with a `switch` migration list; delete the `LIKE '%(%'` repair block.

### ISS-232 — Mobile↔backend schema drift [P2] `Data`
- **Location:** mobile `database.ts:36` (`sub_center`) vs backend `database.py:19-26` (absent); `confirmed DEFAULT 1` (`database.py:49`) vs plain `NOT NULL` (mobile `:61`)
- **Issue:** two sources of truth for one domain; a synced worker loses `sub_center` server-side.
- **Fix:** single shared DDL source; `ALTER TABLE workers ADD COLUMN sub_center TEXT` on the backend.

### ISS-233 — Battery/memory: dashboard polls, repos refetch [P2] `Perf`
- **Location:** `apps/dashboard/index.html:249-250` (10 s poll of three endpoints); `screeningRepo.getMetrics` 5 queries per focus; `evaluateRules` on every summary render (`summary.tsx:116`)
- **Issue:** three sequential dashboard fetches every 10 s regardless of change; metrics recomputed from scratch on each tab focus; rules re-evaluated per keystroke-scale render.
- **Fix:** poll on `visibilitychange`/dirty-flag or ETag; memoize (`useMemo` on the six vital states); single `SUM(CASE…)` metrics query (see ISS-132).

### ISS-234 — Overbroad Android permissions [P2] `Mobile`
- **Location:** `apps/mobile/android/app/src/main/AndroidManifest.xml:5-17`; corroborated by `aapt dump badging` (`READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `ACCESS_WIFI_STATE`)
- **Issue:** storage and alert-window permissions exceed what the app uses (no file sharing, no overlays), widening data-access surface; `allowBackup="true"` (manifest, reported) would let backups exfiltrate the plaintext SQLite store (see ISS-120).
- **Fix:** remove storage + alert-window permissions; set `allowBackup="false"` (or a backup-rules file excluding the DB); keep the minimal set: `RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`.

### ISS-235 — `api:start` script and README document a broken command [P2] `Docs/DX`
- **Location:** root `package.json:14`, `README.md:54` (`python services/api/main.py`); fails at `services/api/main.py:7` (relative import, no `__init__.py`) **[V]**
- **Issue:** the documented first command for new developers fails with `ImportError`.
- **Fix:** change both to `python -m services.api.main` (repo root); smoke-test from a clean checkout.

### ISS-236 — Sync-protocol doc contradicts the code [P2] `Docs`
- **Location:** `docs/wiki/sync-protocol.md:138` (documents `GET /sync/pull?since=&limit=50` → `{server_timestamp, records[]}`) vs `services/api/main.py:351-380` (returns `{timestamp, patients, screenings, followups}`, `since`-only); `:165-175` (conflict policy) vs no implementation; "reconnect triggers sync" vs manual-only
- **Issue:** the distributed-systems doc describes an API and behaviors that do not exist.
- **Fix:** rewrite to the actual shape + `since`-only param; delete or implement the conflict policy; correct the trigger section to manual-pull-only (or implement `NetInfo` triggering).

### ISS-237 — Design source drifted from shipped UI [P2] `Design`
- **Location:** `stitch_asha_ai_copilot_ui/voice_recording_signature_mic/code.html:180` (5-tab bottom nav with center Record mic, `Online & Synced` header `:9`) vs `apps/mobile/app/(tabs)/_layout.tsx:30-82` (4 tabs, no record tab)
- **Issue:** the design source and the shipped app disagree on the primary navigation shape; building from stitch would produce a different app.
- **Fix:** decide record-tab vs separate `/screening` route; update the design source; remove the `Online & Synced` string from stitch copy.

---

## P3 — Hygiene, dead code, docs

### ISS-301 — `ScreeningPipelineResult` is dead [P3]
- **Location:** `apps/mobile/services/ai/types.ts:22-28`
- **Fix:** delete; the orchestrator returns `ProcessedScreeningResult` (`orchestrator.ts:14-21`). Its `missingFields` was never populated by anything.

### ISS-302 — `formatRuleExplanation`'s `language` param is dead [P3]
- **Location:** `apps/mobile/services/rules/explainability.ts:16`, caller `:37`
- **Fix:** remove the param (or branch on it); note the whole module is currently unimported by any screen.

### ISS-303 — Unused `Platform` imports [P3]
- **Location:** `apps/mobile/services/db/database.ts:2`, `apps/mobile/services/sync/syncService.ts:1` (`cactusDriver.ts:1` is the legitimate user)
- **Fix:** delete both lines.

### ISS-304 — `app_state` table is created and never used [P3]
- **Location:** `apps/mobile/services/db/database.ts:94-97`
- **Fix:** drop it, or wire it to something real (e.g. persist `lastSyncTime` instead of stamping fake recency — see ISS-153).

### ISS-305 — Dead UI bindings [P3]
- **Location:** `profile.tsx:23` (`setLanguage` destructured, never called — `toggleLanguage` is used at `:103`); `splash.tsx:120-124` (`subEnglish`); `constants/theme.ts:51` (`Typography`, zero imports); `(tabs)/_layout.tsx:33,47,61,74` (icon `size` param ignored for hardcoded `22`); `theme.ts:35,38` (`Colors.offline`, `shadowAmbient` unused)
- **Fix:** remove the dead bindings; either adopt `Typography` for headline/body sizes or delete it; use the `size` param.

### ISS-306 — Dead models and dependencies, backend [P3]
- **Location:** `services/api/models.py:3` (`datetime` unused), `:43`/`:61` (`ScreeningResponse`/`FollowUpResponse` imported at `main.py:10-11`, never used as `response_model`); `services/api/requirements.txt:4` (`python-multipart`, no `Form`/`File`/`UploadFile` in the tree)
- **Fix:** use the models on the POST routes or delete them; drop the dep or document the planned upload use.

### ISS-307 — `scripts/parse_dump.js` is orphaned [P3]
- **Location:** `scripts/parse_dump.js`
- **Issue:** references a nonexistent `dist/dump.xml`; zero importers.
- **Fix:** delete, or document what dump it parses and where that dump comes from.

### ISS-308 — Build artifacts and databases committed to the repo [P3]
- **Location:** `dist/ASHA-AI-Copilot-v1.0.0-release.apk` (76 MB), `services/api/asha_backend.db`, `services/api/__pycache__/`, no root `.gitignore` (only `apps/mobile/android/.gitignore`)
- **Issue:** a 76 MB binary of unknown provenance (plan still `IN PROGRESS` per `apk-build-plan.md:1`) plus a live database and bytecode in version control.
- **Fix:** root `.gitignore` with `dist/*.apk`, `*.keystore`, `services/api/*.db`, `__pycache__/`; `git rm --cached` the binaries; publish APKs via release attachments.

### ISS-309 — Seed/demo endpoint untested [P3]
- **Location:** `services/api/main.py:451-455`, `services/api/database.py:102-248`
- **Issue:** `/seed-demo` and the 5-patient/2-screening/2-followup fixture set are covered only incidentally via counts.
- **Fix:** test `POST /seed-demo` resets ids `p-001/s-001/f-001`; assert `/dashboard/summary` counts match the seed.

### ISS-310 — `versionCode` pinned with no bump discipline [P3]
- **Location:** `apps/mobile/android/app/build.gradle:94-95` (`versionCode 1`, `versionName "1.0.0"`); `apk-build-plan.md:13-18` has no bump step
- **Issue:** every rebuild ships versionCode 1 — Play/testing tracks and update checks can't distinguish builds.
- **Fix:** derive `versionCode` from the CI build number; document the bump rule in the plan's Task 6.

### ISS-311 — Dead ternary + always-present bleeding status [P3]
- **Location:** `apps/mobile/services/ai/simulatorDriver.ts:110` (`hasBleeding ? 'present' : 'present'`)
- **Issue:** `field_status.vaginal_bleeding` is always `'present'`. No clinical effect today (the engine never reads `field_status` — see ISS-104), but it corrupts the persisted provenance record.
- **Fix:** `hasBleeding ? 'present' : 'missing'`; add an extractor test for a non-bleeding transcript.

### ISS-312 — Test harness has no runner; cosmetic fixes [P3]
- **Location:** `tests/clinical_rules_test.js:83-84`, `tests/sync_idempotency_test.py:66-67` (hardcoded `PASSED (5/5)` / `(3/3)` banners); `sync_idempotency_test.py:1-3` (`sys.path.insert` hack)
- **Issue:** banners print on reach rather than from counted assertions; the suite relies on a path hack instead of an installable package. (The banners are accurate today — an `assert` throw prevents them — so this is harness quality, not false results.)
- **Fix:** convert to `node:test`/pytest with real counters and non-zero exit on failure; add `services/__init__.py` + `pip install -e .` (or `PYTHONPATH`) and delete the insert.

### ISS-313 — `console.warn` monoculture, zero tracking [P3]
- **Location:** 21 `console.warn` sites app-wide, 0 `console.error`, 0 `TODO`/`FIXME`/`HACK`
- **Issue:** no error taxonomy, no persistent error store, no markers of known-incomplete work — the next reader discovers gaps from docs instead of code.
- **Fix:** add `services/log.ts` (warn/error + persistent store), route sync/AI catches to it, and require `TODO(owner):` markers for known gaps.

### ISS-314 — Theme tokens half-adopted [P3]
- **Location:** `apps/mobile/constants/theme.ts:41-63`; `Spacing.sm+4` (=12) repeated in ~18 files; hardcoded `fontSize` everywhere; `app.json:9-10` (`userInterfaceStyle: light`, `newArchEnabled: false`)
- **Issue:** no `Spacing` token for the de-facto default 12px padding; `Typography` (Inter + Noto Sans Devanagari) never applied — Devanagari matras/conjuncts risk clipping at Inter-tuned sizes; no dynamic type; light-only.
- **Fix:** add `Spacing.md2 = 12`; apply `Typography` tokens with per-locale `fontFamily`; audit 48dp minimums on all touchables; document why `newArchEnabled` stays false or enable-and-test.

### ISS-315 — `VoiceDock` state prop is decorative [P3]
- **Location:** `apps/mobile/app/(tabs)/index.tsx:42` (`useState('idle')`, setter never called), passed at `:297`; `components/VoiceDock.tsx:25-46` (pulse ring on `listening`)
- **Issue:** the dock can never show `listening`/`processing` from home — the animation exists for a state that is never set.
- **Fix:** wire real recording state or drop the prop and let `VoiceDock` own it.

### ISS-316 — Tautological protocol asserts; `validatePatient` untested [P3]
- **Location:** `tests/clinical_rules_test.js:76-80` (loads JSON to assert literal `140/90/180`); `:2-5` (imports `validatePatient`, never calls it)
- **Issue:** Test 5 re-states constants instead of testing behavior; five range guards (`validation.ts:29-147`) have zero coverage.
- **Fix:** drive thresholds from JSON into engine calls (139/89 → silent, 140/90 → fires); add age −1/200, BP 320/20, glucose 10/900, gestation 0/50 cases asserting `OUT_OF_RANGE`.

---

## Appendix A — Verification commands

```powershell
# shared build + typecheck + suites
npm run build --workspace=@asha/shared
npx tsc --noEmit --project apps/mobile/tsconfig.json
node tests/clinical_rules_test.js
$env:PYTHONIOENCODING="utf-8"; python tests/sync_idempotency_test.py

# backend (the working invocation)
python -m services.api.main
curl http://127.0.0.1:8000/patients

# APK identity + signature
aapt dump badging dist\ASHA-AI-Copilot-v1.0.0-release.apk
apksigner verify --verbose dist\ASHA-AI-Copilot-v1.0.0-release.apk

# patch presence after a clean install (ISS-018)
npm ci
grep -c stringifyFn node_modules/expo-router/build/fork/getPathFromState.js `
  node_modules/expo-router/build/fork/getPathFromState-forks.js `
  node_modules/expo-router/build/global-state/routeInfo.js

# device crash check (ISS-018)
adb shell pidof org.health.asha.aicopilot
adb logcat -d -b crash | findstr FATAL
```

## Appendix B — Investigated and cleared, or status-changed

- **"Sync queue never fills / `enqueue` has zero callers" — DISPROVEN.** Direct grep finds 6 call
  sites: `(tabs)/followups.tsx:47`, `screening/summary.tsx:166,175`, `patients/[id].tsx:72`,
  `screening/manual-entry.tsx:94`, `patients/new.tsx:73`. The claim came from an over-narrow
  grep; it is excluded from the register. (The adjacent true findings — `markFailed` with zero
  callers **[V]**, `worker` never enqueued — are kept as ISS-153-adjacent and ISS-135-adjacent
  coverage: see ISS-136 and the worker-repo gap in ISS-230's fix notes. Concretely: `markFailed`
  defined `syncQueueRepo.ts:48`, callers: none **[V]**; no `workerRepo` file exists.)
- **`postinstall` status changed mid-review.** An earlier read of root `package.json` (28 lines,
  scripts `start:mobile|start:dashboard|test|api:start` only) showed no `postinstall`. The file as
  read 2026-10-07 has 32 lines with `"postinstall": "node scripts/patch-expo-router.js"` (`:15`)
  and `"query-string": "7.1.3"` (`:30`). The most likely explanation is that the wiki's
  recommended fix was applied between sessions. Consequence: ISS-018's fix #1 is now wired
  locally — **what remains is verifying it executes in EAS cloud builds** (which may use
  `--ignore-scripts` or a frozen lockfile path) and rebuilding `dist/`. The wiki
  (`overview.md`, `sources/monorepo-overview.md`, `analyses/navigation-crash-2026-10-06.md`) and
  `AGENTS.md` statements saying "no postinstall" are now stale and must be updated to "present
  since 2026-10-07, EAS execution unverified".
- **State-desync crash theory — SUPERSEDED.** An index/routes desync in `getActiveRoute` throws
  `Cannot read properties of undefined (reading 'state')`. The device threw `TypeError: undefined
  is not a function` — a call, not a property read. The register records only the latter; see
  `wiki/analyses/navigation-crash-2026-10-06.md` for the full reasoning.
- **`react-native-screens` version** — declared `~4.4.0` (`apps/mobile/package.json:28`),
  installed 4.4.0. Earlier review notes mentioning "exact-pinned 4.12.0" confused it with
  `react-native-safe-area-context: 4.12.0` (`:27`); corrected here.

## Appendix C — Method note

Seven specialist scans ran in parallel over disjoint areas (security, pipeline logic, backend,
database, mobile UI, tests/QA, archaeology), each constrained to cited, verifiable claims with
concrete fixes. Synthesis merged ~120 raw findings into these 88: exact duplicates merged (auth
bypass ×3 scanners, mock-auth ×2, ack-discarding ×3, `ON 1=1` ×2, silent patch ×2), severity set
by user impact rather than reporter vote (downgrades: plaintext HTTP, LAN bind, audio retention,
PIN-at-rest, delete-before-update, queue-id scheme, `sync_status` hardcoding, staleness,
prefill, roles, logcat — each with rationale inline or in the item), and two claims excluded or
superseded per Appendix B. Line numbers refer to the tree as read 2026-10-07.
