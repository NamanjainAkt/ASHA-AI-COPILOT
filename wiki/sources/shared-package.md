---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [entities/clinical-rule-engine.md, concepts/deterministic-triage.md]
tags: [shared, types, validation, protocols]
---

# `@asha/shared` — Types, Validation, Protocol JSON

The only package that is genuinely shared, and the only place clinical thresholds and bilingual
clinical text are authored. Compiled to `dist/` and consumed as CommonJS
([[sources/monorepo-overview]]).

## Layout

```text
packages/shared/src/
├── types.ts                 146 lines — every domain interface
├── validation.ts            155 lines — validatePatient, validateScreeningData
├── protocols/
│   ├── ncd-demo.json        66 lines
│   └── pregnancy-demo.json  56 lines
└── index.ts                 barrel: export * types, export * validation, re-export the 2 JSONs
```

## `types.ts` — the domain contract

`packages/shared/src/types.ts:1-146`. Scalar unions first: `SyncStatus` (`'synced'|'pending'|'failed'`),
`PriorityLevel` (`'low'|'medium'|'high'`), `Gender`, `ScreeningType` (`'ncd'|'pregnancy'|'general'`),
`FollowUpStatus` (`:1-5`).

Then the entity interfaces: `Worker` (`:7-15`), `Patient` (`:17-28`),
`NCDScreeningData` (`:30-42` — all numeric fields `number | null | undefined`, so "absent" is
representable), `PregnancyScreeningData` (`:44-56`), `StructuredScreeningData` (`:58-65`, with
optional `ncd`/`pregnancy` sub-objects and `field_status`), `RuleResult` (`:67-73`),
`Screening` (`:75-87`), `FollowUp` (`:89-100`), `SyncQueueItem` (`:102-112`),
`SyncRecord` (`:114-119`), `SyncPushPayload` (`:121-125`), `SyncPushResponse` (`:127-137`),
`DashboardSummary` (`:139-146`).

The type system makes the clinical safety invariant *representable*: `RuleResult.priority` is a
closed union, so a model cannot introduce a new severity level even if one tried.

## `validation.ts` — the sanitizer

Two exported functions and two interfaces (`:3-14`):

```ts
export interface ValidationIssue {
  field: string;
  code: 'INVALID_VALUE' | 'OUT_OF_RANGE' | 'CONTRADICTION' | 'MISSING_REQUIRED' | 'UNCERTAIN';
  message: string;
  message_hi: string;
}
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  sanitizedData: StructuredScreeningData;
}
```

`validatePatient` (`:16-40`) — two checks only: non-empty `name` (`MISSING_REQUIRED`), age in
0–120 (`OUT_OF_RANGE`). Returns a bare issue array.

`validateScreeningData` (`:42-155`) — deep-clones via `JSON.parse(JSON.stringify(data))`
(`:47`) and annotates `field_status` (`:48`).

**Bounds are inline literals.** There is **no exported `PHYSIOLOGICAL_RANGES`** — the bound
constants in `docs/wiki/clinical-protocols.md:104-110` do not exist in code.

| Field | Bound | Line |
| :--- | :--- | :--- |
| `age` | 0–120 | `:29` |
| `bp_systolic` | 50–260 mmHg | `:56` |
| `bp_diastolic` | 30–160 mmHg | `:72` |
| `blood_glucose` | 30–600 mg/dL | `:104` |
| `gestational_age_weeks` | 1–44 | `:136-140` |

Issue codes actually emitted: `MISSING_REQUIRED` (`:22`), `OUT_OF_RANGE` (`:32`, `:59`, `:75`,
`:107`, `:143`), `CONTRADICTION` (`:95`, `:128`). `INVALID_VALUE` and `UNCERTAIN` are declared
in the union and **never emitted**.

Two contradiction branches:

- **BP ordering** (`:88-100`) — if both values are truthy and `systolic <= diastolic`, push
  `CONTRADICTION` on field `blood_pressure` and set `field_status['blood_pressure'] =
  'uncertain'`. The truthiness guard means a reading of `0` skips the check entirely.
- **Biological gender** (`:125-132`) — `patient.sex === 'male' && pregnancy_status ===
  'pregnant'` → `CONTRADICTION`. Note: the wiki docset calls this `BIO_INVALID_GENDER`
  (`docs/wiki/clinical-protocols.md:114`); the code emits plain `CONTRADICTION`.

`isValid` is `issues.length === 0` (`:151-155`) — **any** issue, including a soft
`field_status` annotation, flips the whole payload invalid.

### The critical gap: annotation without correction

