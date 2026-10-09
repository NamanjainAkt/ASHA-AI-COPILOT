---
type: analysis
created: 2026-10-07
updated: 2026-10-07
sources: [sources/tests-and-tooling.md, concepts/offline-first-invariants.md]
tags: [release, qa, verdict, checklist]
---

# Release Readiness — `dist/` v1.0.0

**Filed:** 2026-10-06 · **Artifact:** `dist/ASHA-AI-Copilot-v1.0.0-release.apk` (76.84 MB) ·
**Verdict: NOT release-ready — the app cannot navigate past Home.**

## Verification results

| Check | Command | Result |
| :--- | :--- | :--- |
| Clinical rules suite | `node tests/clinical_rules_test.js` | ✅ **13/13** (was 5/5 at first audit; engine, boundary, gating, and validation coverage added since) |
| Sync idempotency suite | `python tests/sync_idempotency_test.py` | ✅ **3/3** |
| TypeScript | `npx tsc --noEmit --project apps/mobile/tsconfig.json` | ✅ clean |
| APK signature | `apksigner verify --verbose` | ✅ **Verifies**, v2 scheme |
| Package identity | `aapt dump badging` | ✅ `org.health.asha.aicopilot`, v1.0.0, minSdk 24 / target 34 |
| Backend liveness | `python -m services.api.main` + `GET /patients` | ✅ 200, 5 seeded patients |
| Cold start | `agent-device open … --relaunch` | ✅ Home renders |
| Idle stability | 30 s untouched | ✅ process alive |
| Follow-ups tab | tap | ✅ 4 cards, actions present |
| Home tab | tap | ✅ |
| **Navigate to /patients** | tap | ❌ **FATAL JS crash (×3)** |
| **Navigate to voice capture** | tap | ❌ **FATAL JS crash (×1)** |
| Sync tab, Profile tab, patient detail, high-risk, manual entry, summary, village, new patient | — | ⛔ **unreachable** — blocked by the crash |

Full detail: [[analyses/navigation-crash-2026-10-06]].

## The PRD definition-of-done checklist is unreliable

`README.md:78-100` lists 20 items, **all marked `[x]`**. Audited against code:

| Item | Claim | Reality |
| :--- | :--- | :--- |
| "Demo works on actual target Android device" | ✅ | ❌ **app crashes on first navigation** |
| "Reconnection triggers sync — network monitor triggers batch push when online" | ✅ | ❌ no network monitor, no reconnect trigger, no auto-sync ([[entities/sync-engine]]) |
| "Duplicate upload does not duplicate records" | ✅ | ✅ server-side true and tested; **client reuses `entity_id` as the record id** so two queue rows collide ([[flows/sync-lifecycle]]) |
| "No raw audio is unnecessarily retained" | ✅ | ⚠️ **no deletion step exists**; audio is captured to a file and never cleaned up. No path ever transcribes it, so no audio is uploaded either |
| "Local Whisper Tiny Hindi" / "Qwen generates a short Hindi explanation" | ✅ | ⚠️ the native engine is **unreachable** (`isAvailable()` always `false`, no native module in the repo). The deterministic simulator runs instead ([[entities/screening-orchestrator]]) |
| "Missing/uncertain values are detected — auto-flags missing glucose/BP" | ✅ | ⚠️ missing is detected; **uncertain is computed and never read** — no effect on triage or UI ([[entities/clinical-rule-engine]]) |
| "Rule reasons are displayed" | ✅ | ✅ genuinely, with bilingual text and next actions — this one holds |
| "Record saves offline" / "App survives restart while offline" | ✅ | ✅ SQLite singleton + seed gate are sound ([[entities/local-sqlite-store]]) |
| "Supervisor receives synced record" / "Dashboard shows priority cases" | ✅ | ⚠️ sync works, but per-worker counts are wrong (`LEFT JOIN … ON 1=1`), the triage button only calls `alert()`, and the active-worker count is hard-coded ([[sources/supervisor-dashboard]]) |

**11 of 20 hold. 6 are qualified. 3 are false.** A checklist where every box is ticked is not
evidence — this wiki exists because of that ([[concepts/silent-failure-pattern]]).

## Blocking, in order

**P0 — release blockers**

1. **Navigation crash.** Nothing else matters until the app can leave Home
   ([[analyses/navigation-crash-2026-10-06]]).
2. **`pin === '1234'` bypasses a worker-chosen PIN** (`login.tsx:66`), plus three more bypasses
   and plaintext PIN storage ([[flows/onboarding-and-auth]]).
