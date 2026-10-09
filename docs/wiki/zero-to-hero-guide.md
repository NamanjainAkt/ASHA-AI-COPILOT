# Zero-to-Hero Contributor & Developer Guide

> **Audience:** Developers, Contributors, and QA Engineers joining the ASHA AI Copilot project.

---

## 1. Project Summary

**ASHA AI Copilot** is an offline-first, dual-language (Hindi/English) mobile clinical copilot built for India's Accredited Social Health Activist (ASHA) community healthcare workers. It enables offline voice screening for Non-Communicable Diseases (NCDs) and High-Risk Pregnancies, validates vitals against Indian clinical protocols, explains danger signs in Hindi, and syncs idempotently with Primary Health Centre (PHC) supervisor dashboards.

---

## 2. Prerequisites

| Tool | Minimum Version | Verified Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | `v24.12.0` | React Native & Expo CLI runtime |
| **npm** | `>= 9.0.0` | `10.8.2` | Workspace package management |
| **Python** | `>= 3.10.0` | `3.14.2` | FastAPI backend & sync server |
| **Java JDK** | `17 LTS` | Microsoft OpenJDK `17.0.17` | Android Gradle build toolchain |
| **Android SDK** | API 34+ | Android SDK 35 (Build tools 35.0.0) | Native Android APK compilation |

---

## 3. Environment Setup

### Step 1: Clone and Install Monorepo Dependencies
```powershell
git clone <repo-url>
cd "C:\Andy projects\Asha"

# Install all workspace dependencies
npm install

# Build shared protocol & type definitions
npm run build --workspace=@asha/shared
```

*Expected Output:*
```text
added 920 packages, and audited 920 packages in 4s
> @asha/shared@1.0.0 build
> tsc
```

### Step 2: Verify Python Backend Dependencies
```powershell
pip install fastapi uvicorn pydantic httpx pytest
```

---

## 4. Annotated Project Directory Tree

```text
C:\Andy projects\Asha\
├── apps/
│   ├── mobile/                     # React Native / Expo Router v4 Android Application
│   │   ├── app/                    # File-based routing (12+ screens)
│   │   │   ├── _layout.tsx         # Root Stack & Theme Provider
│   │   │   ├── splash.tsx          # Initial DB priming & auth router
│   │   │   ├── onboarding/         # 4-step first-time ASHA worker onboarding wizard
│   │   │   ├── login.tsx           # Offline PIN authentication & worker switch
│   │   │   ├── (tabs)/             # Bottom navigation tabs (Home, Followups, Sync, Profile)
│   │   │   ├── patients/           # Beneficiary directory, new beneficiary, [id] detail hub
│   │   │   └── screening/          # Voice capture (expo-av) & visit summary verification
│   │   ├── constants/              # Colors, Spacing, Hindi/English Translations
│   │   ├── services/
│   │   │   ├── ai/                 # Orchestrator, Native Cactus Driver, Simulator Driver
│   │   │   ├── db/                 # SQLite database & repositories (patients, screenings, sync)
│   │   │   └── rules/              # Deterministic clinical rule evaluator & explainability
│   │   └── android/                # Native Gradle project & signing keystore
│   └── dashboard/                  # Supervisor Command Center Web Application
├── packages/
│   └── shared/                     # Domain models, clinical schemas, validation logic
│       ├── src/protocols/          # Clinical rule threshold JSON files
│       │   ├── ncd-demo.json       # Hypertension & Diabetes triage criteria
│       │   └── pregnancy-demo.json # Maternal danger sign triage criteria
├── services/
│   └── api/                        # FastAPI Backend & Supervisor Sync Server
│       ├── main.py                 # Idempotent /sync/push, /sync/pull, /dashboard APIs
│       └── database.py             # Server SQLite store
├── dist/                           # Production release artifacts (.apk)
├── tests/                          # Automated unit & integration test suites
└── docs/wiki/                      # Project technical documentation wiki
```

---

## 5. Development Workflow

### Run the Mobile Application (Development Mode)
```powershell
# From root directory:
npm run start:mobile
```
Press `a` to open on an Android emulator or scan the QR code with Expo Go on a physical phone.

### Start the FastAPI Supervisor Backend
```powershell
python services/api/main.py
```
*API Swagger Documentation:* `http://localhost:8000/docs`  
*Supervisor Web Dashboard:* `http://localhost:8000/dashboard`

### Compile Production Release APK
```powershell
cd apps\mobile\android
.\gradlew.bat assembleRelease
```
The compiled APK will be output at `apps\mobile\android\app\build\outputs\apk\release\app-release.apk`.

---

## 6. Running Automated Tests

### 1. Clinical Protocol & Rule Engine Tests
```powershell
node tests/clinical_rules_test.js
```
*Expected Output:*
```text
----------------------------------------------------
RUNNING CLINICAL PROTOCOL & RULE ENGINE TESTS
----------------------------------------------------
✓ Test 1: Blood pressure validation passed for 165/105 mmHg
✓ Test 2: Contradiction detected when systolic <= diastolic
✓ Test 3: Biological contradiction caught for male pregnant screening
✓ Test 4: Missing blood glucose correctly flagged in field_status
✓ Test 5: External protocol JSON configurations parsed successfully
----------------------------------------------------
ALL CLINICAL RULE TESTS PASSED (5/5)
----------------------------------------------------
```

### 2. Idempotent Sync & Batch Replay Tests
```powershell
$env:PYTHONIOENCODING="utf-8"; python tests/sync_idempotency_test.py
```
*Expected Output:*
```text
[PASS] Step 1: Initial sync push succeeded with status: created
[PASS] Step 2: Idempotent duplicate replay verified! Patient count remained stable at 9
[PASS] Step 3: /sync/pull verified, retrieved newly synchronized patient
ALL SYNC IDEMPOTENCY TESTS PASSED (3/3)
```

### 3. TypeScript Static Typecheck
```powershell
npx tsc --noEmit --project apps/mobile/tsconfig.json
```

---

## 7. How-To: Add a New Clinical Rule

1. **Update Threshold JSON**: Open `packages/shared/src/protocols/ncd-demo.json` and add a new rule entry:
   ```json
   {
     "id": "RULE_SEVERE_DIABETES",
     "name": "Severe Random Blood Sugar",
     "name_hi": "गंभीर उच्च रक्त शर्करा",
     "priority": "high",
     "action": "immediate_referral",
     "conditions": {
       "blood_glucose": { "gte": 250 }
     },
     "reason": "Random blood glucose is >= 250 mg/dL. Immediate medical consultation required.",
     "reason_hi": "रक्त शर्करा 250 mg/dL से अधिक है। तत्काल पीएचसी डॉक्टर को दिखाएं।"
   }
   ```
2. **Rebuild Shared Package**:
   ```powershell
   npm run build --workspace=@asha/shared
   ```
3. **Verify Evaluation**:
   Run `node tests/clinical_rules_test.js` to ensure the rule triggers correctly.

---

## 8. Common Pitfalls & Troubleshooting

- **Windows CP1252 Terminal Encoding**: Always run `$env:PYTHONIOENCODING="utf-8"` in PowerShell before running Python scripts with Devanagari output to prevent `UnicodeEncodeError`.
- **Metro Monorepo Resolution**: All package resolution goes through `apps/mobile/metro.config.js`. If Metro fails to find a module, ensure it is added to `config.resolver.nodeModulesPaths`.
- **Microphone on Emulator**: When running on Android Virtual Devices (AVD), ensure microphone input is set to "Virtual microphone using host audio input" in emulator settings.
