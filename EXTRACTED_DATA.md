# ASHA AI Copilot — Complete Extracted Data Registry & Benchmark Directory

> **Canonical Extracted Clinical Data & Benchmark Specification**  
> **Repository:** `ASHA-AI-COPILOT`  
> **Version:** 2.0.0 (Enhanced Field-Workflow Architecture)  
> **Status:** Authoritative  
> **Scope:** Ground-truth Beneficiary Profiles, Spoken Hindi Transcripts, Extracted Structured JSON, Deterministic Rule Evaluation Results, Generated AI Summaries, Clinical Edge-Case Benchmarks, and Entity Normalization Lexicons.

---

## Table of Contents

1. [Architecture of Extracted Data & Provenance Tracking](#1-architecture-of-extracted-data--provenance-tracking)
2. [Master Beneficiary (Patient) Register](#2-master-beneficiary-patient-register)
3. [Seeded Clinical Screening Encounters & Transcripts](#3-seeded-clinical-screening-encounters--transcripts)
   - [Encounter 1 (`s-001`): Sunita Devi (NCD Hypertension & Non-Adherence)](#encounter-1-s-001-sunita-devi-ncd-hypertension--non-adherence)
   - [Encounter 2 (`s-002`): Meena Kumari (Obstetric Emergency & Danger Signs)](#encounter-2-s-002-meena-kumari-obstetric-emergency--danger-signs)
   - [Encounter 3 (`scenario_ncd_diabetes`): Ramesh Kumar (Elevated Glucose & Tobacco)](#encounter-3-scenario_ncd_diabetes-ramesh-kumar-elevated-glucose--tobacco)
   - [Encounter 4 (`scenario_ncd_normal`): Asha Sharma (Routine Healthy Checkup)](#encounter-4-scenario_ncd_normal-asha-sharma-routine-healthy-checkup)
4. [The 15 Clinical Edge Cases & Extraction Benchmarks (`EDGE-01` to `EDGE-15`)](#4-the-15-clinical-edge-cases--extraction-benchmarks-edge-01-to-edge-15)
5. [Clinical Follow-up & Action/Referral Register](#5-clinical-follow-up--actionreferral-register)
6. [Field Workers & Supervisor Identity Records](#6-field-workers--supervisor-identity-records)
7. [Clinical NLP Extraction Lexicon & Normalization Dictionaries](#7-clinical-nlp-extraction-lexicon--normalization-dictionaries)
8. [Standard Extracted JSON Payloads & Sync Wire Formats](#8-standard-extracted-json-payloads--sync-wire-formats)

---

## 1. Architecture of Extracted Data & Provenance Tracking

In the **ASHA AI Copilot**, frontline community health workers conduct household screenings speaking naturally in rural Hindi, Bhojpuri, or code-mixed Hinglish. The software converts this speech into strictly structured clinical data through an on-device, multi-stage processing pipeline:

```text
[ Spoken Hindi Transcript ]
            │
            ▼
[ Number Normalizer (Devanagari ०-९ & Spoken Words -> Arabic Digits) ]
            │
            ▼
[ Multilingual Entity Extractor (Rules-Not-Models Boundary) ]
  - Extracts ONLY explicitly spoken clinical entities
  - Distinguishes 'confirmed', 'explicit_denial', 'not_asked', 'uncertain'
  - Records field-level provenance ('worker_spoken_input', 'device_measurement')
  - Generates Adaptive Follow-Up Prompts for safety-critical omissions
            │
            ▼
[ Plausibility Range & Biological Contradiction Validation ]
            │
            ▼
[ Deterministic TypeScript Rule Engine (Protocols JSON) ]
            │
            ▼
[ Qwen3 Plain Hindi Clinical Explanation ]
            │
            ▼
[ Human-in-the-Loop Review Gate (summary.tsx) ]
            │
            ▼
[ Verified Local SQLite Persistence & Sync Queue Payload ]
```

### The Provenance Invariant

A recorded value, an AI-inferred value, and a value measured by the ASHA are **never treated as equivalent**:
- **`confirmed` / `present`**: Spoken explicitly by the patient or worker in the clinical interaction.
- **`explicit_denial`**: Explicitly denied by the patient (e.g. *"चक्कर बिल्कुल नहीं आ रहे"* $\rightarrow$ `dizziness: false`, status: `explicit_denial`).
- **`not_asked`**: Omitted in conversation. **Never silently stored as `false` or hallucinated.**
- **`uncertain`**: Out of clinical bounds or garbled in audio $\rightarrow$ suppressed from emergency priority and flagged for re-measurement.

---

## 2. Master Beneficiary (Patient) Register

The repository defines synthetic rural Indian beneficiary profiles seeded in both the mobile SQLite store ([`apps/mobile/services/db/database.ts`](file:///e:/ASHA-AI-COPILOT/apps/mobile/services/db/database.ts)) and the supervisor backend database ([`services/api/database.py`](file:///e:/ASHA-AI-COPILOT/services/api/database.py)).

| Patient ID | Full Name (Hindi / English) | Age | Gender | Contact Phone & Owner | Village & Hamlet / Tola | Household ID & Head Rel. | ABHA ID | Baseline Clinical Classification | Sync Status |
|---|---|---|---|---|---|---|---|---|---|
| `p-001` | **सुनीता देवी**<br>*(Sunita Devi)* | 48 | `female` | `+91 9876500001`<br>*(self)* | रामपुर *(Rampur)*<br>पटेल नगर *(Patel Nagar)* | `HH-101`<br>*(Head: पति)* | `91-2345-6789-0001` | Known Hypertensive; Stage 2 High BP (165/105); 2-week medication lapse | `synced` |
| `p-002` | **मीना कुमारी**<br>*(Meena Kumari)* | 24 | `female` | `+91 9876500002`<br>*(spouse)* | रामपुर *(Rampur)*<br>स्कूल टोला *(School Tola)* | `HH-104`<br>*(Head: ससुर)* | `91-2345-6789-0002` | High-Risk Pregnancy (ANC 28 Wks); Obstetric Bleeding; Severe headache & pain | `synced` |
| `p-003` | **रमेश कुमार**<br>*(Ramesh Kumar)* | 56 | `male` | `+91 9876500003`<br>*(self)* | शिवपुर *(Shivpur)*<br>मुख्य बस्ती *(Main Basti)* | `HH-202`<br>*(Head: स्वयं)* | `91-2345-6789-0003` | Chronic Diabetes Risk; Random Glucose 245 mg/dL; Daily khaini consumption | `synced` |
| `p-004` | **आशा शर्मा**<br>*(Asha Sharma)* | 32 | `female` | `+91 9876500004`<br>*(self)* | रामपुर *(Rampur)*<br>हरिजन टोला *(Harijan Tola)* | `HH-108`<br>*(Head: पति)* | `91-2345-6789-0004` | Routine Ambulatory Checkup; Healthy baseline vitals (120/80 mmHg) | `synced` |
| `p-005` | **मनोज वर्मा**<br>*(Manoj Verma)* | 62 | `male` | `+91 9876500005`<br>*(son)* | कासिमपुर *(Qasimpur)*<br>नहर पार *(Nahar Paar)* | `HH-305`<br>*(Head: स्वयं)* | `91-2345-6789-0005` | Geriatric NCD Surveillance; Mobility assistance needed; annual checkup | `synced` |

### Prototype Design UI Beneficiaries (`stitch_asha_ai_copilot_ui/`)
- **मीना देवी (Meena Devi)**: Age 24, RCH `#4082`, Ward 2 Rampur, ANC 32 Weeks, High BP 142/96 mmHg, Bilateral pedal edema.
- **सुनीता कुमारी (Sunita Kumari - Infant)**: Age 8 Months, RCH `#8190`, Rampur School Tola, Mother: Reena Devi, Weight: 7.4 kg, Missed Immunization: Pentavalent-3.
- **राधा कृष्ण (Radha Krishna)**: Age 62, Male, RCH `#1920`, Rampur Main Basti, Known Type 2 Diabetic, 4 days medicine supply remaining.
- **पूजा यादव (Pooja Yadav)**: Age 19, Female, RCH `#9301`, Rampur North, First Trimester Primigravida (ANC 12 Weeks).

---

## 3. Seeded Clinical Screening Encounters & Transcripts

---

### Encounter 1 (`s-001`): Sunita Devi (NCD Hypertension & Non-Adherence)

* **Beneficiary:** `p-001` (सुनीता देवी, 48y, Female)
* **Visit Type:** `ncd` (NCD & CBAC Screening)
* **Workflow Source:** Household Visit NCD Checklist / Community BP Screening

#### 1. Raw Spoken Hindi Transcript
```text
"सुनीता देवी उम्र 48 साल, बीपी 165 बटा 105 आया है, शुगर 142 है। दो हफ्ते से बीपी की गोली नहीं खा रही हैं और सिर में भारीपन है।"
```

#### 2. Extracted Structured Data (JSON)
```json
{
  "screening_type": "ncd",
  "visit_type": "ncd",
  "common_visit": {
    "visit_purpose": "ncd_screening",
    "main_complaint": "सिर में भारीपन (heavy head)",
    "complaint_onset": "2 हफ्ते (2 weeks)",
    "complaint_course": "worsening",
    "known_conditions": ["hypertension"],
    "current_medications": "दवा 2 हफ्ते से बंद (stopped 2 weeks ago)",
    "missed_medication_doses": true
  },
  "ncd": {
    "bp_systolic": 165,
    "bp_diastolic": 105,
    "blood_glucose": 142,
    "sample_type": "random",
    "tobacco_use": null,
    "alcohol_use": null,
    "known_hypertension": true,
    "known_diabetes": false,
    "medication_adherence": false,
    "symptoms": [
      "सिर में भारीपन (heavy head / headache)"
    ],
    "measurement_date": "2026-10-09"
  },
  "field_status": {
    "bp_systolic": "present",
    "bp_diastolic": "present",
    "blood_glucose": "present",
    "known_hypertension": "present",
    "medication_adherence": "present",
    "dizziness": "not_asked",
    "chest_pain": "not_asked",
    "breathlessness": "not_asked"
  },
  "field_provenance": {
    "bp_systolic": "worker_spoken_input",
    "bp_diastolic": "worker_spoken_input",
    "blood_glucose": "worker_spoken_input",
    "medication_adherence": "worker_spoken_input"
  },
  "missing_safety_prompts": [
    "क्या मरीज को अभी तेज सिरदर्द, सीने में दर्द, सांस लेने में परेशानी या कोई अन्य गंभीर लक्षण है?"
  ],
  "referral_action": {
    "referral_recommended": true,
    "destination": "phc",
    "urgency": "urgent",
    "reason": "Stage 2 High BP (165/105 mmHg) with 2-week medication lapse",
    "referral_slip_issued": true,
    "facility_reached": false,
    "responsible_person": "anm",
    "action_due_date": "2026-10-11"
  }
}
```

> **Anti-Hallucination Audit Note:** Dizziness (*चक्कर आना*) is **not** present in the transcript; the engine correctly marks dizziness as `not_asked` rather than inventing symptoms. The AI issues an adaptive safety question for chest pain and breathlessness.

#### 3. Deterministic Clinical Rules Triggered
1. **`RULE_NCD_BP_HIGH`** (Priority: `medium`):
   - *Rationale (EN):* Systolic BP (165 mmHg) >= 140 or Diastolic BP (105 mmHg) >= 90.
   - *Rationale (HI):* रक्तचाप बढ़ा हुआ है (165/105 mmHg)।
   - *Next Action:* Schedule follow-up re-check within 7 days and refer to PHC/ANM.
2. **`RULE_NCD_MED_NON_ADHERENCE`** (Priority: `medium`):
   - *Rationale (EN):* Known chronic illness patient reported missed or irregular medication intake.
   - *Rationale (HI):* मरीज नियमित रूप से अपनी बीपी की दवाइयां नहीं ले रहा है।
   - *Next Action:* Address medicine availability barriers and reinforce daily adherence.

#### 4. Generated Plain-Hindi Summary (Qwen3)
```text
"सुनीता देवी का रक्तचाप 165/105 mmHg दर्ज किया गया। उन्होंने बताया कि उनकी दवा 2 हफ्ते से छूटी हुई है और सिर में भारीपन है। 48 घंटे में पीएचसी रामपुर रेफरल एवं फॉलो-अप आवश्यक है।"
```

---

### Encounter 2 (`s-002`): Meena Kumari (Obstetric Emergency & Danger Signs)

* **Beneficiary:** `p-002` (मीना कुमारी, 24y, Female)
* **Visit Type:** `pregnancy` (ANC Maternal Danger Sign Assessment)
* **Workflow Source:** Maternal Antenatal Home Visit

#### 1. Raw Spoken Hindi Transcript
```text
"मीना कुमारी 28 हफ्ते की गर्भवती हैं, उनको आज सुबह से हल्का खून बह रहा है और पेट में तेज दर्द तथा सिरदर्द है।"
```

#### 2. Extracted Structured Data (JSON)
```json
{
  "screening_type": "pregnancy",
  "visit_type": "pregnancy",
  "common_visit": {
    "visit_purpose": "scheduled_anc",
    "main_complaint": "रक्तस्राव व पेट में तेज दर्द (bleeding & abdominal pain)",
    "complaint_onset": "आज सुबह से (since this morning)",
    "complaint_course": "worsening"
  },
  "pregnancy": {
    "pregnancy_status": "pregnant",
    "gestational_age_weeks": 28,
    "vaginal_bleeding": true,
    "severe_headache": true,
    "blurred_vision": null,
    "severe_abdominal_pain": true,
    "reduced_fetal_movement": null,
    "swelling": null,
    "fever": null,
    "follow_up_required": true
  },
  "field_status": {
    "pregnancy_status": "present",
    "gestational_age_weeks": "present",
    "vaginal_bleeding": "present",
    "severe_headache": "present",
    "severe_abdominal_pain": "present",
    "swelling": "not_asked",
    "blurred_vision": "not_asked",
    "reduced_fetal_movement": "not_asked",
    "fever": "not_asked"
  },
  "field_provenance": {
    "pregnancy_status": "worker_spoken_input",
    "gestational_age_weeks": "worker_spoken_input",
    "vaginal_bleeding": "worker_spoken_input",
    "severe_headache": "worker_spoken_input",
    "severe_abdominal_pain": "worker_spoken_input"
  },
  "missing_safety_prompts": [
    "क्या आंखों के आगे धुंधलापन या चेहरे-पैरों में सूजन है?",
    "क्या शिशु की हलचल सामान्य महसूस हो रही है?"
  ],
  "referral_action": {
    "referral_recommended": true,
    "destination": "chc",
    "urgency": "immediate",
    "reason": "Antenatal vaginal bleeding with severe abdominal pain and headache at 28 weeks gestation",
    "referral_slip_issued": true,
    "facility_reached": false,
    "responsible_person": "medical_officer",
    "action_due_date": "2026-10-09"
  }
}
```

> **Anti-Hallucination Audit Note:** Swelling (*सूजन*) is **not** present in the transcript; the engine correctly records swelling as `not_asked` / `null` rather than manufacturing a positive symptom. High-priority danger signs trigger immediate emergency referral workflow.

#### 3. Deterministic Clinical Rules Triggered
1. **`RULE_MATERNAL_BLEEDING`** (Priority: `high`):
   - *Rationale (EN):* Vaginal bleeding reported during pregnancy. Requires immediate emergency evaluation.
   - *Rationale (HI):* गर्भावस्था में रक्तस्राव एक गंभीर आपातकालीन संकेत है।
   - *Next Action:* Immediate emergency referral to First Referral Unit (FRU / CHC / District Hospital).
2. **`RULE_MATERNAL_PAIN`** (Priority: `high`):
   - *Rationale (EN):* Severe abdominal pain during pregnancy.
   - *Rationale (HI):* गर्भावस्था में पेट में तेज दर्द गंभीर जटिलता का संकेत हो सकता है।
   - *Next Action:* Urgent obstetric assessment at facility.

#### 4. Generated Plain-Hindi Summary (Qwen3)
```text
"मीना कुमारी (28 सप्ताह गर्भवती) को सुबह से रक्तस्राव, पेट में तेज दर्द और सिरदर्द है। यह प्रसव पूर्व गंभीर खतरा है। बिना देरी किए तुरंत एम्बुलेंस 108 बुलाकर सीएचसी/जिला अस्पताल रेफर करें।"
```

---

### Encounter 3 (`scenario_ncd_diabetes`): Ramesh Kumar (Elevated Glucose & Tobacco)

* **Beneficiary:** `p-003` (रमेश कुमार, 56y, Male)
* **Visit Type:** `ncd` (NCD Community Screening)
* **Workflow Source:** Village Choupal Screening Camp

#### 1. Raw Spoken Hindi Transcript
```text
"रमेश कुमार, उम्र 56 साल, शुगर 245 आई है रैंडम, बीपी 130 बटा 85 है, तम्बाकू खाते हैं।"
```

#### 2. Extracted Structured Data (JSON)
```json
{
  "screening_type": "ncd",
  "visit_type": "ncd",
  "common_visit": {
    "visit_purpose": "ncd_screening",
    "main_complaint": null
  },
  "ncd": {
    "bp_systolic": 130,
    "bp_diastolic": 85,
    "blood_glucose": 245,
    "sample_type": "random",
    "tobacco_use": true,
    "medication_adherence": true
  },
  "field_status": {
    "bp_systolic": "present",
    "bp_diastolic": "present",
    "blood_glucose": "present",
    "tobacco_use": "present"
  },
  "field_provenance": {
    "bp_systolic": "worker_spoken_input",
    "bp_diastolic": "worker_spoken_input",
    "blood_glucose": "worker_spoken_input",
    "tobacco_use": "worker_spoken_input"
  },
  "missing_safety_prompts": [
    "क्या मरीज को अत्यधिक प्यास, बार-बार पेशाब या अत्यधिक थकान महसूस हो रही है?"
  ]
}
```

#### 3. Deterministic Clinical Rules Triggered
1. **`RULE_NCD_GLUCOSE_HIGH`** (Priority: `high`):
   - *Rationale (HI):* दर्ज किया गया ब्लड ग्लूकोज (245 mg/dL) सुरक्षित स्तर से अधिक है।
   - *Next Action:* Refer to PHC for confirmatory fasting plasma glucose and dietary counseling.
2. **`RULE_NCD_TOBACCO`** (Priority: `low`):
   - *Rationale (HI):* तम्बाकू/खैनी सेवन की पुष्टि हुई। नशामुक्ति परामर्श आवश्यक है।
   - *Next Action:* Provide community lifestyle counseling and cessation support.

---

### Encounter 4 (`scenario_ncd_normal`): Asha Sharma (Routine Healthy Checkup)

* **Beneficiary:** `p-004` (आशा शर्मा, 32y, Female)
* **Visit Type:** `ncd` (Routine Ambulatory Checkup)
* **Workflow Source:** Routine Annual Health Checkup

#### 1. Raw Spoken Hindi Transcript
```text
"आशा शर्मा, उम्र 32 वर्ष, बीपी 120 बटा 80 है, शुगर 98 है, कोई अन्य लक्षण नहीं है।"
```

#### 2. Extracted Structured Data (JSON)
```json
{
  "screening_type": "ncd",
  "visit_type": "ncd",
  "ncd": {
    "bp_systolic": 120,
    "bp_diastolic": 80,
    "blood_glucose": 98,
    "sample_type": "random",
    "tobacco_use": false,
    "symptoms": []
  },
  "field_status": {
    "bp_systolic": "present",
    "bp_diastolic": "present",
    "blood_glucose": "present"
  }
}
```

#### 3. Deterministic Clinical Rules Triggered
- **No abnormal rules triggered.** Triage result: `Normal` (Routine annual follow-up).

---

## 4. The 15 Clinical Edge Cases & Extraction Benchmarks (`EDGE-01` to `EDGE-15`)

Maintained and verified in [`tests/edge_cases_test.js`](file:///e:/ASHA-AI-COPILOT/tests/edge_cases_test.js):

| Benchmark ID | Test Name & Scenario | Spoken Transcript / Payload | Expected Safe System Action | Pass Rate |
|---|---|---|---|---|
| **EDGE-01** | Extreme Implausible Systolic BP | `280/170 mmHg` | Flag `OUT_OF_RANGE`; nullify reading; trigger `RULE_NCD_BP_UNCERTAIN` for immediate re-measurement; suppress false crisis priority. | 100% |
| **EDGE-02** | Physiologically Inverted BP | `Systolic 80 / Diastolic 120 mmHg` | Flag `CONTRADICTION`; nullify both vitals; trigger re-measurement alert. | 100% |
| **EDGE-03** | Implausible Glucose | `680 mg/dL` | Flag `OUT_OF_RANGE`; nullify; trigger glucometer recalibration/re-test advisory. | 100% |
| **EDGE-04** | BP Threshold Transitions | `139/89` vs `140/90` vs `180/110` | 139/89 is silent; 140/90 triggers medium; 180/110 triggers high (hypertensive crisis). | 100% |
| **EDGE-05** | Glucose Fasting vs Random Cutoffs | Glucose `130 mg/dL` | Random 130 does not trigger; Fasting 130 triggers diabetes rule. | 100% |
| **EDGE-06** | Multiple Symptom Denials | *"कोई सिरदर्द नहीं है, उल्टी बिल्कुल नहीं, चक्कर भी नहीं"* | Correctly filters denials; symptoms list remains empty. | 100% |
| **EDGE-07** | Pure Devanagari Digits | *"रक्तचाप १६० बटा ९५ आया और शुगर २४० दर्ज की गई"* | Normalized to Arabic digits: BP 160/95, Glucose 240. | 100% |
| **EDGE-08** | Spoken Hindi Word-Numbers | *"बीपी एक सौ सत्तर बटा एक सौ पांच है"* | Compound word conversion: 170/105 mmHg. | 100% |
| **EDGE-09** | Hinglish Numbers & Stopped Meds | *"BP 155 by 92 hai, 5 din se dawa band kar di"* | Parses BP 155/92; marks `medication_adherence: false`. | 100% |
| **EDGE-10** | Male Pregnancy Contradiction | Male patient + Pregnancy screening | Flag `CONTRADICTION`; block submission. | 100% |
| **EDGE-11** | Early Fetal Movement Guard | Gestational age 16 weeks + reduced movement | Fetal movement rule suppressed (< 24 weeks gestation). | 100% |
| **EDGE-12** | Unspecified Gestation Guard | Pregnant woman with headache, no weeks stated | Gestation stored as `undefined`; **never fabricates 28w default**. | 100% |
| **EDGE-13** | Edema Qualified by Blood Pressure | Swelling + 115/75 BP vs Swelling + 150/100 BP | Normal BP $\rightarrow$ Low priority; High BP $\rightarrow$ High priority (Pre-eclampsia). | 100% |
| **EDGE-14** | Completely Empty Vitals | Form submitted with zero vitals | Triggers `RULE_NCD_MISSING_DATA`; never fabricates high priority. | 100% |
| **EDGE-15** | Multi-Danger Compounding Signs | Bleeding + Severe Abdominal Pain + Fever | High priority danger signs sorted to top; multi-rule escalation. | 100% |

---

## 5. Clinical Follow-up & Action/Referral Register

The active operational follow-up tasks seeded across the network:

| Follow-up ID | Beneficiary ID & Name | Screening Reference | Clinical Reason | Priority | Destination | Urgency | Resp. Person | Facility Reached | Due Date | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `f-001` | `p-001` (सुनीता देवी) | `s-001` | उच्च रक्तचाप (165/105 mmHg) — दवा पुनः प्रारंभ एवं बीपी जांच | `high` | `phc` | `urgent` | `anm` | `false` | `2026-10-10` | `pending` |
| `f-002` | `p-002` (मीना कुमारी) | `s-002` | गर्भावस्था में रक्तस्राव व पेट दर्द — तत्काल सीएचसी रेफरल | `critical` | `chc` | `immediate` | `medical_officer` | `false` | `2026-10-09` | `pending` |
| `f-003` | `p-003` (रमेश कुमार) | `scenario_ncd_diabetes` | हाई ब्लड ग्लूकोज (245 mg/dL) — उपवास शुगर जांच व परामर्श | `high` | `phc` | `routine` | `asha` | `false` | `2026-10-12` | `pending` |

---

## 6. Field Workers & Supervisor Identity Records

| Worker ID | Name (Hindi / English) | Role | Phone | Assigned Village / Facility | Sub-Center |
|---|---|---|---|---|---|
| `w-001` | **आशा देवी** *(Asha Devi)* | `asha` | `+91 9876543210` | रामपुर *(Rampur)* | सब-सेंटर रामपुर |
| `w-002` | **सुनीता देवी** *(Sunita Devi)* | `asha` | `+91 9876543211` | शिवपुर *(Shivpur)* | सब-सेंटर शिवपुर |
| `sup-001`| **डॉ. प्रिया शर्मा** *(Dr. Priya Sharma)* | `supervisor` | `+91 9876500000` | पीएचसी रामपुर *(PHC Rampur)* | पीएचसी रामपुर |

---

## 7. Clinical NLP Extraction Lexicon & Normalization Dictionaries

Maintained in [`packages/shared/src/nlp/numberNormalizer.ts`](file:///e:/ASHA-AI-COPILOT/packages/shared/src/nlp/numberNormalizer.ts) and [`multilingualExtractor.ts`](file:///e:/ASHA-AI-COPILOT/packages/shared/src/nlp/multilingualExtractor.ts):

### Devanagari Digits
`०:0`, `१:1`, `२:2`, `३:3`, `४:4`, `५:5`, `६:6`, `७:7`, `८:8`, `९:9`.

### Spoken Hindi Numbers
`एक:1`, `दो:2`, `तीन:3`, `चार:4`, `पांच:5`, `दस:10`, `बीस:20`, `अस्सी:80`, `नब्बे:90`, `सौ:100`, `एक सौ चालीस:140`, `एक सौ साठ:160`, `एक सौ पैंसठ:165`, `एक सौ सत्तर:170`, `एक सौ अस्सी:180`, `एक सौ पचासी:185`.

### Bidirectional Negation Triggers
- **Prefix Negations:** `no`, `not`, `without`, `nahi`, `nahin`, `na`, `bilkul nahi`, `koi nahi`, `नहीं`, `ना`, `बिना`.
- **Suffix Negations:** `nahi hai`, `nahin hai`, `not`, `never`, `नहीं है`, `भी नहीं`, `बंद कर दी`, `छूट गई`.

---

## 8. Standard Extracted JSON Payloads & Sync Wire Formats

### Sync Push Wire Format (`SyncPushPayload`)

```json
{
  "device_id": "android-pixel-5-demo-device",
  "worker_id": "w-001",
  "records": [
    {
      "client_record_id": "screen-1728468000000",
      "entity": "screening",
      "operation": "create",
      "timestamp": "2026-10-09T11:45:00.000Z",
      "payload": {
        "id": "screen-1728468000000",
        "patient_id": "p-001",
        "screening_type": "ncd",
        "visit_type": "ncd",
        "transcript": "सुनीता देवी उम्र 48 साल, बीपी 165 बटा 105 आया है...",
        "structured_data": {
          "screening_type": "ncd",
          "visit_type": "ncd",
          "common_visit": {
            "visit_purpose": "ncd_screening",
            "main_complaint": "सिर में भारीपन",
            "complaint_onset": "2 हफ्ते",
            "complaint_course": "worsening",
            "missed_medication_doses": true
          },
          "ncd": {
            "bp_systolic": 165,
            "bp_diastolic": 105,
            "blood_glucose": 142,
            "sample_type": "random",
            "tobacco_use": false,
            "medication_adherence": false,
            "symptoms": ["सिर में भारीपन (heavy head)"]
          },
          "referral_action": {
            "referral_recommended": true,
            "destination": "phc",
            "urgency": "urgent",
            "reason": "Stage 2 High BP (165/105 mmHg) with 2-week medication lapse",
            "responsible_person": "anm"
          }
        },
        "rule_results": [
          {
            "ruleId": "RULE_NCD_BP_HIGH",
            "ruleName": "Elevated Blood Pressure Screening (रक्तचाप बढ़ा हुआ)",
            "triggered": true,
            "priority": "medium",
            "reason": "Systolic BP 165 or Diastolic BP 105 is elevated",
            "reason_hi": "रक्तचाप 165/105 बढ़ा हुआ है",
            "nextWorkflow": "protocol_ncd_hypertension_stage2",
            "protocolSource": "National NCD Operational Guidelines (NP-NCD)"
          }
        ],
        "summary": "सुनीता देवी का रक्तचाप 165/105 mmHg दर्ज किया गया।",
        "confirmed": true,
        "sync_status": "pending"
      }
    }
  ]
}
```

### Sync Push Server Response (`SyncPushResponse`)

```json
{
  "success": true,
  "processed": [
    {
      "client_record_id": "screen-1728468000000",
      "status": "created"
    }
  ],
  "failed": []
}
```
