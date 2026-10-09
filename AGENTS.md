# AGENTS.md — ASHA AI Copilot

Offline-first Hindi voice-enabled AI copilot for frontline ASHA community healthcare workers.

## Wiki first — read before you touch code

This project maintains an **LLM-owned wiki** at `wiki/`. Treat it as the accumulated map of the
system. Before answering a question or making a change:

1. Read `wiki/index.md` first — it is the catalogue of every page.
2. Read `wiki/log.md` (`grep "^## \[" wiki/log.md | tail -20`) to see recent ingests, queries and
   analyses.
3. Drill into the relevant pages before reading raw code. Every claim there carries a `path:line`
   citation back into the repo.
4. `wiki/overview.md` is the current top-level synthesis and thesis.

Conventions live in `wiki/SCHEMA.md`. Page layout:

```text
wiki/
├── SCHEMA.md   conventions      ├── concepts/  cross-cutting invariants & patterns
├── index.md    catalogue        ├── flows/     end-to-end journeys
├── log.md      history          └── analyses/  filed answers & diagnoses
├── overview.md synthesis
├── sources/    one page per code subsystem
└── entities/   load-bearing services, stores, components
```

### Maintaining the wiki

- **The wiki has no `raw/`.** This is a code-mode wiki — the repository *is* the source
  collection. Cite `path:line`; never copy code into the wiki.
- **Code is authoritative. `docs/wiki/` is not.** The pre-existing hand-written docs at
  `docs/wiki/` are a *secondary* source and are wrong in places that matter (e.g. they document
  `python services/api/main.py`, which cannot work). Where they disagree with the code, record the
  disagreement on the relevant wiki page under `## Contradictions` — do not silently follow them.
- After any non-trivial change, update the affected pages in the same pass and append to
  `wiki/log.md`. An unlogged edit is a lost edit.
- File non-trivial findings to `wiki/analyses/` rather than leaving them in chat.

## Three unwired manual steps — do not assume a clean install works

These are the repo's characteristic failure mode. Each is required for correct behaviour and none
is automated:

1. **`npm run build --workspace=@asha/shared`** after editing `packages/shared/src/**`. The mobile
   app and the clinical test suite both load compiled `dist/` output, never TS sources.
2. **`node scripts/patch-expo-router.js`** — patches three files under `node_modules/expo-router/`.
   Root `package.json:15` declares the `postinstall` **since 2026-10-07**; before that date there
   was none, so any EAS build or `npm ci` with `--ignore-scripts` ships unpatched. **Unverified:**
   whether the hook actually executes in EAS cloud builds. Check build logs for
   `Patched … successfully` before trusting a release artifact.
3. **`python -m services.api.main`** from the repo root. The documented
   `python services/api/main.py` fails with `ImportError` (relative imports, no `__init__.py`).

## Commands

```powershell
npm run build --workspace=@asha/shared        # required after shared-package edits
npx tsc --noEmit --project apps/mobile/tsconfig.json
node tests/clinical_rules_test.js              # runs against packages/shared/dist
$env:PYTHONIOENCODING="utf-8"; python tests/sync_idempotency_test.py
python -m services.api.main                    # backend :8000 + /dashboard
npm run start:mobile                           # Expo dev server
```

`npm test` runs **neither** suite — no workspace defines a `test` script.

## Invariants — do not weaken

Stated in `docs/wiki/principal-architecture.md:10-15`, audited in `wiki/concepts/offline-first-invariants.md`.

1. **Field** — the clinical workflow must never block on HTTP. The only `fetch` in the service
   layer is the manual, user-initiated sync.
2. **Clinical safety** — no LLM decides priority. `evaluateRules()` is pure TypeScript;
   `RuleResult.priority` is a closed union. Do not move thresholds into prompts.
3. **Privacy** — raw audio must not be retained or synced.
4. **Network** — replay must be idempotent, keyed on client-generated ids.

Known gaps in 3 and 4 are catalogued in the wiki; do not treat them as correct behaviour.

## Code conventions

- Clinical thresholds and bilingual clinical text belong in
  `packages/shared/src/protocols/*.json` — not inline in TypeScript. When editing a rule, note in
  the wiki whether its thresholds are JSON-backed or hardcoded; they are not all JSON-backed.
- Seed data (`services/db/database.ts`, `services/api/database.py`) is **hand-written fixture
  prose, not engine output**. Never quote a seeded `reason_hi` as if the rule engine produced it.
- Error handling: prefer fail-closed for anything clinical. An error should be treated as
  information, not as an absence of information — see `wiki/concepts/silent-failure-pattern.md`
  for the ~25 instances of this pattern already in the tree, and the six places where failing open
  is actively dangerous.
