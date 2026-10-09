# Clinical Protocols & Decision Support Rules

> **Audience:** Chief Medical Officers, Public Health Advisors, Clinical QA Evaluators, Frontend Developers  
> **Repository Context:** `C:\Andy projects\Asha`

---

## 1. Clinical Governance & Public Health Standards

The clinical decision support engine within **ASHA AI Copilot** is designed in accordance with the national operational guidelines mandated by the **Ministry of Health and Family Welfare (MoHFW), Government of India**, specifically:

- **NP-NCD Guidelines**: National Programme for Prevention & Control of Non-Communicable Diseases.
- **Ayushman Bharat - Health and Wellness Centres (AB-HWC)**: Operational Guidelines for Comprehensive Primary Health Care.
- **Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)**: High-risk pregnancy screening and referral protocols.

### The Safety Boundary
```
   [ Raw Spoken Consultation ]
               │
               ▼
   [ AI Speech Transcription & Needle 2 Extraction ]
               │
               ▼
 ┌─────────────────────────────────────────────────────────┐
 │ 🛑 CLINICAL SANITIZATION & DETERMINISTIC RULE ENGINE     │
 │ - Range verification against physiological human bounds │
 │ - Gender & demographic biological validation            │
 │ - Zero LLM clinical prioritization                      │
 │ - JSON-configurable rules with bilingual explanations   │
 └─────────────────────────────────────────────────────────┘
               │
               ▼
   [ Instant Triage Card & Actionable Referral Protocol ]
```

---

## 2. Non-Communicable Diseases (NCD) Protocol

