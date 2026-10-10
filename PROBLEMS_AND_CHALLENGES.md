# ASHA AI Copilot — Problems Solved & Engineering Challenges

This document outlines the real-world healthcare problems addressed by **ASHA AI Copilot** and the clinical, linguistic, memory, and architectural challenges encountered and solved during implementation.

---

## Section 1: Problems It Solves

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMMUNITY HEALTHCARE GAPS                          │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│  1. Administrative Load  │  2. Rural Offline Void   │  3. Safety & Triage   │
│  • 40-50% paper records  │  • Zero cellular access  │  • Dangerous AI advice│
│  • Duplicative typing    │  • Dropped web forms     │  • Delayed PHC alerts │
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

### 1. Manual Documentation Burden on Frontline ASHA Workers
* **The Reality:** ASHA (Accredited Social Health Activist) workers care for 1,000–1,500 rural beneficiaries each. They spend nearly half their working hours manually recording data in physical registers, MCP cards, and web portals.
* **Our Solution:** A natural **Hindi and Hinglish voice-first assistant** that extracts complaints, vitals, and danger signs from spoken consultations in under one second, significantly reducing paperwork time.

### 2. Lack of Internet Connectivity in Remote Rural Areas
* **The Reality:** Grassroots field visits take place in remote hamlets (*tolas*) with zero cellular reception. Cloud-dependent apps stall, fail, or lose unsaved records in the field.
* **Our Solution:** A **100% offline-first architecture**. Local voice dictation, entity extraction, protocol evaluation, and SQLite storage run entirely on the phone without needing internet access.

### 3. The Danger of AI Hallucinations in Healthcare
* **The Reality:** Standard generative AI models can invent false diagnoses, hallucinate vitals, or dismiss genuine emergencies with synthetic conversational text.
* **Our Solution:** **Deterministic Clinical Safety**. AI is strictly limited to extracting spoken entities. All risk scoring, triage levels, and referral recommendations are evaluated by deterministic, pure-TypeScript rules implementing approved MoHFW/ICMR protocols—zero autonomous model diagnoses.

### 4. Delayed Surveillance and Care Discontinuity at PHCs
* **The Reality:** Primary Health Centre (PHC) Medical Officers often learn about high-risk pregnancies or severe hypertension only when emergencies arrive at the hospital.
* **Our Solution:** An integrated **Supervisor Command Center** that automatically surfaces synchronized high-risk cases, displays the exact clinical rules triggered, and tracks scheduled follow-up visits.

---

## Section 2: Challenges We Ran Into & How We Solved Them

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENGINEERING CHALLENGES                            │
├─────────────────────────┬─────────────────────────┬─────────────────────────┤
│  A. Memory & Hardware   │  B. Clinical Boundaries │  C. Multilingual NLP    │
│  • 2GB-3GB budget RAM   │  • Inverted BP guards   │  • Devanagari numerals  │
│  • Zero-leak lifecycle  │  • Gestational fences   │  • Bidirectional denial │
│  • 10-item batch sync   │  • Sensor glitch checks │  • Colloquial adherence │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

### 1. Frontline Android Hardware & Memory Constraints (2GB–3GB RAM)
* **The Challenge:** Low-cost government Android phones crash under heavy AI inference and aggressive OS background process killers.
* **How We Solved It:**
  * Enforced a **sequential AI model lifecycle** (`load` $\rightarrow$ `infer` $\rightarrow$ `unload`), guaranteeing that only one model exists in RAM at any moment.
  * Eliminated background polling timers (`setInterval`), executing state updates only on screen focus (`useFocusEffect`).
  * Chunked sync uploads to **10 items per batch** to eliminate large JSON memory spikes over slow 2G/3G connections.

### 2. Physiologically Inverted and Implausible Vitals
* **The Challenge:** Misheard speech or sensor errors can produce inverted readings (e.g., Systolic $80$ / Diastolic $120$) or extreme glitches ($280/170\text{ mmHg}$), risking false triage decisions.
* **How We Solved It:**
  * Added a **fail-closed validation layer**: Inverted BP is caught as a `CONTRADICTION`, sanitized to `null`, and flagged for re-measurement.
  * Extremes ($> 260/160\text{ mmHg}$ or glucose $> 600\text{ mg/dL}$) are tagged as `uncertain`, suppressing false emergency ambulance codes while prompting a cuff/strip re-check.

### 3. Multilingual Speech, Negation Ambiguity & Devanagari Digits
* **The Challenge:** Workers speak numbers as words (*"एक सौ सत्तर"* = 170), use Devanagari numerals (`१६०/९५`), and frequently report negative findings (*"कोई सिरदर्द नहीं है"*), which naive keyword matchers mistakenly flag as symptoms.
* **How We Solved It:**
  * Built **bidirectional negation windows** that check context around symptoms to discard denied conditions.
  * Created a **clinical number normalizer** that transforms Devanagari digits and spoken compound Hindi words into standardized Arabic numerals prior to rule evaluation.

### 4. Obstetric Fences & Early Gestational Boundaries
* **The Challenge:** In early pregnancy (e.g., 16 weeks), premature fetal movement warnings create false panic, while missing gestational ages tempt systems to guess arbitrary defaults.
* **How We Solved It:**
  * Enforced a strict **$\ge 24$-week gestational fence** before triggering reduced fetal movement rules.
  * If gestational age is unmentioned, the system strictly leaves it `undefined` and prompts the worker to verify the MCP card, refusing to fabricate clinical timelines.

### 5. Intermittent Connectivity & Duplicate Sync Replays (Idempotency)
* **The Challenge:** Over spotty rural connections, network drops often occur after the server saves a record but before the client receives the confirmation, causing duplicate records on retry.
* **How We Solved It:**
  * Designed **client-generated permanent UUIDs** and enforced backend unique constraints (`device_id`, `client_record_id`, `operation`).
  * Replayed upload requests are detected and acknowledged idempotently, ensuring database consistency without duplicate beneficiaries or screening records.

---

## Section 3: Summary Matrix

| Problem Area | Root Cause in Field Work | Implemented Solution | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Documentation Fatigue** | Physical registers & manual entry | Hindi/Hinglish voice screening & automated extraction | 32 multilingual test cases passed (< 1ms latency) |
| **Connectivity Drop** | Remote village terrain | 100% offline-first SQLite persistence | Full local workflow works without HTTP connectivity |
| **Safety in AI** | Generative models hallucinate | Deterministic rule engine based on MoHFW protocols | 18 clinical rules passed (100% deterministic) |
| **RAM Exhaustion** | 2GB budget Android hardware | Sequential model loading & no background polling | Zero heap thrashing; single model in memory |
| **Data Replication** | Network drops mid-sync | Idempotent sync push keyed on client UUIDs | 13/13 sync idempotency tests passed |
