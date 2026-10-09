# ASHA AI Copilot — Complete Forms Directory & Technical Specifications

> **Canonical Form Architecture Document**  
> **Repository:** `ASHA-AI-COPILOT`  
> **Version:** 2.0.0 (Enhanced Field-Workflow Architecture)  
> **Status:** Authoritative  
> **Scope:** Mobile Client (React Native/Expo), Web Supervisor Dashboard, Shared Clinical Types & Protocols, Function Calling Schemas, and Backend FastAPI Models.

---

## Table of Contents

1. [Executive Overview & Forms Architecture](#1-executive-overview--forms-architecture)
2. [The Voice-First, Visit-Based Architecture](#2-the-voice-first-visit-based-architecture)
3. [Master Index of Forms Across the Repository](#3-master-index-of-forms-across-the-repository)
4. [Module A: Beneficiary Identity & Registration](#4-module-a-beneficiary-identity--registration)
   - [Form 4: Beneficiary Registration Form (`patients/new.tsx`)](#form-4-beneficiary-registration-form)
   - [Form 5: Beneficiary Profile & Encounter Action Hub (`patients/[id].tsx`)](#form-5-beneficiary-profile--encounter-action-hub)
5. [Module B: Common Visit Questionnaire (Start Every Visit)](#5-module-b-common-visit-questionnaire-start-every-visit)
6. [Condition-Specific Screening Modules](#6-condition-specific-screening-modules)
   - [Priority 1: NCD Screening & CBAC Checklist (Adults 30+)](#priority-1-ncd-screening--cbac-checklist-adults-30)
   - [Priority 2: Pregnancy & Antenatal Care (ANC)](#priority-2-pregnancy--antenatal-care-anc)
   - [Priority 3: Postnatal Care (PNC) & Newborn/Child Health (HBNC/HBYC)](#priority-3-postnatal-care-pnc--newbornchild-health-hbnchbyc)
   - [Priority 4: General Illness & Acute Complaints](#priority-4-general-illness--acute-complaints)
   - [Priority 5: Family Planning & Reproductive Health](#priority-5-family-planning--reproductive-health)
7. [Primary Clinical Screening & Review Interfaces](#7-primary-clinical-screening--review-interfaces)
   - [Form 1: Enhanced Clinical Entry Form (`manual-entry.tsx`)](#form-1-enhanced-clinical-entry-form)
   - [Form 2: Voice Capture & Adaptive Dictation (`voice-capture.tsx`)](#form-2-voice-capture--adaptive-dictation)
   - [Form 3: Human-in-the-Loop Summary & Verification Gate (`summary.tsx`)](#form-3-human-in-the-loop-summary--verification-gate)
8. [Action Tracking & Referral Management](#8-action-tracking--referral-management)
   - [Form 8: Follow-up & Referral Resolution Form (`followups.tsx`)](#form-8-follow-up--referral-resolution-form)
9. [Worker Onboarding, Security & System Operations](#9-worker-onboarding-security--system-operations)
   - [Form 6: Worker Onboarding 4-Step Wizard (`onboarding/index.tsx`)](#form-6-worker-onboarding-4-step-wizard)
   - [Form 7: PIN Authentication & Lockout Gate (`login.tsx`)](#form-7-pin-authentication--lockout-gate)
   - [Form 9: Worker Settings, AI Model Manager & Data Reset (`profile.tsx`)](#form-9-worker-settings-ai-model-manager--data-reset)
   - [Form 10: Cloud Sync & Transmission Control Form (`sync.tsx`)](#form-10-cloud-sync--transmission-control-form)
   - [Form 11: Supervisor Surveillance & Triage Dashboard (`apps/dashboard/index.html`)](#form-11-supervisor-surveillance--triage-dashboard)
10. [AI Extraction Invariants & Safety Rules](#10-ai-extraction-invariants--safety-rules)
11. [Master Field Cross-Reference Matrix](#11-master-field-cross-reference-matrix)

---

## 1. Executive Overview & Forms Architecture

The **ASHA AI Copilot** is an offline-first, Hindi-voice-enabled assistant designed specifically for frontline Accredited Social Health Activists (ASHA) in rural Indian community healthcare. ASHA workers conduct daily home visits covering Non-Communicable Diseases (NCDs), Maternal Health (ANC), Newborn Care (HBNC), Child Nutrition/Immunization (HBYC), and Family Planning.

### The Pipeline Separation of Concerns

All forms throughout this repository adhere to a strict architectural boundary:

```text
       [ ASHA Voice Utterance / Native Android SpeechRecognizer ]
                                    │
                                    ▼
       [ Multilingual Clinical NLP Extractor & Normalizer ]
         - Extracts ONLY explicitly spoken facts
         - Distinguishes 'confirmed' vs 'explicit_denial' vs 'not_asked'
         - Generates Adaptive Follow-Up Prompts for missing safety data
                                    │
                                    ▼
       [ Deterministic Validation Layer (@asha/shared) ]
         - Physiological plausibility ranges (BP, glucose, gestation)
         - Inverted BP & Biological contradiction guards
                                    │
                                    ▼
       [ Deterministic Clinical Rule Engine (Protocols JSON) ]
         - 100% TypeScript deterministic triage
         - No LLM ever assigns clinical priority or diagnosis
                                    │
                                    ▼
       [ Qwen3 On-Device Plain Hindi Clinical Explanation ]
                                    │
                                    ▼
       [ Human-in-the-Loop Verification Gate (summary.tsx) ]
         - ASHA explicitly reviews and confirms each field
         - Edits trigger instant reactive rule re-evaluation
                                    │
                                    ▼
       [ Local SQLite Commitment & Atomic Sync Queue Enqueue ]
```

---

## 2. The Voice-First, Visit-Based Architecture

Rather than treating forms as static questionnaires or generic speech-to-JSON demos, the enhanced architecture structures every interaction around a **voice-first, visit-based workflow** that asks only the questions relevant to the specific patient and encounter context.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      STEP 1: IDENTIFY BENEFICIARY                       │
│    Search existing record by Name/Phone/ABHA or Register New Person    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       STEP 2: SELECT VISIT TYPE                        │
│   Routine Visit · Symptoms/Illness · ANC (Pregnancy) · PNC/Newborn     │
│             NCD/CBAC (30+) · Family Planning · Follow-up               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             STEP 3: MODULE B — COMMON VISIT QUESTIONNAIRE               │
│   Purpose of Visit · Main Complaint · Onset & Course · Medicines/Doses │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               STEP 4: CONDITION-SPECIFIC VOICE MODULE                  │
│       Adaptive voice prompts triggered by clinical responses:          │
│       - Missing safety signs prompt targeted conversational follow-up  │
│       - Danger signs immediately escalate to emergency triage          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STEP 5: CONFIRM EXTRACTED ANSWERS                    │
│   Field-level review: Spoken values, Not-asked badges, Corrections     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STEP 6: RECORD ACTION & REFERRAL                     │
│    Referral destination (HWC/PHC/CHC/DH), Urgency, Responsible Person   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Master Index of Forms Across the Repository

| # | Form Name | File Location | Primary Purpose | Key Technologies |
|---|---|---|---|---|
| **Form 1** | Enhanced Clinical Entry Form | `apps/mobile/app/screening/manual-entry.tsx` | Manual entry for NCD/CBAC, ANC, PNC, & General Illness | React Native, TypeScript, `@asha/shared` |
| **Form 2** | Voice Capture & Adaptive Dictation | `apps/mobile/app/screening/voice-capture.tsx` | Continuous voice dictation with streaming text & chip inputs | Android Native SpeechRecognizer, Animated API |
| **Form 3** | Human-in-the-Loop Summary & Verification | `apps/mobile/app/screening/summary.tsx` | Verification gate, live rule re-evaluation, field badges | SQLite transaction, SyncQueue |
| **Form 4** | Beneficiary Registration Form | `apps/mobile/app/patients/new.tsx` | Beneficiary registration with ABHA ID, hamlet, consent | `expo-secure-store`, SQLite |
| **Form 5** | Beneficiary Profile & Action Hub | `apps/mobile/app/patients/[id].tsx` | Patient history, phone dialer, encounter hub | React Native, Expo Router |
| **Form 6** | Worker Onboarding 4-Step Wizard | `apps/mobile/app/onboarding/index.tsx` | Worker profile setup & SHA-256 PIN creation | `expo-secure-store`, Web Crypto API |
| **Form 7** | PIN Authentication & Lockout Form | `apps/mobile/app/login.tsx` | Daily authentication with brute-force lockout gate | SHA-256, SecureStore, Timer |
| **Form 8** | Follow-up & Referral Resolution | `apps/mobile/app/followups.tsx` | Action tracking: referral destination, urgency, facility reached | SQLite `followups`, SyncQueue |
| **Form 9** | Worker Settings & AI Model Manager | `apps/mobile/app/profile.tsx` | Model management, offline STT setup, demo reset | FileSystem, ModelManager |
| **Form 10** | Cloud Sync & Transmission Control | `apps/mobile/app/sync.tsx` | Inspection of pending sync queue, manual batch push | Network API, HTTP POST |
| **Form 11** | Supervisor Surveillance Dashboard | `apps/dashboard/index.html` | Facility referral triage & catchment monitoring | Vanilla JS, Fetch, CSS Grid |

---

## 4. Module A: Beneficiary Identity & Registration

### Form 4: Beneficiary Registration Form (`patients/new.tsx`)

Used when registering a new individual or updating missing demographic details. Incorporates community-specific identifiers to ensure accurate matching before duplicate creation.

#### Field Specifications

| Field Name | Type | Hindi Label / Prompt | Constraints & Options | Clinical & Field Rationale |
|---|---|---|---|---|
| `name` | `string` | मरीज का पूरा नाम | Mandatory, 1-100 chars | Beneficiary identification |
| `age` | `number` | उम्र (वर्ष) | Integer, 0–120 | Demographic risk stratification |
| `sex` | `Gender` | लिंग (स्त्री / पुरुष / अन्य) | `'female' \| 'male' \| 'other'` | Recorded directly; never inferred from voice |
| `phone` | `string` | मोबाइल नंबर | Optional, 10 digits | Telephonic follow-up |
| `phone_owner` | `string` | फोन किसका है? | `'self' \| 'spouse' \| 'parent' \| 'neighbor' \| 'other'` | In rural areas, female patients often share household phones |
| `village` | `string` | गांव | Pre-filled from worker profile | Catchment mapping |
| `hamlet_tola` | `string` | टोला / मोहल्ला / माजरा | Optional, string | Sub-village geographic hamlet for home visits |
| `household_id` | `string` | परिवार संख्या (Household ID) | Optional, e.g. `HH-101` | Linkage to family registry & head of household |
| `relationship_to_head` | `string` | परिवार के मुखिया से संबंध | `'स्वयं' \| 'पत्नी' \| 'बेटा' \| 'बेटी' \| 'अन्य'` | Ration card & census register cross-reference |
| `abha_id` | `string` | आभा आईडी (ABHA - 14 अंक) | 14-digit national health ID | National Digital Health Mission (ABDM) integration |
| `disability_access_needs` | `string` | दिव्यांगता / विशेष सहायता | Free text | Identifies beneficiaries needing mobility assistance |
| `consent_obtained` | `boolean` | लाभार्थी की सहमति ली गई | Default `true` | Programmatic consent requirement |

---

## 5. Module B: Common Visit Questionnaire (Start Every Visit)

Every encounter begins with a standardized 6-question conversational intake before branching into specialized condition modules:

1. **Purpose of Visit (`visit_purpose`)**:
   - *Hindi Prompt:* “आज आपसे मिलने का मुख्य कारण क्या है?”
   - *Options:* Routine check-up, new complaint/illness, scheduled ANC, scheduled PNC, newborn/child visit, NCD/CBAC screening, family planning, follow-up.
2. **Main Complaint (`main_complaint`)**:
   - *Hindi Prompt:* “आपको अभी क्या परेशानी हो रही है?”
   - *Guideline:* Recorded in the patient's own colloquial words (e.g., “सिर में भारीपन”) before diagnostic categorization.
3. **Onset & Course (`complaint_onset`, `complaint_course`)**:
   - *Hindi Prompt:* “यह परेशानी कब शुरू हुई? क्या यह बढ़ रही है, घट रही है या वैसी ही है?”
   - *Options:* `'worsening' | 'improving' | 'unchanged' | 'fluctuating'`.
4. **Associated Symptoms & Severity (`associated_symptoms_description`)**:
   - Captured in patient's own words. Does not force artificial numeric 1-10 pain scores.
5. **Existing Conditions & Medications (`known_conditions`, `current_medications`)**:
   - *Hindi Prompt:* “क्या आपको पहले से कोई बीमारी है? क्या आप अभी कोई दवा ले रहे हैं? क्या कोई दवा छूटी है?”
   - Distinguishes whether doses were missed and the root reason (stock out, financial, side effects, forgetfulness).
6. **Previous Care & Consultations (`previous_care_facility`, `previous_care_advice`)**:
   - *Hindi Prompt:* “क्या आपने इस परेशानी के लिए पहले किसी स्वास्थ्य केंद्र या डॉक्टर को दिखाया है?”

---

## 6. Condition-Specific Screening Modules

### Priority 1: NCD Screening & CBAC Checklist (Adults 30+)

Aligned with the National Programme for Prevention and Control of Non-Communicable Diseases (NP-NCD) Community Based Assessment Checklist (CBAC):

| CBAC Dimension | Fields & Question Prompts | Plausible Range / Options | Deterministic Triage Rule |
|---|---|---|---|
| **Age Factor** | Patient age | 30+ years | Part of CBAC score |
| **Tobacco Use** | `tobacco_use_type`: smokeless, smoking, both, none<br>`tobacco_frequency`: daily, occasional, past, never | Khaini, Gutkha, Bidi, Cigarette | Risk multiplier |
| **Alcohol Consumption** | `alcohol_consumption`: daily, occasional, never | Spoken Hindi / Hinglish | Lifestyle flag |
| **Physical Activity** | `physical_activity_adequate`: >= 150 min/week | Boolean | Lifestyle counselling |
| **Waist Circumference** | `waist_circumference_cm` | 30–200 cm | Central obesity (>80cm women, >90cm men) |
| **Blood Pressure** | `bp_systolic` / `bp_diastolic` | 50–260 / 30–160 mmHg | >=140/90 Medium; >=180/110 High |
| **Blood Glucose** | `blood_glucose`, `sample_type` | 30–600 mg/dL (fasting / random) | Fasting >=126 or Random >=200 High |
| **Cancer Early Signs** | - Oral: Non-healing ulcer >2w, white/red patches<br>- Breast: Lump, nipple discharge, shape change<br>- Cervical: Bleeding between periods, foul discharge | Boolean flags | Immediate MO Referral |

### Priority 2: Pregnancy & Antenatal Care (ANC)

Aligned with Ministry of Health & Family Welfare (MoHFW) maternal health guidelines:

| Clinical Area | Fields & Capture Methods | Clinical Guard / Invariant |
|---|---|---|
| **Gestational Age** | `lmp_date`, `edd_date`, `gestational_age_weeks` | 1–44 weeks. **Never fabricates 28-week default** if unmentioned. |
| **ANC Tracking** | `anc_registered`, `anc_visit_number`, `last_anc_checkup_date` | Asserts timely ANC 1, 2, 3, 4 attendance. |
| **Danger Signs** | `vaginal_bleeding`, `severe_headache`, `blurred_vision`, `severe_abdominal_pain`, `fever`, `convulsions`, `leaking_fluid` | **Urgent triage (High Priority)** overrides routine form completion. |
| **Fetal Movement** | `reduced_fetal_movement` | **Gated strictly at >= 24 weeks.** Suppressed for early gestation. |
| **Edema Disambiguation** | `swelling` qualified by `bp_systolic` / `bp_diastolic` | Isolated edema + normal BP = Low (physiological). Edema + high BP = High (pre-eclampsia). |
| **Supplements** | `ifa_tablets_consumed`, `calcium_tablets_consumed` | Compliance tracking for maternal anemia. |
| **Birth Preparedness** | `birth_preparedness_facility` | Delivery plan: Sub-center, PHC, CHC, or District Hospital. |

### Priority 3: Postnatal Care (PNC) & Newborn/Child Health (HBNC/HBYC)

Aligned with Home Based Newborn Care (HBNC) and Home Based Care for Young Child (HBYC) home visit schedules (Days 1, 3, 7, 14, 21, 28, 42):

| Dimension | Specific Fields | Protocol Danger Signs |
|---|---|---|
| **Maternal PNC** | `delivery_date`, `delivery_place` (institutional/home), `delivery_complications` | Postpartum hemorrhage (PPH), high fever, foul lochia |
| **Newborn Status** | `baby_dob`, `birth_weight_kg` (0.4–8.0 kg), `preterm_birth` | Low birth weight (<2.5 kg), very low birth weight (<1.8 kg) |
| **Feeding** | `breastfeeding_within_first_hour`, `exclusive_breastfeeding`, `poor_feeding_or_sucking` | Inability to suckle = Critical neonatal referral |
| **Newborn Danger Signs** | `newborn_fever_or_hypothermia`, `fast_breathing_or_indrawing`, `reduced_activity_or_lethargy`, `convulsions`, `jaundice_yellow_palms_soles`, `umbilical_cord_infection` | Fast breathing (>60/min), chest indrawing, hypothermia (<35.5°C) -> Immediate SNCU/NBSU referral |
| **Immunization Schedule** | `immunization_doses_received`, `immunization_doses_due` | Birth doses: BCG, OPV-0, Hep-B. 6/10/14 weeks: Pentavalent, Rota, fIPV, PCV. |

### Priority 4: General Illness & Acute Complaints

- Captures chief complaint, fever duration, cough >2 weeks (TB presumptive screening), acute diarrhea, dehydration signs, vomiting.
- Triggers ORS/Zinc protocols or immediate primary health center (PHC) referral.

### Priority 5: Family Planning & Reproductive Health

- Tracks current contraceptive method: IUCD, Antara (injectable), Chhaya (non-hormonal oral pill), Mala-N, Condoms (Nirodh), Sterilization (NSV/laparoscopic).
- Records counselling, method satisfaction, side effects, and stock availability.

---

## 7. Primary Clinical Screening & Review Interfaces

### Form 1: Enhanced Clinical Entry Form (`manual-entry.tsx`)

The structured interface allowing ASHA workers to record clinical visits manually with adaptive condition tabs:

```
┌────────────────────────────────────────────────────────┐
│ [← Back]          नया स्वास्थ्य परीक्षण         [Draft] │
├────────────────────────────────────────────────────────┤
│ Beneficiary: सुनीता देवी (Sunita Devi, 48F)            │
│ Visit Type:  [ NCD/CBAC ]  [ ANC ]  [ PNC ]  [ General ]│
├────────────────────────────────────────────────────────┤
│ MODULE B: सामान्य जांच (Common Visit)                  │
│ मुख्य शिकायत: [ सिर में भारीपन और चक्कर           ]     │
│ शुरुआत:       [ 10 दिन से                       ]     │
│ स्थिति:       (●) बढ़ रही है  ( ) घट रही  ( ) वैसी ही │
│ दवाएं:        [ बीपी की गोली 2 हफ्ते से बंद है     ]     │
├────────────────────────────────────────────────────────┤
│ NCD & CBAC जांच (Clinical Measurements)                │
│ सिस्टोलिक बीपी (mmHg): [ 165 ]  डायस्टोलिक: [ 105 ]     │
│ ब्लड शुगर (mg/dL):    [ 142 ]  प्रकार: (●) रैंडम ( ) उपवास│
│ कमर का घेरा (सेमी):   [ 88  ]  तम्बाकू: [ खैनी (दैनिक) ]│
├────────────────────────────────────────────────────────┤
│ रेफरल व अनुवर्ती कार्यवाही (Action & Referral)          │
│ रेफरल केंद्र: [ प्राथमिक स्वास्थ्य केंद्र (PHC)     ▼ ] │
│ तात्कालिकता:  ( ) तत्काल (●) आवश्यक (24-48h) ( ) सामान्य│
│ जिम्मेदार:    [ एएनएम दीदी / एमओ डॉक्टर            ▼ ] │
├────────────────────────────────────────────────────────┤
│ [✓] मैंने दर्ज जानकारी की सत्यता जांच ली है             │
│ [            सुरक्षित करें और सिंक में जोड़ें           ] │
└────────────────────────────────────────────────────────┘
```

### Form 2: Voice Capture & Adaptive Dictation (`voice-capture.tsx`)

A voice-first dictation surface featuring continuous utterance accumulation:
- **Speech Streaming:** Real-time token streaming via Android `SpeechRecognizer` native callbacks.
- **Base Text Ref:** Preserves pre-typed complaints or quick clinical chips when voice recording begins.
- **Adaptive AI Follow-Up Questions:** When critical fields are omitted, the AI prompts the ASHA:
  - *High BP detected without symptom clarification:*
    > “क्या मरीज को अभी तेज सिरदर्द, सीने में दर्द, सांस लेने में परेशानी या कोई अन्य गंभीर लक्षण है?”
  - *Pregnancy >= 24 weeks without fetal movement report:*
    > “क्या शिशु की हलचल सामान्य महसूस हो रही है?”
  - *Severe headache in pregnancy:*
    > “क्या आंखों के आगे धुंधलापन या पेट के ऊपरी हिस्से में तेज दर्द है?”

### Form 3: Human-in-the-Loop Summary & Verification Gate (`summary.tsx`)

The mandatory confirmation checkpoint before committing any record to disk:
- Displays extracted values with **provenance badges** (`worker_spoken_input`, `worker_manual_entry`, `device_measurement`).
- Shows `not_asked` or `missing` badges for unverified dimensions.
- **Reactive Rule Re-evaluation:** If the ASHA adjusts a systolic BP from 165 to 135 in the input box, the engine dynamically recalculates risk from High/Medium to Normal in real time.
- Requires explicit opt-in confirmation check (`isHumanConfirmed = true`).

---

## 8. Action Tracking & Referral Management

### Form 8: Follow-up & Referral Resolution Form (`followups.tsx`)

Manages the clinical lifecycle of referred beneficiaries:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ [Pending Follow-ups (3)]                   [Completed Archive (14)]     │
├─────────────────────────────────────────────────────────────────────────┤
│ 🚨 URGENT: सुनीता देवी (Sunita Devi) — 48F                              │
│ कारण: उच्च रक्तचाप (165/105 mmHg) — दवा 2 सप्ताह से बंद                │
│ रेफरल गंतव्य: प्राथमिक स्वास्थ्य केंद्र (PHC रामपुर)                     │
│ अंतिम तिथि: कल तक (Due: 2026-10-10)                                     │
│ स्थिति: [ ] मरीज अस्पताल पहुंचा (Facility Reached)                      │
│ कार्यवाही: [ कॉल करें (Call) ]  [ स्थिति बदलें ]  [ सम्पन्न (Mark Done) ] │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Referral Tracking Schema

```json
{
  "referral_recommended": true,
  "destination": "phc",
  "urgency": "urgent",
  "reason": "Severe blood pressure elevation (165/105 mmHg) with medication interruption",
  "referral_slip_issued": true,
  "facility_reached": false,
  "responsible_person": "anm",
  "action_due_date": "2026-10-11",
  "notes": "Advised to visit PHC on next Tuesday clinic day; informed family member"
}
```

---

## 9. Worker Onboarding, Security & System Operations

### Form 6: Worker Onboarding 4-Step Wizard (`onboarding/index.tsx`)
- Step 1: Language selection (Hindi / English).
- Step 2: ASHA worker profile & Sub-Center assignment.
- Step 3: Village & catchment hamlet allocation.
- Step 4: 4-digit security PIN setup with SHA-256 salt & hash stored in `expo-secure-store`.

### Form 7: PIN Authentication & Lockout Gate (`login.tsx`)
- Authenticates the worker against SecureStore SHA-256 hash.
- Implements exponential backoff: 5 failed attempts locks the app for 30 seconds to prevent unauthorized device access.

### Form 9: Worker Settings, AI Model Manager & Data Reset (`profile.tsx`)
- Displays runtime AI models (Needle 3 function calling, Qwen 0.5B/1.7B).
- Provides step-by-step instructions for enabling Android offline Hindi speech recognition.
- Allows demo data wipe (`clearAllData()`) without deleting worker profile.

### Form 10: Cloud Sync & Transmission Control Form (`sync.tsx`)
- Inspects pending queue records across `patient`, `screening`, `followup`.
- Triggers atomic batch sync via `/sync/push` with cryptographic authorization header.

### Form 11: Supervisor Surveillance Dashboard (`apps/dashboard/index.html`)
- Web portal for Primary Health Center Medical Officers (MO).
- Filters high-risk maternal danger signs and hypertensive emergencies across catchment villages.

---

## 10. AI Extraction Invariants & Safety Rules

Frontline healthcare demands zero hallucination and complete auditability:

| Scenario / Condition | Correct AI & Engine Behavior | Prohibited Anti-Pattern |
|---|---|---|
| **Symptom Not Mentioned** | Store `null` or status `'not_asked'` | **Banned:** Setting `false` or inventing symptoms (e.g. adding dizziness when only headache was spoken). |
| **Explicit Symptom Denial** | Store `false` with status `'explicit_denial'` (e.g., "चक्कर बिल्कुल नहीं आ रहे") | Conflating denial with unasked fields. |
| **Uncertain Speech / Numbers** | Flag field as `'uncertain'` and ask ASHA to confirm | Silently guessing plausible vitals. |
| **Implausible Measurement** | Flag `OUT_OF_RANGE`, nullify value, trigger re-measurement rule | Passing impossible readings (e.g. 280/170 BP) into emergency triage. |
| **Unspecified Gestational Age** | Leave `gestational_age_weeks` as `undefined` | **Banned:** Fabricating fallback default (e.g. defaulting to 28 weeks). |
| **Male Patient Pregnancy** | Flag `CONTRADICTION` biological error | Permitting maternal screening on male beneficiaries. |
| **Early Fetal Movement (<24w)** | Suppress fetal movement rule evaluation | Flagging fetal distress at 16 weeks gestation. |
| **High-Risk Response** | Immediately escalate risk card and generate safety prompts | Delaying urgent response to finish remaining form fields. |

---

## 11. Master Field Cross-Reference Matrix

Mapping form UI fields to SQLite, Shared TypeScript types, NLP extraction, and Backend API models:

| Logical Field | Form UI Field | SQLite Column | `@asha/shared` Type | NLP Extraction | Backend Pydantic |
|---|---|---|---|---|---|
| Beneficiary Name | `name` | `patients.name` | `Patient.name` | Entity regex | `PatientCreate.name` |
| Age | `age` | `patients.age` | `Patient.age` | Spoken number | `PatientCreate.age` |
| Sex | `sex` | `patients.sex` | `Patient.sex` | Demographic pill | `PatientCreate.sex` |
| Phone Owner | `phoneOwner` | `patients.phone_owner` | `Patient.phone_owner` | Dropdown | `PatientCreate.phone_owner` |
| Hamlet / Tola | `hamletTola` | `patients.hamlet_tola` | `Patient.hamlet_tola` | Text input | `PatientCreate.hamlet_tola` |
| ABHA Health ID | `abhaId` | `patients.abha_id` | `Patient.abha_id` | 14-digit check | `PatientCreate.abha_id` |
| Consent Status | `consentObtained`| `patients.consent_obtained`| `Patient.consent_obtained`| Checkbox | `PatientCreate.consent_obtained` |
| Main Complaint | `mainComplaint` | `screenings.structured_data` | `CommonVisitData.main_complaint` | Colloquial phrase | `ScreeningCreate.structured_data` |
| Onset & Course | `complaintCourse`| `screenings.structured_data` | `CommonVisitData.complaint_course` | Radio pills | `ScreeningCreate.structured_data` |
| Systolic BP | `systolic` | `screenings.structured_data` | `NCDScreeningData.bp_systolic` | `extractBloodPressure` | `ScreeningCreate.structured_data` |
| Diastolic BP | `diastolic` | `screenings.structured_data` | `NCDScreeningData.bp_diastolic` | `extractBloodPressure` | `ScreeningCreate.structured_data` |
| Blood Glucose | `glucose` | `screenings.structured_data` | `NCDScreeningData.blood_glucose` | `extractBloodGlucose` | `ScreeningCreate.structured_data` |
| Waist (cm) | `waistCm` | `screenings.structured_data` | `CBACScreeningData.waist_circumference_cm` | Numeric parser | `ScreeningCreate.structured_data` |
| Gestational Age | `gestationalWeeks`| `screenings.structured_data` | `PregnancyScreeningData.gestational_age_weeks` | `extractGestationalWeeks` | `ScreeningCreate.structured_data` |
| Vaginal Bleeding | `vaginalBleeding`| `screenings.structured_data` | `PregnancyScreeningData.vaginal_bleeding` | `hasClinicalSign` | `ScreeningCreate.structured_data` |
| Referral Dest. | `destination` | `followups.destination` | `ReferralActionData.destination` | Selector pill | `FollowUpCreate.destination` |
| Referral Urgency | `urgency` | `followups.urgency` | `ReferralActionData.urgency` | Radio pills | `FollowUpCreate.urgency` |
| Facility Reached | `facilityReached`| `followups.facility_reached`| `ReferralActionData.facility_reached`| Checkbox | `FollowUpCreate.facility_reached` |
