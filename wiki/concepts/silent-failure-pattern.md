---
type: concept
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-services.md, entities/sync-engine.md, entities/clinical-rule-engine.md]
tags: [reliability, error-handling, risk]
---

# The Silent-Failure Pattern

The dominant engineering idiom in this codebase is: **never crash the worker's app, and never show
them an error.** That instinct is right for a device a frontline worker cannot afford to lose and
cannot troubleshoot. It is applied in ~25 places. In several of them it also discards the safety
information a clinical tool exists to provide.

This page names the pattern so it can be evaluated case by case instead of being mistaken for
good practice.

## The shape

```text
catch (e) { console.warn('…', e) }        // logged, then abandoned
```

- `console.warn` — **21 call sites** across the app, **0** `console.error`.
- `TODO` / `FIXME` / `HACK` / `XXX` — **0** in `apps/mobile/services`, `services/`, `packages/`.
- Empty `catch {}` blocks that swallow a parse error entirely: `(tabs)/index.tsx:61`,
  `(tabs)/profile.tsx:49`, `patients/new.tsx:39`, `village/index.tsx:36`.
- Silent degradation in the AI layer: 4 `console.warn` fallback paths
  (`orchestrator.ts:52`, `:77`, `:88`, `:108`).

Zero TODOs is not a virtue here — it means the code carries **no** record of known-incomplete work,
so the next reader discovers it from a `docs/` file that describes an unimplemented feature.

## Where it is correct

- **Database init failure at the root layout** (`_layout.tsx:13`) — a warning plus a splash
  retry beats blocking launch.
- **Audio permission denial** (`voice-capture.tsx:112`) — the manual-entry screen is a genuine
  fallback.
- **Native AI engine absent** (`orchestrator.ts:52-53`) — the simulator is a real, working
  implementation, not a stub.
- **`safeJsonParse`** (`screeningRepo.ts:4-11`) — the documented fix for a `SyntaxError` crash on
  malformed rows. A corrupt row should not take down the directory screen.

## Where it fails open, dangerously

**Authentication bypasses — four independent paths**, any one sufficient:

| Path | Line | Effect |
| :--- | :--- | :--- |
| `expectedPin = savedPin \|\| '1234'` | `login.tsx:64` | no PIN set → `1234` works |
| `pin === '1234'` unconditional | `login.tsx:66` | `1234` always works, whatever is stored |
| `catch → replace('/(tabs)')` | `login.tsx:73` | any SecureStore throw → logged in |
| `catch → replace('/(tabs)')` | `splash.tsx:34-36` | any DB/SecureStore throw → authenticated shell |

Plus the PIN is stored **plaintext** (`onboarding/index.tsx:65`), and the master PIN is printed
on the login screen (`login.tsx:160`). `login.tsx:66` is the severe one: it is not a fallback for
a missing credential, it is a **hard-coded credential that bypasses a real one.** A worker who
sets a PIN believing it secures the app is wrong.

**The home screen hardcodes `isOnline={true}`** (`(tabs)/index.tsx:119`) while `expo-network` is
a declared dependency (`apps/mobile/package.json:19`) that nothing imports. The worker sees a
connectivity indicator that is structurally incapable of showing "offline" — in an app whose
entire architecture is about being offline-first.

## Where it discards clinical safety information

**`field_status` is computed, persisted, and never read.** `validateScreeningData` annotates every
field `'present' | 'missing' | 'uncertain'` (`packages/shared/src/validation.ts:48-116`) and does
**not** remove out-of-range values; `evaluateRules` contains zero references to `field_status`
(`services/rules/engine.ts`). Consequence: `bp_systolic: 9999` is marked uncertain **and** fires
the critical-hypertension rule on the `>= 180` comparison. No screen displays the uncertainty
either ([[concepts/explainability]]). The safety net exists in three layers — type system, persisted
JSON, validator — and influences no decision and no pixel.

**The server's verdict on each synced record is discarded.** `const data = await response.json();`
(`syncService.ts:84`) is assigned and never read. `SyncPushResponse.processed[]` and `.failed[]`
(`types.ts:127-137`) are ignored, so a record the server reported as **failed** is deleted from
the queue and marked `synced` locally ([[entities/sync-engine]]). The worker is told the record
reached the PHC when it may not have.

**Retry bookkeeping is wired to nothing.** `syncQueueRepo.markFailed` (`:48-57`) has **zero
callers** — grep-verified — so `attempts` is always `0` and `last_error` always `NULL`. The
queue's failure accounting exists in the schema and is never populated.

**The dashboard cannot close a follow-up and hides worker counts.** Its triage button only calls
`alert()` (`apps/dashboard/index.html:204`); its "2 Active" count is hard-coded markup (`:148`); and
its per-worker screening counts are wrong because of a `LEFT JOIN … ON 1=1` cross join
(`services/api/main.py:444`). All fetch failures are swallowed to `console.warn` (`:243-245`) with
**no user-visible error state** — a supervisor cannot distinguish "no high-risk cases" from
"the backend is down" ([[sources/supervisor-dashboard]]).

## The most dangerous single interaction

`screeningOrchestrator.lastResult` is a **one-slot in-memory cache**
([[entities/screening-orchestrator]]). If the process dies between voice-capture and summary, the
extraction is gone and `summary.tsx` falls back to **hard-coded vitals** — `165/105/142`,
28 weeks, `hasBleeding: true`, and `isHumanConfirmed` **already `true`**
(`summary.tsx:69-92`, `:98-113`). A worker can save and sync a screening that was never measured,
with the human-in-the-loop checkbox pre-ticked. The guard against exactly this error class
(validation, confirmation, provenance) is inverted by a cache miss.

## Evaluating a future catch block

The useful question is not "should this swallow?" but **which failure would be worse**:

| Failure | Worse to… |
| :--- | :--- |
| DB won't open | crash the launch |
| Mic permission denied | block the visit |
| Native AI absent | show a technical error |
| Sync rejected a record | **tell the worker it succeeded** |
| Field marked `uncertain` | **triage it as real** |
| PIN lookup throws | **log the user in** |

The left column is where the pattern is right. The right column is where it is dangerous, and every
instance there shares one root cause: **an error is treated as an absence of information rather
than as information in its own right.**

## Related

- [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]] · [[concepts/explainability]]
- [[entities/sync-engine]] · [[entities/clinical-rule-engine]] · [[entities/screening-orchestrator]]
- [[sources/mobile-services]] · [[sources/supervisor-dashboard]]
- [[flows/onboarding-and-auth]] · [[analyses/release-readiness-2026-10]]
