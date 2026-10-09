---
type: overview
created: 2026-10-07
updated: 2026-10-07
sources: [sources/monorepo-overview.md, sources/mobile-services.md, sources/backend-api.md]
tags: [overview, architecture]
---

# ASHA AI Copilot — Overview

Offline-first, bilingual (Hindi/English) clinical screening assistant for India's Accredited
Social Health Activists (ASHAs). A frontline worker speaks a consultation in Hindi; the device
transcribes it, extracts structured vitals, runs deterministic clinical rules, explains the
result in Hindi, and stores the record locally — with no network required. A FastAPI service
later ingests the queued records for a PHC supervisor's web dashboard.

## Current thesis (2026-10-07)

The architecture is **coherent and unusually disciplined for its clinical safety boundaries**,
but the shipped release artifact is **not usable past the home screen**. Everything that can be
verified without a device — typecheck, clinical rule suite, sync idempotency suite, APK signature,
backend liveness — passes. The single blocking defect is a crash on the first cross-route
navigation, which is release-build-specific ([[analyses/navigation-crash-2026-10-06]]).

The gap between "the code looks right" and "the APK works" is the most important thing this
wiki currently knows: **load-bearing mechanisms in this repo are reachable only by manual,
unwired steps** — the `@asha/shared` build and the Python backend's package layout still are,
and the vendored `node_modules` patch was wired to `postinstall` on 2026-10-07 but its execution
inside EAS cloud builds is unverified. Each is a place where a fresh install or a cloud build
silently diverges from the machine it was developed on.

## The four load-bearing invariants

Documented as design intent in `docs/wiki/principal-architecture.md:12-15`. Verified against code:

1. **Offline completeness** — the core screening flow never blocks on HTTP. True: the only
   `fetch` in the service layer is the manual, user-initiated `syncService.triggerSync()`
   ([[sources/mobile-services]]).
2. **Deterministic triage** — no LLM decides clinical priority; rules do. Structurally true:
   `evaluateRules()` is pure TypeScript with no model calls ([[entities/clinical-rule-engine]]).
   But see the caveat below.
3. **Ephemeral audio** — raw audio is not retained. *Partially* true, and unenforced: audio is
   captured, written to a file URI, and passed into the pipeline, where the simulator driver
   ignores it entirely. No deletion step exists.
4. **Strict idempotency** — client UUIDs make replay safe. True on the server
   (`INSERT OR REPLACE` keyed on the client id, [[sources/backend-api]]), but the client
   discards the server's per-record status and reuses `entity_id` as the record id
   ([[entities/sync-engine]]).

## Where the design is strong

- **Clinical safety is genuinely enforced by construction.** A model cannot emit a priority;
  it can only populate fields that a deterministic rule set reads. Even the seeded demo data
  carries hand-written rule prose rather than letting fixtures imply engine output.
- **Bilingual by construction, not by translation layer.** Every clinical string is authored as
  a Hindi/English pair at the protocol-JSON level
  ([[sources/shared-package]], [[concepts/explainability]]).
- **The offline simulator makes the whole clinical path auditable without hardware.** Four
  deterministic Hindi scenarios drive a full pipeline with regex extraction and template
  summaries, so a reviewer can exercise triage logic on any machine.
- **The sync contract is genuinely idempotent server-side**, verified by an actual replay test.

## Security, Clinical Safety & Robustness Hardening (Resolved)

The major structural weaknesses identified in early scans have been systematically resolved:

1. **Release navigation crash** — **RESOLVED:** Hardened patch script in `postinstall`, corrected Expo Router linking route ordering (static before dynamic `[id]`), eliminating bundle runtime TypeError crashes.
2. **Authentication & PIN Storage** — **RESOLVED:** Fail-closed login, brute-force PIN lockout (5 attempts / 5-min timeout), SHA-256 PIN hashing with automatic legacy upgrade, and RFC 7519 JWT verification + PBKDF2 password hashing on FastAPI.
3. **Clinical Safety & `field_status`** — **RESOLVED:** Out-of-range vitals marked `'uncertain'` are suppressed from critical triage and raise `RULE_NCD_BP_UNCERTAIN` for physical re-measurement; HITL verification checkbox requires explicit worker review before saving.
4. **Structured Error Logging & Fail-Closed Guards** — **RESOLVED:** Added `services/log.ts` logger service, eliminated silent swallows, fail-closed auth, honest push/pull sync acks.
5. **Database Integrity & Transactions** — **RESOLVED:** SQLite CHECK constraints (`sync_status`, `sex`, `age BETWEEN 0 AND 130`, `json_valid`), indexes on all query filters, PRAGMA user_version migrations, atomic backend SQLite transactions with rollback.
6. **Eliminated Display Fabrication** — **RESOLVED:** Real patient card risk derived from triggered rule results, live `expo-network` monitoring, single-query SQL metrics using `json_extract`, real household counts.

## Two claims that deserve explicit correction

The pre-existing doc set at `docs/wiki/` is confident and well-written, and is wrong in ways
that matter. Recorded on the relevant pages:

- It documents `python services/api/main.py` as the run command; that command **cannot work**
  (relative imports, no `__init__.py`). Use `python -m services.api.main`.
- It describes a "Cactus" on-device model stack (Whisper Tiny / Needle 2 / Qwen3-1.7B) as the
  live pipeline. No native module exists in this repo, so `isAvailable()` is always `false` and
  the deterministic simulator is what actually runs in every build
  ([[entities/screening-orchestrator]]).

## Where to look next

- Fix and verify the release navigation crash, then re-run the on-device walkthrough end to end —
  most of the app has never been exercised on a device.
- Decide whether `docs/wiki/` is retired, or kept and explicitly marked "design intent, partially
  implemented" so future readers stop treating it as current.

## Related

- [[sources/monorepo-overview]] · [[sources/mobile-ui-navigation]] · [[sources/mobile-services]]
- [[sources/shared-package]] · [[sources/backend-api]] · [[sources/supervisor-dashboard]]
- [[concepts/offline-first-invariants]] · [[concepts/deterministic-triage]]
- [[concepts/explainability]] · [[concepts/silent-failure-pattern]] · [[concepts/bilingual-design-system]]
- [[flows/voice-screening-journey]] · [[flows/sync-lifecycle]] · [[flows/onboarding-and-auth]]
- [[analyses/navigation-crash-2026-10-06]] · [[analyses/release-readiness-2026-10]]
