# Clinical Protocol Rules Specification

## Design Principle
Rules are **strictly deterministic TypeScript logic**. They do not allow free-form LLM hallucination or autonomous clinical diagnosing.

## Protocol Configurations
Stored externally in JSON files:
- `packages/shared/src/protocols/ncd-demo.json`:
  - `RULE_NCD_BP_HIGH`: Systolic >= 140 or Diastolic >= 90 mmHg (Medium Priority)
  - `RULE_NCD_BP_CRITICAL`: Systolic >= 180 or Diastolic >= 110 mmHg (High Priority, Urgent Referral)
  - `RULE_NCD_GLUCOSE_HIGH`: Random Glucose >= 200 mg/dL (High Priority)
  - `RULE_NCD_TOBACCO`: Active tobacco usage (Low Priority)
  - `RULE_NCD_MED_NON_ADHERENCE`: Missed chronic illness medication (Medium Priority)
  - `RULE_NCD_MISSING_DATA`: Incomplete screening readings (Low Priority)

- `packages/shared/src/protocols/pregnancy-demo.json`:
  - `RULE_MATERNAL_BLEEDING`: Vaginal bleeding reported (High Priority, Emergency Transit)
  - `RULE_MATERNAL_PREECLAMPSIA`: Severe headache / blurred vision (High Priority)
  - `RULE_MATERNAL_ABDOMINAL_PAIN`: Severe abdominal pain (High Priority)
  - `RULE_MATERNAL_FETAL_MOVEMENT`: Reduced fetal movements (High Priority)
  - `RULE_MATERNAL_EDEMA_BP`: Facial/hand edema combined with high BP (High Priority)
  - `RULE_MATERNAL_FEVER`: Persistent high fever (Medium Priority)

## Explainability ("Why Was This Flagged?")
Every rule output provides:
1. Rule Name & ID
2. Priority level badge (`high`, `medium`, `low`)
3. Bilingual reason (Hindi & English)
4. Source protocol citation
5. Recommended next workflow action
