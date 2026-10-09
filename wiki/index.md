# ASHA AI Copilot — Wiki Index

Catalogue of every page, organised by category. Read this first, then drill in.

The wiki is **code-mode**: sources are the repository itself, cited as `path:line`. There is no
`raw/` directory. `docs/wiki/` (pre-existing, human-written) is a secondary source — the code
wins, and disagreements are recorded on the relevant pages.

Conventions: [[SCHEMA]]. Current synthesis: [[overview]]. History: [[log]].

---

## Sources — one page per code subsystem

| Page | Covers |
| :--- | :--- |
| [[sources/monorepo-overview]] | npm workspaces layout, build chain, `@asha/shared` consumption, run/test commands, the three unwired manual steps |
| [[sources/mobile-ui-navigation]] | 17 route files, root stack, 4 tabs, splash auth gate, onboarding, login, per-screen data loads and mutations, theme + translations |
| [[sources/mobile-services]] | `services/ai` (orchestrator + both drivers), `services/db` (schema, singleton, seeds, 4 repos), `services/rules`, `services/sync` |
| [[sources/shared-package]] | `types.ts`, `validation.ts`, the two protocol JSONs, the barrel, compiled `dist/` contract |
| [[sources/backend-api]] | Every FastAPI endpoint, `/sync/push` upsert SQL, `/sync/pull`, dashboard JSON routes, Pydantic models, schema, seeding |
| [[sources/supervisor-dashboard]] | `apps/dashboard/index.html` — KPIs, triage table, worker panel, polling, the non-functional triage button |
| [[sources/tests-and-tooling]] | The two test suites and exactly what they assert (and don't), plus APK build/signature/install/emulator tooling notes |

## Entities — load-bearing services, stores, components

| Page | Covers |
| :--- | :--- |
| [[entities/screening-orchestrator]] | Pipeline order, driver fallback, the one-slot in-memory result cache, why the native engine never runs |
| [[entities/clinical-rule-engine]] | All 12 rules, which are JSON-backed vs hardcoded, suppression logic, priority sort, the `field_status` blind spot |
| [[entities/local-sqlite-store]] | 6 tables, the `dbPromise` singleton, the single dead migration, the seed gate, non-atomic seeding |
| [[entities/sync-engine]] | `syncQueueRepo` + `syncService`: batch shape, the discarded server response, `markSuccess` delete-before-update, absent retry/reconnect |
| [[entities/supervisor-backend-service]] | The FastAPI app as a runtime object: import-time DB mutation, open CORS, mock auth, `ON 1=1` join |

## Concepts — cross-cutting invariants and patterns

| Page | Covers |
| :--- | :--- |
| [[concepts/offline-first-invariants]] | The four stated invariants vs. what the code actually enforces |
| [[concepts/deterministic-triage]] | Why rules-not-models is structural here, and the one path where that boundary is porous |
| [[concepts/explainability]] | "Why was this flagged?" — `RuleResult` → `RiskCard` → `RuleExplanation`, and the projection that adds nothing clinical |
| [[concepts/silent-failure-pattern]] | The dominant engineering idiom: swallowed errors, fail-open auth, dead retry counters, decorative safety nets |
| [[concepts/bilingual-design-system]] | Colour/spacing tokens, `Translations` as two whole objects, and the "Purple Ban" vs. what ships |

## Flows — end-to-end journeys

| Page | Covers |
| :--- | :--- |
| [[flows/voice-screening-journey]] | Record → transcribe → extract → validate → rule → summarise → human confirm → SQLite → queue |
| [[flows/sync-lifecycle]] | Enqueue → manual trigger → batch push → server upsert → local ack, and where it can silently lose data |
| [[flows/onboarding-and-auth]] | First launch → SecureStore keys → PIN → session → logout, and the four bypasses |

## Analyses — filed answers

| Page | Covers |
| :--- | :--- |
| [[analyses/navigation-crash-2026-10-06]] | The release-blocking crash: evidence, root-cause analysis, competing hypotheses, verification plan |
| [[analyses/release-readiness-2026-10]] | Pass/fail verdict for `dist/` v1.0.0 against the four invariants and the PRD checklist |
| [[analyses/fix-verification-2026-10]] | Audit of the "all 88 resolved" claim: re-run chain, per-area verdicts, partials, carry-overs |
| [[analyses/ai-models-not-integrated-2026-10]] | Whisper/Needle 2/Qwen runtime analysis: weights/runtime gap, resolution via Model Manager, Qwen 0.5B vs 1.7B, and multilingual NLP harness |
| [[analyses/form-integration-and-edit-flow-2026-10]] | Full form expansion, dedicated beneficiary edit flow (`patients/edit.tsx`), reactive verification gate, extended clinical rule engine, and sync persistence |
## Gaps worth filling

- iOS behaviour is entirely unexercised (no `Info.plist`/permissions review beyond `app.json:19-21`).
- `stitch_asha_ai_copilot_ui/` design source has not been compared against the shipped screens.
- No page yet on the two standalone root docs (`ASHA AI Copilot — Final Product Requirements Document.md`,
  `asha-mobile-app.md`) — the PRD's definition-of-done list is the natural spine for `analyses/release-readiness-2026-10`.