3. **Unsaved-screening data loss with confirmation pre-ticked.** If the process dies between
   voice-capture and summary, `summary.tsx` falls back to hard-coded vitals `165/105/142` with
   `isHumanConfirmed` **already `true`** (`:69-92`, `:98-113`)
   ([[entities/screening-orchestrator]]).

**P1 — clinical correctness**

4. **`field_status` has no effect.** Out-of-range readings are annotated `uncertain`, left in
   place, and compared to thresholds as if real — `9999` mmHg fires the critical-hypertension
   rule ([[concepts/deterministic-triage]]).
5. **Server sync verdicts are discarded** (`syncService.ts:84`) — server-rejected records are
   recorded locally as synced ([[flows/sync-lifecycle]]).
6. **Queue row deleted before status update, no transaction** (`syncService.ts:88-91`) — orphans
   records at `pending` permanently.
7. **Two rules state conditions they do not implement** — the 24-week fetal-movement gate and the
   "with elevated BP" edema clause ([[concepts/explainability]]).
8. **`/dashboard/workers` cross join** (`main.py:444`) misinforms supervisors about field
   activity.

**P2 — correctness of what the worker sees**

9. **Patient risk colour derived from array position** — `index === 0` renders red
   unconditionally (`(tabs)/index.tsx:276-277`).
10. **`isOnline={true}` hard-coded** while `expo-network` is a declared, unimported dependency.
11. **Village coverage statistics fabricated** (`village/index.tsx:66`, `:127`, `:137`).
12. **`getMetrics().highRisk` text-matches a JSON column** (`screeningRepo.ts:133`) — silently
    returns 0 if stored JSON is ever pretty-printed.

**P3 — maintainability**

13. **Three unwired manual steps**: the expo-router patch (no `postinstall`), the
    `@asha/shared` build (tests read `dist/`), the Python package layout (documented run command
    is broken) ([[sources/monorepo-overview]]).
14. **`httpx` missing from `requirements.txt`** — a clean install cannot run the sync test.
15. **Both test banners are hard-coded**, not derived from assertions; `npm test` runs neither
    suite ([[sources/tests-and-tooling]]).
16. **Zero `TODO`/`FIXME`** and a docset (`docs/wiki/`) describing unimplemented features as
    complete.

## Test coverage reality

Both suites pass, and both are narrow:

- `clinical_rules_test.js` **never runs `evaluateRules`** — it loads the protocol JSON only to
  assert hard-coded numbers. Nothing tests the rule engine, orchestrator, any repo, or any screen.
- No `OUT_OF_RANGE` validation test, though that is the most common validation path.
- `sync_idempotency_test.py` covers only clean replay of a single patient record.
- **Zero UI tests.** Given that a one-line navigation difference crashes the app, that is the
  coverage gap that mattered.

## What genuinely holds

Worth stating plainly, because it is a lot of good work:

- APK builds, signs (v2), installs, launches, and renders a complete Hindi dashboard with correct
  demo data.
- Typecheck is clean; both automated suites pass.
- The offline-first core is real: the entire clinical path executes locally
  ([[concepts/offline-first-invariants]]).
- Deterministic triage is structurally enforced — no model can set a priority
  ([[concepts/deterministic-triage]]).
- Bilingual clinical text is authored at the protocol level and audited, not machine-translated
  ([[concepts/bilingual-design-system]]).
- Server-side idempotency is real and actually proven by a replay test.
- The clinical rule set and explainability surface are thoughtful and clinically coherent — the
  gaps are enforcement and plumbing, not clinical thinking.

## Recommended sequence

1. Fix + verify the navigation crash; **add a smoke test that launches the app and pushes every
   route in a release build** — that single test would have caught this before shipping.
2. Close the auth bypasses.
3. Make `field_status` authoritative, or delete it. Stop `summary.tsx` defaulting to
   hard-coded vitals with a pre-ticked confirmation.
4. Fix the four sync-acknowledgement defects (~40 lines in `triggerSync`).
5. Re-run the on-device walkthrough end to end — **most of this app has never been exercised on a
   device**, so expect more findings of this class.
6. Retire or relabel `docs/wiki/` so it stops contradicting the code.

## Related

- [[analyses/navigation-crash-2026-10-06]] · [[sources/tests-and-tooling]]
- [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]] · [[concepts/silent-failure-pattern]]
- [[flows/onboarding-and-auth]] · [[flows/sync-lifecycle]] · [[flows/voice-screening-journey]]
- [[overview]]
