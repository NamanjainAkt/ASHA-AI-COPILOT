---
type: concept
created: 2026-10-07
updated: 2026-10-07
sources: [entities/clinical-rule-engine.md, sources/shared-package.md]
tags: [clinical, ux, explainability, bilingual]
---

# "Why Was This Flagged?" — the Explainability Surface

The docset makes a strong claim here (`docs/wiki/clinical-protocols.md:72-97`): frontline workers
must be able to explain an alert to a patient and their family, so *"the app does not display
opaque error codes."* This page traces the actual chain and finds where it holds and where the
claim outruns the implementation.

## The chain

```text
protocol JSON (reason_en / reason_hi / next_workflow)
  → evaluateRules() → RuleResult            services/rules/engine.ts
  → stored as JSON in screenings.rule_results
  → <RiskCard rule={r} />                    components/RiskCard.tsx
  → (formatRuleExplanation — never called by any screen)
```

`RuleResult` is the contract (`packages/shared/src/types.ts:67-73`):

```ts
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  priority: PriorityLevel;
  reason: string;
  reason_hi?: string;
  nextWorkflow: string;
  protocolSource: string;
}
```

Note `protocolSource` is **required** in TS but absent from every seeded rule result
([[sources/shared-package]]) — so `RiskCard`'s "source protocol" line (`:60-63`) renders blank
for demo data.

`RiskCard` (`components/RiskCard.tsx`) is genuinely good at the stated job: priority-coloured
border and pill (`:17-18`, `:33`, `:46-50`), the bilingual reason (`:54-57`), the source protocol
(`:60-63`), and the required next action (`:66-69`). It also strips the `(English)` half out of
`ruleName` when the UI language is Hindi (`:21-27`), which is a thoughtful touch given the
names are authored bilingually.

## What holds

- **Every rule carries both languages, authored at the protocol level** — not machine-translated at
  render time. A clinical advisor reviews the Hindi in a JSON diff.
- **Every rule states a next action.** `next_workflow` is required and always present: *"Urgent
  referral to PHC/CHC medical officer on the same day"*, *"Immediate emergency referral to First
  Referral Unit (FRU) / CHC via 108 ambulance."* This is the difference between a badge and
  guidance.
- **The AI never writes the explanation of *why*.** `reason`/`reason_hi` come from the rule, not
  from Qwen. Qwen only produces a plain-language summary of already-decided findings
  ([[concepts/deterministic-triage]]).
- **Severity is auditable.** Every displayed alert can be traced to a `ruleId` in a versioned
  JSON file.

## What does not hold

**1. Stated conditions that are not implemented.** Two pregnancy rules over-promise relative to
their code ([[entities/clinical-rule-engine]]):

| Rule | Text says | Code does |
| :--- | :--- | :--- |
| `RULE_MATERNAL_FETAL_MOVEMENT` | "after 24 weeks" | bare boolean (`:276`), no gestational-age gate |
| `RULE_MATERNAL_EDEMA_BP` | "swelling **with elevated blood pressure**" (Hindi: "बढ़ा हुआ रक्तचाप") | `swelling` alone (`:299`); the pregnancy payload has **no BP field at all** |

A worker reading "swelling combined with elevated blood pressure" will tell a family that BP was
elevated when no BP measurement exists in the record. For an explainability surface, a stated
condition that is not enforced is worse than an unstated one — it invites the worker to assert
something the system never checked.

**2. `formatRuleExplanation` is dead code.** `services/rules/explainability.ts` (39 lines) is
never imported by any screen — grep-verified. Its `language` parameter (`:16`) is declared,
defaulted and never referenced. `generateClinicalExplainabilityCards` (`:37-39`) maps its input
verbatim **without filtering on `rule.triggered`** — safe today only because `evaluateRules`
returns exclusively triggered results.

So the more elaborate explainability layer — including the `isReferralNeeded` flag
(`:17`) — exists but is not what the user sees. The shipped UI uses the simpler `RiskCard`.

**3. Only `high` is visually distinct.** In `explainability.ts:23-28`, `medium` and `low` share an
identical badge. `RiskCard` does colour all three (`Colors.danger` / `warning` / `success`), so
the shipped surface is better than the dead helper — but severity gradation rests entirely on
colour, with no textual severity label. Colour-only encoding is an accessibility problem
(protanopia/deuteranopia) in a tool used to triage emergencies.

**4. `field_status` uncertainty is never surfaced.** The validator computes `'present' |
'missing' | 'uncertain'` per field and persists it in `structured_data`
([[sources/shared-package]]), but **no screen reads it**. So a BP the validator marked
`uncertain` is displayed with the same confidence as a clean one — and, as
[[entities/clinical-rule-engine]] shows, is triaged as if it were real. The one piece of
provenance the system computes for the worker is invisible.

**5. Demo triage prose is not engine output.** Seeded `rule_results` carry hand-written Hindi that
diverges from what the rules produce ([[entities/local-sqlite-store]]). Every read screen displays
that fixture text, so the demo's explainability output is authored, not generated.

## The design idea is right

The instinct behind this surface — that a frontline worker must be able to say out loud *why* the
app is telling them to send someone to the PHC — is the right instinct, and it is why this codebase
is more careful than most. The gap is not philosophy; it is that three of the five gaps above are
one-line fixes (filter `field_status` into the UI, add the gestational-age gate, drop the BP claim
from the edema rule) and two are dead-code deletions.

## Related

- [[concepts/deterministic-triage]] · [[concepts/bilingual-design-system]] · [[concepts/silent-failure-pattern]]
- [[entities/clinical-rule-engine]] · [[sources/shared-package]] · [[sources/mobile-ui-navigation]]
- [[flows/voice-screening-journey]]
