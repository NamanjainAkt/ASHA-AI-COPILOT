---
type: entity
created: 2026-10-07
updated: 2026-10-07
sources: [sources/shared-package.md, concepts/deterministic-triage.md]
tags: [clinical, rules, engine, triage]
---

# `evaluateRules` — the Deterministic Clinical Rule Engine

`services/rules/engine.ts` (362 lines). This is the component that makes the app a clinical tool
rather than a chatbot: **no model participates in it at all.** It is pure TypeScript over
already-validated data ([[concepts/deterministic-triage]]).

## Shape

```ts
export interface HealthRule {   // :9-15
  id: string;
  name: string;
  protocol: string;
  enabled: boolean;
  evaluate(data: StructuredScreeningData): RuleResult | null;
}
```

`evaluateRules(data)` (`:338-362`) runs the NCD suite when `data.screening_type === 'ncd' ||
data.ncd` (`:341`) and the pregnancy suite when `data.screening_type === 'pregnancy' ||
data.pregnancy` (`:350`), then sorts by priority descending (`high:3 > medium:2 > low:1`,
`:360-361`). Within equal priority, insertion order is preserved (stable sort).

The two gates are **OR, not XOR**, so a payload declaring one type while carrying the other's
sub-object runs both loops. In practice each rule's own `if (!ncd) return null` guard
(`:26`, `:57`, `:91`, `:175`) makes sub-object presence the effective gate.

`enabled` is read from the protocol JSON for 11 of the 12 rules, so flipping `enabled: false` in
`packages/shared/src/protocols/*.json` disables a rule **with no code change** (`:343`, `:353`).

## The 12 rules

### NCD (`ncdRules`, `:17-194`) — protocol `Non-Communicable Diseases Community Screening Protocol`

| # | Lines | id | Trigger | Priority | Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| N1 | `:19-47` | `RULE_NCD_BP_CRITICAL` | `systolic >= 180 \|\| diastolic >= 110` | **high** | JSON |
| N2 | `:50-81` | `RULE_NCD_BP_HIGH` | `systolic >= 140 \|\| diastolic >= 90` | medium | JSON |
| N3 | `:84-114` | `RULE_NCD_GLUCOSE_HIGH` | `blood_glucose >= 200` | **high** | JSON |
| N4 | `:117-140` | `RULE_NCD_MED_NON_ADHERENCE` | `(known_hypertension \|\| known_diabetes) && medication_adherence === false` | medium | JSON |
| N5 | `:143-163` | `RULE_NCD_TOBAСCO` | `tobacco_use` truthy | low | JSON |
| N6 | `:166-193` | `RULE_NCD_MISSING_DATA` | BP or glucose `== null` | low | **hardcoded TS** |

Three behaviours worth knowing:

- **N2 suppresses itself when N1 fires.** `:60` — `if (systolic >= 180 || diastolic >= 110)
  return null;`. Correct precedence design: one crisis alert, not two stacked warnings.
- **N4 requires an explicit `false`.** `medication_adherence === false` (`:126`) — so an
  unknown/`null` adherence value never fires this rule. A patient who never mentioned medication
  produces no adherence flag.
- **N6 is the only fully hardcoded rule.** Every field is a TS literal including its bilingual
  reasons, built at runtime from a `missing` array (`:176-183`). Note it treats a missing
  diastolic alone as "रक्तचाप (Blood Pressure)" — one combined label, not per-field.

Also hardcoded and **duplicating the JSON**: the `>= 180 / >= 110` guard at `:60` is a literal
copy of `ncd-demo.json:23-24`, not read from the protocol. Change the JSON and this guard does
not follow.

### Pregnancy (`pregnancyRules`, `:196-336`) — protocol `Maternal & Pregnancy Danger Signs Protocol`

| # | Lines | id | Trigger | Priority |
| :--- | :--- | :--- | :--- | :--- |
| P1 | `:198-218` | `RULE_MATERNAL_BLEEDING` | `vaginal_bleeding` | **high** |
| P2 | `:221-243` | `RULE_MATERNAL_PREECLAMPSIA` | `severe_headache \|\| blurred_vision` | **high** |
| P3 | `:246-266` | `RULE_MATERNAL_ABDOMINAL_PAIN` | `severe_abdominal_pain` | **high** |
| P4 | `:269-289` | `RULE_MATERNAL_FETAL_MOVEMENT` | `reduced_fetal_movement` | **high** |
| P5 | `:292-312` | `RULE_MATERNAL_EDEMA_BP` | `swelling` | **high** |
| P6 | `:315-335` | `RULE_MATERNAL_FEVER` | `fever` | medium |

