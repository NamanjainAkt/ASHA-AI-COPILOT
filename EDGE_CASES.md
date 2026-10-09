# ASHA AI Copilot — Clinical Edge Cases & Safety Guards

Offline-first Hindi voice-enabled AI copilot for frontline ASHA community healthcare workers.

This document catalogues the clinical, linguistic, and physiological edge cases handled by the system, along with the defensive architectures that prevent unsafe clinical actions, silent failures, or AI hallucinations.

Automated verification harness: [`tests/edge_cases_test.js`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/tests/edge_cases_test.js) (15/15 checks green).

---

## 1. Summary of Edge Case Categories

```text
                                  [ CLINICAL INPUT ]
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
   [ Category 1: Vitals ]     [ Category 2: NLP/Speech ]    [ Category 3: Maternal ]
   • Extreme/Implausible BP    • Multiple Denials/Negations  • Male Pregnancy Contradiction
   • Inverted (Sys < Dia)      • Devanagari Numerals (०-९)   • Fetal Movement (< 24w Guard)
   • Glucose > 600 mg/dL       • Spoken Word Numbers         • Missing Gestational Age
   • Boundary Transitions      • Hinglish Stopped Medicine   • Edema vs Pre-eclampsia
```

| Category | Primary Subsystem | Goal / Failure Mode Prevented |
| :--- | :--- | :--- |
| **1. Physiological Boundaries & Implausible Vitals** | [`validation.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/validation.ts), [`engine.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/engine.ts) | Prevents corrupted or sensor-glitched vitals from escalating to false hypertensive crisis or false critical triage. |
| **2. Multilingual NLP & Negation Edges** | [`multilingualExtractor.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/nlp/multilingualExtractor.ts), [`numberNormalizer.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/nlp/numberNormalizer.ts) | Prevents inverted symptom detection from double negations; normalizes spoken numbers and Devanagari script. |
| **3. Maternal & Obstetric Clinical Protocols** | [`engine.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/engine.ts), [`pregnancy-demo.json`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/protocols/pregnancy-demo.json) | Prevents premature fetal movement alerts, fabrications of gestational age, and unclassified pre-eclampsia risks. |
| **4. Missing Data & Anti-Hallucination Guards** | [`engine.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/engine.ts), [`aiOrchestrator.ts`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/apps/mobile/services/ai/aiOrchestrator.ts) | Prevents models from fabricating medication prescriptions, diagnoses, or `null`/`undefined` leaks in summaries. |

---

## 2. Detailed Edge Case Catalogue

### Category 1: Physiological Boundaries & Implausible Vitals

