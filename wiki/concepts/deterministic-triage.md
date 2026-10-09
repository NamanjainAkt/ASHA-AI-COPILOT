---
type: concept
created: 2026-10-07
updated: 2026-10-07
sources: [entities/clinical-rule-engine.md, entities/screening-orchestrator.md]
tags: [clinical, safety, architecture, ai-boundaries]
---

# Deterministic Triage — Why Rules, Not Models

The central design idea: **an LLM may read and explain clinical data, but it may never decide how
serious that data is.** For a tool used by non-clinicians at rural Indian sub-centres, this is the
difference between a useful tool and a liability.

This page explains *how* the boundary is enforced structurally, and the one place it leaks.

## Enforcement is structural, not conventional

Three independent mechanisms, none of which depends on a model behaving well:

1. **A closed priority union.** `PriorityLevel = 'low' | 'medium' | 'high'`
   (`packages/shared/src/types.ts:2`). There is no representation for a model-invented severity,
   so no prompt can express one.
2. **Rules are pure functions over validated data.** `evaluateRules()`
   (`services/rules/engine.ts:338-362`) imports nothing from `services/ai/`. No driver, no
   orchestrator, no network. It is ordinary `switch`-and-compare code.
3. **The boundary is enforced at the pipeline level too.** The orchestrator evaluates rules on
   `validation.sanitizedData` (`orchestrator.ts:97`), never on the raw model output, and the
   returned `extracted` is the *sanitized* object (`:118`). A model cannot smuggle a value past
   the validator, because the validator runs first and its output is what everything downstream
   sees.

Thresholds and bilingual clinical text live in protocol JSON
(`packages/shared/src/protocols/*.json`) rather than in prompts
([[sources/shared-package]]), so a clinical advisor can review and change triage behaviour without
touching TypeScript. 11 of 12 rules honour `enabled` from that JSON (`engine.ts:343`, `:353`).

## What the model is allowed to do

Exactly three things, matching the three `AIEngineDriver` methods
(`apps/mobile/services/ai/types.ts:14-20`):

| Method | Task | Model |
| :--- | :--- | :--- |
| `transcribe` | speech → text | `whisper-tiny-hindi` (`cactusDriver.ts:37`) |
| `extractScreeningData` | text → typed fields | `needle-2-45m` (`:55`) |
| `generateSummary` | validated data → plain Hindi prose | `qwen3-1.7b-q4` (`:89`) |

The Qwen system prompt is the clearest statement of intent in the codebase
(`cactusDriver.ts:76`): *"आप आशा कार्यकर्ता के लिए एक संक्षिप्त हिंदी सहायक हैं। आपको केवल दिए गए
मान्य डेटा का सरल हिंदी में सारांश बनाना है। कोई भी नया चिकित्सकीय निष्कर्ष या दवा न जोड़ें।"*
— summarise the given validated data in simple Hindi; add no new medical conclusion or medication.

The user prompt is a deliberate 3-key projection of the rules (`cactusDriver.ts:78-86`):
`{flag, priority, action}` per triggered rule. The model sees **less** clinical detail than the
rules produced, which is the right direction — it cannot restate a threshold it was never given.

Decoding parameters are near-deterministic: `temperature: 0` for Whisper (`:37`), `0.1` for Qwen
(`:92`), fixed `max_tokens`.

## The one porous edge

**The seeded demo data does not obey the boundary.** `database.ts:217-238` and `:278-299` embed
hand-written `rule_results` with rule prose that diverges from engine output — different
`ruleName`, different `reason_hi`, and `protocolSource: 'National NCD Screening Guidelines'` where
the engine emits the full protocol name. `s-002` carries only 2 pregnancy rules despite
`severe_abdominal_pain: true` and `swelling: true`, which the engine would also flag.

This is defensible as fixture authoring and must simply never be presented as engine output
([[entities/local-sqlite-store]]). The risk is that every screen which derives risk by scanning
stored `rule_results` — patients directory, patient detail, high-risk triage, home dashboard —
reads those fixtures, so **the demo UI shows triage output that the engine would not produce.**

## The real gap is not the model — it is the validator

The boundary holds against models. It does **not** hold against implausible *input*:

`validateScreeningData` annotates an out-of-range reading as `field_status: 'uncertain'` but
**does not remove the value** (`packages/shared/src/validation.ts:63`, `:79`, `:111`), and
`evaluateRules` contains **zero** references to `field_status`
([[entities/clinical-rule-engine]]). So `bp_systolic: 9999` is flagged uncertain *and* fires
`RULE_NCD_BP_CRITICAL` on the `>= 180` comparison, exactly like a real crisis reading.

The safety net exists in the type system and in persisted JSON, and has no effect on any clinical
decision. That is the single most consequential finding about clinical correctness in this
codebase — more important than anything the model could do wrong. See
[[concepts/silent-failure-pattern]].

## Related

- [[entities/clinical-rule-engine]] · [[entities/screening-orchestrator]]
- [[concepts/offline-first-invariants]] · [[concepts/explainability]] · [[concepts/silent-failure-pattern]]
- [[sources/shared-package]] · [[flows/voice-screening-journey]]