`validation.ts` **never nulls or clamps an out-of-range value.** On an implausible reading it
records the issue and sets `field_status[field] = 'uncertain'` (`:63`, `:79`, `:111`), but leaves
the number in place on the sanitized object. The rule engine then compares that number against
its thresholds exactly like a real reading. So `bp_systolic: 9999` is simultaneously flagged
`uncertain` *and* fires `RULE_NCD_BP_CRITICAL` (9999 ≥ 180). Nothing between `'uncertain'` and
the comparison consults `field_status` — `engine.ts` contains **zero** references to it. See
[[concepts/silent-failure-pattern]].

## Protocol JSON — where clinical thresholds live

### `ncd-demo.json`

Top level: `protocol: "ncd_demo_v1"`, `version: "1.0"`,
`name: "Non-Communicable Diseases Community Screening Protocol"`,
`source: "National NCD Screening Guidelines (Demo Alignment)"`.

| Path | id | threshold | priority |
| :--- | :--- | :--- | :--- |
| `bp.severe_reading_rule` | `RULE_NCD_BP_CRITICAL` | `systolic 180`, `diastolic 110` | `high` |
| `bp.high_reading_rule` | `RULE_NCD_BP_HIGH` | `systolic 140`, `diastolic 90` | `medium` |
| `glucose.high_reading_rule` | `RULE_NCD_GLUCOSE_HIGH` | `random_threshold 200`, `fasting_threshold 126` | `high` |
| `lifestyle.tobacco_risk_rule` | `RULE_NCD_TOBACCO` | — | `low` |
| `adherence.medication_missed_rule` | `RULE_NCD_MED_NON_ADHERENCE` | — | `medium` |

Each rule carries `enabled`, `reason_en`, `reason_hi`, `next_workflow`. Note
`fasting_threshold: 126` is **declared but never read** by the engine — a fasting glucose of 150
is judged against the random threshold of 200 and passes.

### `pregnancy-demo.json`

Top level: `protocol: "pregnancy_danger_signs_v1"`, `version: "1.0"`,
`name: "Maternal & Pregnancy Danger Signs Protocol"`,
`source: "NHM ASHA Maternal Health Handbook & Danger Signs Checklist"`.

Flat `rules` map (unlike NCD's nested domain grouping):

| key | id | priority |
| :--- | :--- | :--- |
| `vaginal_bleeding` | `RULE_MATERNAL_BLEEDING` | `high` |
| `severe_headache_blurred_vision` | `RULE_MATERNAL_PREECLAMPSIA` | `high` |
| `severe_abdominal_pain` | `RULE_MATERNAL_ABDOMINAL_PAIN` | `high` |
| `reduced_fetal_movement` | `RULE_MATERNAL_FETAL_MOVEMENT` | `high` |
| `swelling_with_hypertension` | `RULE_MATERNAL_EDEMA_BP` | `high` |
| `high_fever` | `RULE_MATERNAL_FEVER` | `medium` |

Both files use `{systolic}`/`{diastolic}`/`{glucose}` placeholders that the engine interpolates
with `.replace(...)` ([[entities/clinical-rule-engine]]).

## Barrel and build

`index.ts:1-7` — `export * from './types'; export * from './validation';` plus named
`ncdProtocol` / `pregnancyProtocol` re-exports from the JSON imports. Compiled output confirms
the JSON is `require`d and re-exported.

`resolveJsonModule: true` (`tsconfig.json:12`) is what lands the JSON in `dist/protocols/`.
Note `dist/types.js` is 77 bytes — `types.ts` is type-only, so the emitted JS is empty; any
consumer importing a *value* from `types` would get `undefined`.

## Contract drift to watch

- `RuleResult.protocolSource` is **required** (`types.ts:71`) but is absent from every seeded
  `rule_results` row in `services/api/database.py:134-153` and `:203-213`.
- `SyncPushResponse.failed` is typed `{client_record_id, error}` (`types.ts:133-136`) but the
  Python side returns `{client_record_id, status, error?}` (`services/api/models.py:77-80`).
- `Worker` (`types.ts:9-15`) has no `sub_center` field, but both the mobile `workers` table
  (`services/db/database.ts:36`) and the onboarding insert (`onboarding/index.tsx:85`) use one.
  The backend `workers` table does not have it at all (`services/api/database.py:19-26`).

## Related

- [[entities/clinical-rule-engine]] · [[concepts/deterministic-triage]] · [[concepts/explainability]]
- [[sources/monorepo-overview]] · [[sources/mobile-services]] · [[sources/backend-api]]
- [[analyses/release-readiness-2026-10]]