#### EDGE-01: Extreme Implausible Systolic BP
* **Test ID:** `EDGE-01`
* **Input Condition:** `bp_systolic: 280 mmHg`, `bp_diastolic: 170 mmHg`.
* **Clinical Context:** Vitals exceeding 260/160 mmHg are physically implausible for ambulatory community screening and typically represent misread equipment or corrupted inputs.
* **Expected Behavior:**
  * [`validateScreeningData()`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/validation.ts#L68-L94) flags `OUT_OF_RANGE` and sets `field_status['bp_systolic'] = 'uncertain'`.
  * [`evaluateRules()`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/engine.ts#L380-L390) suppresses false `RULE_NCD_BP_CRITICAL` triage escalation.
  * Raises `RULE_NCD_BP_UNCERTAIN` (Medium priority), directing the worker to check the sphygmomanometer cuff and re-measure.
* **Failure Mode Prevented:** Avoids sending an emergency ambulance for a cuff measurement artifact while failing to verify the patient's actual pressure.

#### EDGE-02: Physiologically Inverted Blood Pressure
* **Test ID:** `EDGE-02`
* **Input Condition:** `bp_systolic: 80 mmHg`, `bp_diastolic: 120 mmHg` (Systolic $\le$ Diastolic).
* **Clinical Context:** Arterial pressure during cardiac contraction (systole) is always higher than resting pressure (diastole). A reading where systolic $\le$ diastolic is physiologically impossible.
* **Expected Behavior:**
  * [`validateScreeningData()`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/validation.ts#L101-L116) flags `CONTRADICTION: Systolic BP must be greater than diastolic BP`.
  * Both fields are sanitized to `null` with `field_status['blood_pressure'] = 'uncertain'`.
  * The rule engine prompts for re-measurement rather than evaluating inverted values.
* **Failure Mode Prevented:** Prevents inverted numbers from tricking the rule engine into evaluating diastolic as systolic.

#### EDGE-03: Implausible Blood Glucose Out of Range
* **Test ID:** `EDGE-03`
* **Input Condition:** `blood_glucose: 680 mg/dL` (or $< 30 \text{ mg/dL}$).
* **Clinical Context:** Field glucometer strips are generally calibrated up to 600 mg/dL. Values $> 600$ require laboratory venous testing or a fresh strip check.
* **Expected Behavior:**
  * Marked `OUT_OF_RANGE` and sanitized to `null`.
  * Rule engine triggers `RULE_NCD_GLUCOSE_UNCERTAIN` ("ब्लड शुगर का मान असामान्य सीमा में दर्ज हुआ। नई स्ट्रिप से पुनः जांचें।").
* **Failure Mode Prevented:** Prevents errant strip errors from causing improper emergency referrals before re-testing.

#### EDGE-04: Exact BP Threshold Boundary Transitions
* **Test ID:** `EDGE-04`
* **Input Conditions:**
  1. `139/89 mmHg`: Just below Stage 1 threshold.
  2. `140/90 mmHg`: Exact community screening threshold for Stage 1.
  3. `180/110 mmHg`: Exact Hypertensive Crisis threshold.
* **Expected Behavior:**
  * `139/89`: Remains normal / prehypertension (does not trigger elevated rule).
  * `140/90`: Triggers `RULE_NCD_BP_HIGH` (Medium priority, 7-day follow-up).
  * `180/110`: Triggers `RULE_NCD_BP_CRITICAL` (High priority, urgent same-day PHC referral).
* **Failure Mode Prevented:** Off-by-one boundary errors in comparison operators (`>=` vs `>`).

#### EDGE-05: Fasting vs Random Glucose Threshold Disambiguation
* **Test ID:** `EDGE-05`
* **Input Condition:** `blood_glucose: 130 mg/dL` tested under both sample types.
* **Clinical Context:** The threshold for elevated glucose depends heavily on whether the patient was fasting:
  * Fasting threshold: $\ge 126 \text{ mg/dL}$
  * Random threshold: $\ge 200 \text{ mg/dL}$
* **Expected Behavior:**
  * When `sample_type = 'random'`: `130 mg/dL` does NOT trigger `RULE_NCD_GLUCOSE_HIGH`.
  * When `sample_type = 'fasting'`: `130 mg/dL` DOES trigger `RULE_NCD_GLUCOSE_HIGH` (High priority).
* **Failure Mode Prevented:** Misclassifying normal post-meal glucose as diabetes, or missing early fasting hyperglycemia.

---

### Category 2: Multilingual NLP Extraction & Negation Edges

#### EDGE-06: Multiple Symptom Denials & Bidirectional Negations
* **Test ID:** `EDGE-06`
* **Input Transcript:** *"मरीज को कोई सिरदर्द नहीं है, उल्टी बिल्कुल नहीं आ रही, और चक्कर भी नहीं हैं। बीपी 130/85 है।"*
* **Linguistic Challenge:** Frontline workers frequently report negative findings using mixed particles (*"कोई नहीं"*, *"बिल्कुल नहीं"*, *"भी नहीं"*).
* **Expected Behavior:**
  * [`isNegated()`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/nlp/multilingualExtractor.ts#L18-L34) checks bidirectional windows (before and after) for Hindi and English negation particles.
  * Extracted symptoms list remains empty (`symptoms: []`).
* **Failure Mode Prevented:** Keyword extractors matching `"सिरदर्द"` or `"चक्कर"` out of context and incorrectly flagging the patient with symptoms they explicitly denied.

#### EDGE-07: Pure Devanagari Script Numerals
* **Test ID:** `EDGE-07`
* **Input Transcript:** *"रक्तचाप १६० बटा ९५ आया और शुगर २४० दर्ज की गई।"*
* **Linguistic Challenge:** Transcriptions from Hindi ASR or typed notes often contain Devanagari digits (`०, १, २, ३, ४, ५, ६, ७, ८, ९`).
* **Expected Behavior:**
  * [`normalizeClinicalNumbers()`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/nlp/numberNormalizer.ts) maps Devanagari numerals to standard digits before regex parsing.
  * Extracted: `bp_systolic: 160`, `bp_diastolic: 95`, `blood_glucose: 240`.
* **Failure Mode Prevented:** Total failure to parse vitals when recorded in Hindi script.

#### EDGE-08: Spoken Hindi Word Numbers
* **Test ID:** `EDGE-08`
* **Input Transcript:** *"बीपी एक सौ सत्तर बटा एक सौ पांच है, शुगर एक सौ अस्सी है"*
* **Linguistic Challenge:** Spoken consultations use compound Hindi words rather than digits (e.g. *"एक सौ सत्तर"* = 170, *"एक सौ पांच"* = 105, *"एक सौ अस्सी"* = 180).
* **Expected Behavior:**
  * The number normalizer transforms Hindi number phrases into Arabic numerals.
  * Extracted: `bp_systolic: 170`, `bp_diastolic: 105`, `blood_glucose: 180`.
* **Failure Mode Prevented:** Missing spoken vitals when the speech-to-text engine emits word forms instead of digits.

#### EDGE-09: Hinglish Colloquial Numbers & Stopped Medication
* **Test ID:** `EDGE-09`
* **Input Transcript:** *"BP 155 by 92 hai aur sugar 210 hai, patient ne 5 din se dawa band kar di hai"*
* **Linguistic Challenge:** Mix of English BP terms with Hindi colloquialisms (*"dawa band kar di"*).
* **Expected Behavior:**
  * Extracted: `bp_systolic: 155`, `bp_diastolic: 92`, `blood_glucose: 210`.
  * Adherence is flagged as `medication_adherence: false`.
  * Triggers `RULE_NCD_MED_NON_ADHERENCE` (Medium priority).
* **Failure Mode Prevented:** Failing to detect treatment non-compliance expressed colloquially.

---

### Category 3: Maternal & Obstetric Clinical Protocols

#### EDGE-10: Biological Contradiction (Pregnancy on Male Patient)
* **Test ID:** `EDGE-10`
* **Input Condition:** `patient.sex = 'male'`, `screening_type = 'pregnancy'`.
* **Expected Behavior:**
  * [`validateScreeningData()`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/validation.ts#L141-L149) flags `CONTRADICTION: Pregnancy screening recorded for male patient`.
  * Prevents committing corrupted demographic data to the clinical register.
* **Failure Mode Prevented:** Corrupting the ASHA maternal registry with misattributed patient IDs.

#### EDGE-11: Early Gestational Age Fetal Movement Guard (< 24 weeks)
* **Test ID:** `EDGE-11`
* **Input Conditions:**
  * Case A: `gestational_age_weeks = 16`, `reduced_fetal_movement = true`.
  * Case B: `gestational_age_weeks = 32`, `reduced_fetal_movement = true`.
* **Clinical Context:** Fetal movements (quickening) are typically not consistently felt or clinically monitored for movement reduction prior to 24 weeks of gestation.
* **Expected Behavior:**
  * At `16 weeks`: `RULE_MATERNAL_FETAL_MOVEMENT` is **suppressed** ([`engine.ts:283`](file:///d:/ASHA%20AI%20COPILOT/ASHA-AI-COPILOT/packages/shared/src/engine.ts#L283)).
  * At `32 weeks`: `RULE_MATERNAL_FETAL_MOVEMENT` triggers **High priority** with urgent ultrasound recommendation.
* **Failure Mode Prevented:** Generating false obstetric emergency panic in early second-trimester pregnancies.

#### EDGE-12: Unspecified Gestational Age (No 28-Week Fabrication)
* **Test ID:** `EDGE-12`
* **Input Transcript:** *"गर्भवती महिला को सिरदर्द की शिकायत है, बीपी 120/80 है"* (No week specified).
* **Defensive Rule:** Legacy systems often hardcoded an arbitrary fallback default (e.g. 28 weeks). Our implementation strictly assigns `null` when unspecified.
* **Expected Behavior:**
  * `gestational_age_weeks` is `undefined`.
  * Triggers advisory `RULE_PREG_MISSING_DATA` ("गर्भकालीन सप्ताह दर्ज नहीं है। कृपया एमसीपी कार्ड से जांचें।").
* **Failure Mode Prevented:** Fabricating medical history for pregnant mothers.

#### EDGE-13: Maternal Edema Disambiguation with Blood Pressure
* **Test ID:** `EDGE-13`
* **Input Conditions:**
  * Case A: Pedal edema with normal BP (`115/75 mmHg`).
  * Case B: Pedal edema with elevated BP (`150/100 mmHg`).
* **Clinical Context:** Mild pedal edema is common in late pregnancy. However, edema accompanied by elevated blood pressure is a hallmark sign of **Pre-eclampsia**.
* **Expected Behavior:**
  * Case A (Normal BP + Swelling): Evaluated as Low priority (`Maternal Edema - सामान्य रक्तचाप`, advising leg elevation and rest).
  * Case B (High BP + Swelling): Evaluated as High priority (`RULE_MATERNAL_EDEMA_BP` - High-Risk Pregnancy tracking required).
* **Failure Mode Prevented:** Over-triaging benign physiological swelling or under-triaging pre-eclampsia.

---

### Category 4: Missing Data & Anti-Hallucination Guards

#### EDGE-14: Completely Empty / Missing Vitals Handling
* **Test ID:** `EDGE-14`
* **Input Condition:** `ncd: { bp_systolic: null, bp_diastolic: null, blood_glucose: null }`.
* **Expected Behavior:**
  * Triggers `RULE_NCD_MISSING_DATA` (Low priority).
  * Never manufactures fake priority or false alarm flags.
* **Failure Mode Prevented:** Generating hallucinated risk scores on blank records.

#### EDGE-15: Compounding Multiple Maternal Danger Signs
* **Test ID:** `EDGE-15`
* **Input Condition:** Maternal patient with vaginal bleeding + severe abdominal pain + high fever.
* **Expected Behavior:**
  * Each danger sign triggers independently (`RULE_MATERNAL_BLEEDING` [High], `RULE_MATERNAL_ABDOMINAL_PAIN` [High], `RULE_MATERNAL_FEVER` [Medium]).
  * Triage sorting ensures High priority rules appear first in the clinical summary and referral queue.
* **Failure Mode Prevented:** Masking secondary danger signs when multiple critical symptoms coexist.

---

## 3. Running the Edge Case Test Suite

To execute the automated edge cases suite across all 15 scenarios:

```powershell
node tests/edge_cases_test.js
```

### Verification Output:
```text
================================================================
       ASHA AI COPILOT: COMPREHENSIVE EDGE CASE TEST SUITE      
   Auditing: Clinical Safety, Boundaries, Negations & Guards    
================================================================

✓ [PASS] EDGE-01: Extreme Implausible Systolic BP (280/170 mmHg)
✓ [PASS] EDGE-02: Physiologically Inverted BP (Systolic < Diastolic: 80/120 mmHg)
✓ [PASS] EDGE-03: Implausible Blood Glucose Out of Range (> 600 mg/dL)
✓ [PASS] EDGE-04: Exact BP Threshold Boundary Transitions (139/89 vs 140/90 vs 180/110)
✓ [PASS] EDGE-05: Fasting vs Random Glucose Threshold Disambiguation
✓ [PASS] EDGE-06: Multiple Symptom Denials & Bidirectional Negations
✓ [PASS] EDGE-07: Pure Devanagari Script Numerals (१६० बटा ९५, २४० mg/dL)
✓ [PASS] EDGE-08: Spoken Hindi Word Numbers ("एक सौ सत्तर बटा एक सौ पांच")
✓ [PASS] EDGE-09: Hinglish Colloquial Numbers & Negated Adherence ("dawa band kar di")
✓ [PASS] EDGE-10: Biological Contradiction: Pregnancy on Male Patient
✓ [PASS] EDGE-11: Early Gestational Age Fetal Movement Guard (< 24 weeks)
✓ [PASS] EDGE-12: Unspecified Gestational Age (No 28-Week Fabrication)
✓ [PASS] EDGE-13: Maternal Edema Disambiguation with BP (Isolated vs Pre-eclampsia)
✓ [PASS] EDGE-14: Completely Empty / Missing Vitals Handling
✓ [PASS] EDGE-15: Multiple Compounding Maternal Danger Signs (Bleeding + Pain + Fever)

================================================================
EDGE CASE TEST RESULTS: 15 / 15 PASSED (100%)
================================================================
```