**There is no pregnancy missing-data rule.** N6 is NCD-only, so a pregnancy screening with no
gestational age is never flagged by any rule.

Two rule texts over-promise relative to their code:

- **P4** says "after 24 weeks" (`pregnancy-demo.json:42`) but `:276` tests the bare boolean — no
  gestational-age gate exists. A 10-week pregnancy with reduced movement reports identically to
  a 38-week one.
- **P5** says "swelling **combined with elevated blood pressure**" (`pregnancy-demo.json:49`) and
  the Hindi says "बढ़ा हुआ रक्तचाप", but `:299` tests `swelling` alone and the pregnancy payload
  carries no BP field at all.

Both are prose-only qualifiers that a rule name and reason string surface to the worker as if
they were enforced. For a clinical explainability surface, a stated condition that is not
implemented is worse than an unstated one — see [[concepts/explainability]].

## Interpolation

N1 and N2 build bilingual reasons by chained `.replace('{systolic}', …).replace('{diastolic}', …)`
(`:36-40`). N3 replaces `{glucose}` (`:103`). N4/N5 pass their JSON text through verbatim
(`:132-133`) — no placeholders, so no interpolation risk.

## The `field_status` blind spot

**`engine.ts` contains zero references to `field_status`.** Missing-data detection is purely
`== null` comparisons on the numeric fields (`:26`, `:57`, `:91`, `:176-177`).

Combined with the validator's behaviour — it annotates out-of-range values as `'uncertain'` but
**does not remove them** ([[sources/shared-package]]) — the consequence is concrete:

| Input | `field_status` | Validation issue | Rule outcome |
| :--- | :--- | :--- | :--- |
| `bp_systolic: 165` | `present` | none | N2 fires (medium) — correct |
| `bp_systolic: 9999` | `uncertain` | `OUT_OF_RANGE` | **N1 fires (high)** — the implausible number is compared to the threshold like a real reading |
| `blood_glucose: null` | `missing` | none | N6 fires (low) — correct |

So the "uncertain" annotation is **decorative**: it is computed, persisted with the record, shown
in the data model, and never consulted before a clinical decision. The safety net exists in the
type system and in the persisted JSON but has no effect on triage. This is the most important
finding about clinical correctness in this codebase.

## `explainability.ts` projection

`services/rules/explainability.ts` (39 lines) maps `RuleResult` → `RuleExplanation`
(`:16-35`): renames fields (`reason`→`detailedReason`, `protocolSource`→`sourceProtocol`,
`nextWorkflow`→`actionRequired`) and synthesises two things — a `headline`/`headline_hi` badge
pair and `isReferralNeeded = priority === 'high' || nextWorkflow.toLowerCase().includes('referral')`
(`:17`).

It adds **no clinical logic**. Two quirks: `medium` and `low` share an identical badge (`:23-28`),
so only `high` is visually distinguished; and the `language` parameter (`:16`) is declared,
defaulted, and never referenced — passing `'en'` changes nothing. See
[[concepts/explainability]].

## Who actually calls this

`evaluateRules` is called from exactly two places, both in the UI layer:
`screening/summary.tsx:22`, `:116` and `screening/manual-entry.tsx:17`, `:75`. Every other
screen — patients directory, patient detail, high-risk triage, home dashboard — derives risk
by scanning **already-persisted** `rule_results` JSON in JS
(e.g. `patients/index.tsx:55`, `patients/[id].tsx:109-111`, `patients/high-risk.tsx:43`) rather
than re-evaluating. So the engine runs at write time, and read screens just filter stored
output. That is the right performance choice; it also means a protocol threshold change only
affects future records.

## Related

- [[sources/shared-package]] · [[sources/mobile-services]]
- [[concepts/deterministic-triage]] · [[concepts/explainability]] · [[concepts/silent-failure-pattern]]
- [[flows/voice-screening-journey]] · [[analyses/release-readiness-2026-10]]