- **Protocol Source:** [`packages/shared/src/protocols/ncd-demo.json`](file:///C:/Andy%20projects/Asha/packages/shared/src/protocols/ncd-demo.json)
- **Engine Implementation:** [`apps/mobile/services/rules/engine.ts`](file:///C:/Andy%20projects/Asha/apps/mobile/services/rules/engine.ts#L17-L194)

| Rule ID | Clinical Condition | Trigger Criteria | Priority | Required Frontline Action |
| :--- | :--- | :--- | :--- | :--- |
| `RULE_NCD_BP_CRITICAL` | Severe Hypertension Crisis (उच्च रक्तचाप गंभीर सीमा) | $\text{Systolic} \ge 180\text{ mmHg}$ OR $\text{Diastolic} \ge 110\text{ mmHg}$ | 🔴 **HIGH** | Immediate emergency referral to Primary Health Centre (PHC) / Community Health Centre (CHC) within 24 hours. Inform ANM immediately. |
| `RULE_NCD_BP_HIGH` | Elevated Blood Pressure Screening (रक्तचाप बढ़ा हुआ) | $\text{Systolic} \ge 140\text{ mmHg}$ OR $\text{Diastolic} \ge 90\text{ mmHg}$ | 🟠 **MEDIUM** | Advise patient to rest for 10 minutes and repeat reading. Counsel on low sodium diet; schedule re-visit in 7 days. |
| `RULE_NCD_GLUCOSE_HIGH` | Elevated Blood Glucose (ब्लड शुगर उच्च स्तर) | $\text{Random Blood Sugar} \ge 200\text{ mg/dL}$ | 🔴 **HIGH** | Schedule fasting blood glucose test at PHC. Counsel on dietary glycemic control and hydration. |
| `RULE_NCD_MED_MISSED` | Chronic Medication Interruption (दवा अनियमितता) | Known diagnosis of HTN/Diabetes AND $\text{medication\_adherence} = \text{false}$ | 🟠 **MEDIUM** | Investigate reason for interruption (stockout, side effects, cost); counsel on adherence; alert ANM. |
| `RULE_NCD_TOBACCO` | Tobacco Consumption (तम्बाकू सेवन) | $\text{tobacco\_use} = \text{true}$ (beedi, gutkha, khaini) | 🟡 **LOW** | Deliver 5A's tobacco cessation counseling (Ask, Advise, Assess, Assist, Arrange). |
| `RULE_NCD_MISSING_DATA` | Incomplete Vital Measurement (अधूरी जांच) | Missing BP or missing Blood Glucose reading | 🟡 **LOW** | Complete remaining tests or record specific reason for deferral in field register. |

---

## 3. Maternal Health & Gestational Danger Signs Protocol

- **Protocol Source:** [`packages/shared/src/protocols/pregnancy-demo.json`](file:///C:/Andy%20projects/Asha/packages/shared/src/protocols/pregnancy-demo.json)
- **Engine Implementation:** [`apps/mobile/services/rules/engine.ts`](file:///C:/Andy%20projects/Asha/apps/mobile/services/rules/engine.ts#L196-L336)

Pregnancy screening focuses on rapid detection of obstetrical danger signs during antenatal care (ANC) home visits:

| Rule ID | Danger Sign | Trigger Symptom | Priority | Referral Protocol |
| :--- | :--- | :--- | :--- | :--- |
| `RULE_PREG_BLEEDING` | Antepartum Haemorrhage (गर्भावस्था में रक्तस्राव) | Spoken vaginal bleeding report | 🔴 **HIGH** | **Immediate Emergency Hospitalization via 108/102 Ambulance.** Keep patient in left lateral tilt; monitor pulse. |
| `RULE_PREG_HEADACHE` | Suspected Pre-eclampsia Signs (गंभीर सिरदर्द / धुंधली दृष्टि) | Severe throbbing headache OR blurred/flashing vision | 🔴 **HIGH** | Immediate referral to First Referral Unit (FRU) for BP check and proteinuria evaluation. |
| `RULE_PREG_ABDOMINAL` | Severe Abdominal Pain (असहनीय पेट दर्द) | Intense, continuous or cramping pelvic pain | 🔴 **HIGH** | Urgent transfer to FRU. Rule out placental abruption or ectopic rupture. |
| `RULE_PREG_FETAL_MOVEMENT` | Reduced Fetal Movement (शिशु की हलचल में कमी) | Perceived drop in fetal kicks in 3rd trimester | 🔴 **HIGH** | Refer to PHC/CHC for immediate fetal heart sound auscultation and ultrasound Doppler. |
| `RULE_PREG_SWELLING` | Maternal Edema (हाथ/मुंह पर सूजन) | Facial puffiness, bilateral hand/foot edema | 🔴 **HIGH** | Check BP immediately. Refer to ANM/Medical Officer for pre-eclampsia workup. |
| `RULE_PREG_FEVER` | Persistent High Fever (गर्भावस्था में तेज बुखार) | High fever ($\ge 38.5^\circ\text{C}$ or $101.3^\circ\text{F}$) | 🟠 **MEDIUM** | Refer to PHC for malaria, dengue, and urinary tract infection (UTI) rapid diagnostic tests. |

---

## 4. "Why Was This Flagged?" Explainability Architecture

Frontline healthcare workers must understand *why* an alert was generated so they can communicate findings clearly to the patient and their family. The app does not display opaque error codes. Instead, every rule returns bilingual, context-interpolated narratives:

```typescript
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  priority: 'high' | 'medium' | 'low';
  reason: string;       // Formatted English rationale (for audits/supervisors)
  reason_hi: string;    // Clear Devanagari explanation (for frontline ASHA)
  nextWorkflow: string; // Actionable clinical referral instruction
  protocolSource: string;
}
```

### Example Interpolation in Practice:
For a patient with recorded BP of **165 / 105 mmHg**:
- **Bilingual Rationale Displayed:**
  - *Devanagari:* "रक्तचाप 165/105 mmHg उच्च है (सीमा 140/90 से अधिक)।"
  - *English:* "Blood pressure reading 165/105 mmHg exceeds stage 2 threshold (140/90 mmHg)."
- **Tactile Visual Presentation:**
  - High-priority cards feature an orange/amber border (`#D97706`), bold iconography, and an immediate **"Schedule 7-day Follow-up"** action chip.

---

## 5. Biological & Physiological Sanitization Bounds

Before any vitals reach the clinical decision trees, they must pass through [`packages/shared/src/validation.ts`](file:///C:/Andy%20projects/Asha/packages/shared/src/validation.ts):

```typescript
export const PHYSIOLOGICAL_RANGES = {
  bp_systolic: { min: 60, max: 280, unit: 'mmHg' },
  bp_diastolic: { min: 40, max: 180, unit: 'mmHg' },
  blood_glucose: { min: 30, max: 600, unit: 'mg/dL' },
  gestational_age_weeks: { min: 1, max: 44, unit: 'weeks' }
};
```

### Contradiction Detection
1. **Systolic vs Diastolic Inversion**: If an AI transcription transposes values (e.g., "BP 80 by 120"), the sanitizer catches $\text{systolic} \le \text{diastolic}$, flags `CONTRADICTION`, strips the inverted reading, and prompts the ASHA worker to re-measure.
2. **Biological Gender Conflict**: If a male patient record is screened under the `pregnancy` protocol, the engine flags `BIO_INVALID_GENDER` and rejects gestational symptom recording.

---

## 6. How to Extend & Add New Clinical Protocols

To add a new protocol (e.g., **Child Malnutrition & SAM/MAM** or **Tuberculosis Cough Screening**):

1. **Define Protocol JSON:**
   Create `packages/shared/src/protocols/tb-demo.json` with rule triggers, priority levels, and bilingual messages.
2. **Add Type Definitions:**
   Update `packages/shared/src/types.ts` with new clinical fields.
3. **Register in Rules Engine:**
   Add rules to `apps/mobile/services/rules/engine.ts` in the `evaluateRules()` loop.
4. **Run Verification Test:**
   ```powershell
   node tests/clinical_rules_test.js
   ```
   Add a unit test in `tests/clinical_rules_test.js` verifying positive and negative trigger cases.
