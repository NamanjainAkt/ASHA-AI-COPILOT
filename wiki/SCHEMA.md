---
type: schema
created: 2026-10-07
updated: 2026-10-07
---

# ASHA AI Copilot — Wiki Conventions

This wiki is an **LLM-maintained knowledge base over the ASHA AI Copilot codebase**.
The code is the source of truth and is immutable from the wiki's point of view; every page
here is synthesis with citations back into it.

## Layout

```text
wiki/
├── SCHEMA.md     # this file — conventions
├── index.md      # content-oriented catalogue of every page
├── log.md        # append-only chronological record
├── overview.md   # top-level synthesis / current thesis
├── sources/      # one page per code subsystem (the "what is where" layer)
├── entities/     # one page per load-bearing service, store, or runtime component
├── concepts/     # one page per cross-cutting invariant or pattern
├── flows/        # one page per end-to-end user/system journey
└── analyses/     # filed answers: diagnoses, comparisons, release verdicts
```

There is **no `raw/` directory**. This is a code-mode wiki — the repository *is* the source
collection, so sources are cited as `path:line` rather than copied.

## Page frontmatter

Every page except `index.md` and `log.md` starts with:

```yaml
---
type: entity | concept | source | flow | analysis | overview | schema
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [sources/other-page.md]
tags: [topic-a, topic-b]
---
```

Use absolute dates only. Bump `updated` whenever you edit a page body.

## Citation rules

- **Every non-trivial claim gets a `path:line` citation**, e.g. `apps/mobile/services/rules/engine.ts:338`.
- Cite subsystem pages with `([[sources/mobile-services]])`.
- When a claim comes from runtime observation (emulator, logcat, adb) rather than static code,
  say so explicitly and give the observation: device, timestamp, command.
- **Never present a claim as verified when it is inferred.** Mark inference as *(inferred)* and
  give the falsification test. Several pages in this wiki deliberately record hypotheses.

## Cross-referencing

Use Obsidian-style `[[wikilinks]]` and end every page with a `## Related` block.
Never leave a `[[wikilink]]` pointing at a page that does not exist.

## Codebase conventions worth preserving in the prose

- Rule thresholds and bilingual clinical text belong in `packages/shared/src/protocols/*.json`
  ([[sources/shared-package]]), not inline in TypeScript. When documenting a rule, note whether
  its thresholds come from JSON or are hardcoded — they are not all JSON-backed.
- Seed data in `services/db/database.ts` and `services/api/database.py` is **hand-written fixture
  text, not engine output**. Never quote a seeded `reason_hi` as if the rule engine produced it.
- `docs/wiki/` is a **pre-existing, human-written documentation set**. It is a secondary source.
  Where it disagrees with the code, the code wins and the disagreement is recorded under
  `## Contradictions` on the relevant page.

## Workflows

- **Ingest a subsystem**: survey it, write/extend `sources/<subsystem>.md`, then drill out
  `entities/`, `concepts/`, `flows/` pages. Update `index.md` and append to `log.md` in the same pass.
- **Answer a question**: read `index.md` first, drill into pages, cite. If the answer is
  non-trivial or durable, file it to `analyses/` and log it.
- **Lint**: orphans, dangling links, stale `updated` dates, contradictions, index drift.
  Propose structural fixes; auto-fix only mechanical ones.
