const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('ASHA AI COPILOT: 32-CASE MULTILINGUAL MODEL HARNESS');
console.log('PRD §56: Pure Hindi, Hinglish & English Evaluation');
console.log('====================================================\n');

// Verify dist output freshness
const sharedDist = path.join(__dirname, '..', 'packages', 'shared', 'dist', 'index.js');
assert(fs.existsSync(sharedDist), 'packages/shared/dist must exist before running tests. Run: npm run build --workspace=@asha/shared');

const {
  extractMultilingualScreeningData,
  normalizeClinicalNumbers,
  validateScreeningData,
  evaluateRules
} = require('../packages/shared/dist');

/**
 * 32 Golden Clinical Cases:
 * 11 Pure Hindi (Devanagari numerals, spoken Hindi number words, clinical danger signs)
 * 11 Hinglish (Conversational code-mix, English terms, Hindi negation)
 * 10 English (Clinical screening consultations, vitals, obstetric danger signs)
 */
const GOLDEN_TEST_CASES = [
  // --- Category 1: Pure Hindi (11 cases) ---
  {
    id: 'HI-01',
    category: 'Hindi',
    description: 'Devanagari numerals BP and glucose with missed medication',
    transcript: 'सुनीता देवी, बीपी १६५ बटा १०५ आया है, शुगर १४२ है। दो हफ्ते से बीपी की गोली नहीं खा रही हैं और सिर में भारीपन है।',
    type: 'ncd',
    patient: { name: 'सुनीता देवी', sex: 'female' },
    expected: {
      bp_systolic: 165,
      bp_diastolic: 105,
      blood_glucose: 142,
      medication_adherence: false,
      expected_triage: 'medium' // BP 165/105 is high_reading_rule (medium), med missed is medium
    }
  },
  {
    id: 'HI-02',
    category: 'Hindi',
    description: 'Spoken Hindi number words BP and random glucose with tobacco',
    transcript: 'रमेश कुमार, बीपी एक सौ साठ बटा नब्बे है, शुगर दो सौ पैंतालीस आई है रैंडम, तम्बाकू खाते हैं।',
    type: 'ncd',
    patient: { name: 'रमेश कुमार', sex: 'male' },
    expected: {
      bp_systolic: 160,
      bp_diastolic: 90,
      blood_glucose: 245,
      tobacco_use: true,
      expected_triage: 'high' // glucose 245 >= 200 threshold
    }
  },
  {
    id: 'HI-03',
    category: 'Hindi',
    description: 'Normal checkup with Devanagari numerals',
    transcript: 'आशा शर्मा, उम्र ३२ वर्ष, बीपी १२० बटा ८० है, शुगर ९५ है, कोई अन्य लक्षण नहीं है।',
    type: 'ncd',
    patient: { name: 'आशा शर्मा', sex: 'female' },
    expected: {
      bp_systolic: 120,
      bp_diastolic: 80,
      blood_glucose: 95,
      expected_triage: 'normal'
    }
  },
  {
    id: 'HI-04',
    category: 'Hindi',
    description: 'Hypertensive crisis reading (185/115) with severe headache',
    transcript: 'गोपाल दास, बीपी १८५ बटा ११५ है, सिर में बहुत तेज दर्द और चक्कर आ रहे हैं।',
    type: 'ncd',
    patient: { name: 'गोपाल दास', sex: 'male' },
    expected: {
      bp_systolic: 185,
      bp_diastolic: 115,
      expected_triage: 'high' // severe reading rule (high)
    }
  },
  {
    id: 'HI-05',
    category: 'Hindi',
    description: 'Fasting glucose with spoken compound (एक सौ पचास)',
    transcript: 'कमला बाई, बीपी १३० बटा ८२ है, शुगर एक सौ पचास है खाली पेट।',
    type: 'ncd',
    patient: { name: 'कमला बाई', sex: 'female' },
    expected: {
      bp_systolic: 130,
      bp_diastolic: 82,
      blood_glucose: 150,
      expected_triage: 'high' // fasting glucose >= 126 is high
    }
  },
  {
    id: 'HI-06',
    category: 'Hindi',
    description: 'Negated symptom expressions in Hindi (incomplete glucose -> low priority reminder)',
    transcript: 'राधा बाई, बीपी ११८ बटा ७६ है, सिरदर्द नहीं है और चक्कर भी नहीं आ रहे हैं।',
    type: 'ncd',
    patient: { name: 'राधा बाई', sex: 'female' },
    expected: {
      bp_systolic: 118,
      bp_diastolic: 76,
      expected_triage: 'low' // RULE_NCD_MISSING_DATA triggers low priority reminder
    }
  },
  {
    id: 'HI-07',
    category: 'Hindi',
    description: 'Pregnancy maternal danger sign: bleeding and severe abdominal pain',
    transcript: 'मीना कुमारी २८ हफ्ते की गर्भवती हैं, उनको आज सुबह से हल्का खून बह रहा है और पेट दर्द है।',
    type: 'pregnancy',
    patient: { name: 'मीना कुमारी', sex: 'female' },
    expected: {
      gestational_age_weeks: 28,
      vaginal_bleeding: true,
      severe_abdominal_pain: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HI-08',
    category: 'Hindi',
    description: 'Pre-eclampsia danger sign: headache, blurred vision, elevated BP',
    transcript: 'सीमा देवी बत्तीस सप्ताह की गर्भवती हैं, बीपी एक सौ पचास बटा पचानवे है, सिरदर्द और धुंधला दिख रहा है।',
    type: 'pregnancy',
    patient: { name: 'सीमा देवी', sex: 'female' },
    expected: {
      gestational_age_weeks: 32,
      bp_systolic: 150,
      bp_diastolic: 95,
      severe_headache: true,
      blurred_vision: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HI-09',
    category: 'Hindi',
    description: 'Reduced fetal movement in late pregnancy (34 weeks)',
    transcript: 'रेखा रानी चौंतीस हफ्ते की गर्भवती हैं, पेट में बच्चे की हलचल कम हो गई है।',
    type: 'pregnancy',
    patient: { name: 'रेखा रानी', sex: 'female' },
    expected: {
      gestational_age_weeks: 34,
      reduced_fetal_movement: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HI-10',
    category: 'Hindi',
    description: 'Pregnancy checkup with NO weeks mentioned (Guard against 28-week fabrication)',
    transcript: 'सुमन देवी गर्भवती हैं, कोई खून नहीं आ रहा, कोई सिरदर्द नहीं है, सब सामान्य है।',
    type: 'pregnancy',
    patient: { name: 'सुमन देवी', sex: 'female' },
    expected: {
      gestational_age_weeks: null, // MUST be null/missing, never hardcoded to 28
      vaginal_bleeding: false,
      severe_headache: false,
      expected_triage: 'low' // RULE_PREG_MISSING_DATA triggers low priority reminder
    }
  },
  {
    id: 'HI-11',
    category: 'Hindi',
    description: 'Mild edema with normal BP in pregnancy',
    transcript: 'आरती देवी छब्बीस हफ्ते की गर्भवती हैं, पैरों में हल्की सूजन है, बीपी ११० बटा ७० है।',
    type: 'pregnancy',
    patient: { name: 'आरती देवी', sex: 'female' },
    expected: {
      gestational_age_weeks: 26,
      bp_systolic: 110,
      bp_diastolic: 70,
      swelling: true,
      expected_triage: 'low' // normal BP edema triggers low priority reassurance
    }
  },

  // --- Category 2: Hinglish (11 cases) ---
  {
    id: 'HING-01',
    category: 'Hinglish',
    description: 'BP over notation and missed medicines in Hinglish',
    transcript: 'Sunita ji ka BP 165 over 105 aaya hai, sugar 142 hai, aur unki dawa miss ho gayi hai.',
    type: 'ncd',
    patient: { name: 'Sunita', sex: 'female' },
    expected: {
      bp_systolic: 165,
      bp_diastolic: 105,
      blood_glucose: 142,
      medication_adherence: false,
      expected_triage: 'medium'
    }
  },
  {
    id: 'HING-02',
    category: 'Hinglish',
    description: 'Random glucose high with bidi smoking',
    transcript: 'Ramesh Patel ka random sugar 260 mg/dl hai, BP 135/88 hai aur bidi peete hain.',
    type: 'ncd',
    patient: { name: 'Ramesh Patel', sex: 'male' },
    expected: {
      bp_systolic: 135,
      bp_diastolic: 88,
      blood_glucose: 260,
      tobacco_use: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HING-03',
    category: 'Hinglish',
    description: 'Normal Hinglish screening checkup',
    transcript: 'Kavita Devi age 30, BP 115 by 75, sugar 90 normal, koi taklif nahi hai.',
    type: 'ncd',
    patient: { name: 'Kavita Devi', sex: 'female' },
    expected: {
      bp_systolic: 115,
      bp_diastolic: 75,
      blood_glucose: 90,
      expected_triage: 'normal'
    }
  },
  {
    id: 'HING-04',
    category: 'Hinglish',
    description: 'Severe BP 190 by 110 with severe sar dard',
    transcript: 'Harish Kumar ka BP 190 by 110 hai aur severe sar dard aur chakkar aa raha hai.',
    type: 'ncd',
    patient: { name: 'Harish Kumar', sex: 'male' },
    expected: {
      bp_systolic: 190,
      bp_diastolic: 110,
      expected_triage: 'high'
    }
  },
  {
    id: 'HING-05',
    category: 'Hinglish',
    description: 'Negated tobacco use in Hinglish (incomplete glucose -> low priority reminder)',
    transcript: 'Dinesh Sharma ka BP 125/80 hai, tobacco bilkul nahi khate, medicines regular chal rahi hai.',
    type: 'ncd',
    patient: { name: 'Dinesh Sharma', sex: 'male' },
    expected: {
      bp_systolic: 125,
      bp_diastolic: 80,
      tobacco_use: false,
      medication_adherence: true,
      expected_triage: 'low' // RULE_NCD_MISSING_DATA triggers low priority reminder
    }
  },
  {
    id: 'HING-06',
    category: 'Hinglish',
    description: 'Borderline elevated BP with stopped medicine',
    transcript: 'Shanti Devi BP 142 over 92, sugar 110, pichhle hafte se goli band kar di thi.',
    type: 'ncd',
    patient: { name: 'Shanti Devi', sex: 'female' },
    expected: {
      bp_systolic: 142,
      bp_diastolic: 92,
      blood_glucose: 110,
      medication_adherence: false,
      expected_triage: 'medium'
    }
  },
  {
    id: 'HING-07',
    category: 'Hinglish',
    description: 'Pregnancy bleeding and pait me dard',
    transcript: 'Pooja pregnant hai 30 weeks gestation, subah se bleeding ho rahi hai aur pait me dard hai.',
    type: 'pregnancy',
    patient: { name: 'Pooja', sex: 'female' },
    expected: {
      gestational_age_weeks: 30,
      vaginal_bleeding: true,
      severe_abdominal_pain: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HING-08',
    category: 'Hinglish',
    description: 'Hinglish preeclampsia with dhundhla dikhna',
    transcript: 'Anjali 34 hafte pregnant hai, severe sar dard hai aur dhundhla dikh raha hai, BP 155/100.',
    type: 'pregnancy',
    patient: { name: 'Anjali', sex: 'female' },
    expected: {
      gestational_age_weeks: 34,
      bp_systolic: 155,
      bp_diastolic: 100,
      severe_headache: true,
      blurred_vision: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HING-09',
    category: 'Hinglish',
    description: 'Fetal movement low in Hinglish',
    transcript: 'Kajal 36 weeks pregnant, baby ka movement kam ho gaya hai kal se.',
    type: 'pregnancy',
    patient: { name: 'Kajal', sex: 'female' },
    expected: {
      gestational_age_weeks: 36,
      reduced_fetal_movement: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'HING-10',
    category: 'Hinglish',
    description: 'Negated bleeding in pregnancy checkup',
    transcript: 'Geeta 24 weeks pregnant hai, bleeding nahi hai, normal checkup ke liye aayi hai.',
    type: 'pregnancy',
    patient: { name: 'Geeta', sex: 'female' },
    expected: {
      gestational_age_weeks: 24,
      vaginal_bleeding: false,
      expected_triage: 'normal'
    }
  },
  {
    id: 'HING-11',
    category: 'Hinglish',
    description: 'Pregnancy high fever without specified weeks',
    transcript: 'Pregnant lady ko tez bukhar hai aur ulti ho rahi hai, hafte yaad nahi hain.',
    type: 'pregnancy',
    patient: { name: 'Aarti', sex: 'female' },
    expected: {
      gestational_age_weeks: null,
      fever: true,
      expected_triage: 'medium' // high fever rule in pregnancy is medium
    }
  },

  // --- Category 3: English (10 cases) ---
  {
    id: 'EN-01',
    category: 'English',
    description: 'Hypertension and missed medication in English',
    transcript: 'Patient Sunita Devi, BP recorded 165/105 mmHg, random glucose 140 mg/dL, missed hypertension medication for 2 weeks.',
    type: 'ncd',
    patient: { name: 'Sunita Devi', sex: 'female' },
    expected: {
      bp_systolic: 165,
      bp_diastolic: 105,
      blood_glucose: 140,
      medication_adherence: false,
      expected_triage: 'medium'
    }
  },
  {
    id: 'EN-02',
    category: 'English',
    description: 'Elevated glucose and tobacco use in English',
    transcript: 'Ramesh Kumar, blood glucose 280 mg/dL random, BP 130/85, regular tobacco user.',
    type: 'ncd',
    patient: { name: 'Ramesh Kumar', sex: 'male' },
    expected: {
      bp_systolic: 130,
      bp_diastolic: 85,
      blood_glucose: 280,
      tobacco_use: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'EN-03',
    category: 'English',
    description: 'Routine normal consultation in English',
    transcript: 'Anita Sharma, age 29, BP 120/80 mmHg, glucose 92 mg/dL, no symptoms reported.',
    type: 'ncd',
    patient: { name: 'Anita Sharma', sex: 'female' },
    expected: {
      bp_systolic: 120,
      bp_diastolic: 80,
      blood_glucose: 92,
      expected_triage: 'normal'
    }
  },
  {
    id: 'EN-04',
    category: 'English',
    description: 'Hypertensive emergency 190/120 with headache and dizziness',
    transcript: 'Gopal Singh, emergency screening, BP 190/120 mmHg with severe headache and dizziness.',
    type: 'ncd',
    patient: { name: 'Gopal Singh', sex: 'male' },
    expected: {
      bp_systolic: 190,
      bp_diastolic: 120,
      expected_triage: 'high'
    }
  },
  {
    id: 'EN-05',
    category: 'English',
    description: 'Negated tobacco and alcohol with normal vitals (incomplete glucose -> low priority reminder)',
    transcript: 'Mohan Lal, BP 124/82, no tobacco use, no alcohol, compliant with prescribed diet.',
    type: 'ncd',
    patient: { name: 'Mohan Lal', sex: 'male' },
    expected: {
      bp_systolic: 124,
      bp_diastolic: 82,
      tobacco_use: false,
      alcohol_use: false,
      expected_triage: 'low' // RULE_NCD_MISSING_DATA triggers low priority reminder
    }
  },
  {
    id: 'EN-06',
    category: 'English',
    description: 'Active vaginal bleeding and abdominal cramps in pregnancy',
    transcript: 'Meena Kumari, 28 weeks pregnant, presenting with active vaginal bleeding and severe abdominal cramps.',
    type: 'pregnancy',
    patient: { name: 'Meena Kumari', sex: 'female' },
    expected: {
      gestational_age_weeks: 28,
      vaginal_bleeding: true,
      severe_abdominal_pain: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'EN-07',
    category: 'English',
    description: 'Suspected pre-eclampsia with persistent headache and blurred vision',
    transcript: 'Priyanka, 33 weeks pregnant, BP 150/98 mmHg, complaining of severe persistent headache and blurred vision.',
    type: 'pregnancy',
    patient: { name: 'Priyanka', sex: 'female' },
    expected: {
      gestational_age_weeks: 33,
      bp_systolic: 150,
      bp_diastolic: 98,
      severe_headache: true,
      blurred_vision: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'EN-08',
    category: 'English',
    description: 'Reduced fetal movement at 35 weeks gestation',
    transcript: 'Kavita, 35 weeks gestation, reports reduced fetal movement since yesterday.',
    type: 'pregnancy',
    patient: { name: 'Kavita', sex: 'female' },
    expected: {
      gestational_age_weeks: 35,
      reduced_fetal_movement: true,
      expected_triage: 'high'
    }
  },
  {
    id: 'EN-09',
    category: 'English',
    description: 'Routine second-trimester ANC visit with negated symptoms',
    transcript: 'Deepa, 20 weeks pregnant, no bleeding, no headache, routine ANC visit.',
    type: 'pregnancy',
    patient: { name: 'Deepa', sex: 'female' },
    expected: {
      gestational_age_weeks: 20,
      vaginal_bleeding: false,
      severe_headache: false,
      expected_triage: 'normal'
    }
  },
  {
    id: 'EN-10',
    category: 'English',
    description: 'Pregnancy with persistent high fever and unspecified weeks',
    transcript: 'Pregnant woman reporting persistent high fever and chills, gestational age not specified.',
    type: 'pregnancy',
    patient: { name: 'Lalita', sex: 'female' },
    expected: {
      gestational_age_weeks: null,
      fever: true,
      expected_triage: 'medium'
    }
  }
];

function runEvaluationHarness() {
  let totalSlotsChecked = 0;
  let slotMatches = 0;
  let triageMatches = 0;
  let falseWeeksDefaultProtected = 0;
  let totalExtractionDurationMs = 0;

  console.log(`Running evaluation across ${GOLDEN_TEST_CASES.length} clinical golden cases...\n`);

  for (const tc of GOLDEN_TEST_CASES) {
    const startTime = process.hrtime.bigint();
    const extracted = extractMultilingualScreeningData(tc.transcript, tc.type);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;
    totalExtractionDurationMs += durationMs;

    // Validate extracted data through deterministic validator
    const validation = validateScreeningData(tc.patient, extracted);
    const ruleResults = evaluateRules(validation.sanitizedData);

    // Compute actual clinical triage level
    const triggered = ruleResults.filter(r => r.triggered);
    let actualTriage = 'normal';
    if (triggered.some(r => r.priority === 'urgent')) {
      actualTriage = 'urgent';
    } else if (triggered.some(r => r.priority === 'high')) {
      actualTriage = 'high';
    } else if (triggered.some(r => r.priority === 'medium')) {
      actualTriage = 'medium';
    } else if (triggered.some(r => r.priority === 'low')) {
      actualTriage = 'low';
    }

    // Evaluate Entity Extraction Slots
    let caseFailed = false;
    const exp = tc.expected;

    if (exp.bp_systolic !== undefined) {
      totalSlotsChecked++;
      const actualSys = extracted.ncd?.bp_systolic ?? extracted.pregnancy ? (extracted.ncd?.bp_systolic || null) : null;
      // In pregnancy screening, check either ncd or pregnancy subfields
      const sysVal = extracted.ncd?.bp_systolic ?? null;
      if (sysVal === exp.bp_systolic) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot SysBP] ${tc.id}: expected ${exp.bp_systolic}, got ${sysVal}`);
        caseFailed = true;
      }
    }

    if (exp.bp_diastolic !== undefined) {
      totalSlotsChecked++;
      const diaVal = extracted.ncd?.bp_diastolic ?? null;
      if (diaVal === exp.bp_diastolic) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot DiaBP] ${tc.id}: expected ${exp.bp_diastolic}, got ${diaVal}`);
        caseFailed = true;
      }
    }

    if (exp.blood_glucose !== undefined) {
      totalSlotsChecked++;
      const glucVal = extracted.ncd?.blood_glucose ?? null;
      if (glucVal === exp.blood_glucose) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Glucose] ${tc.id}: expected ${exp.blood_glucose}, got ${glucVal}`);
        caseFailed = true;
      }
    }

    if (exp.gestational_age_weeks !== undefined) {
      totalSlotsChecked++;
      const weekVal = extracted.pregnancy?.gestational_age_weeks ?? null;
      if (exp.gestational_age_weeks === null) {
        // Assert week is null/undefined AND not defaulted to 28
        if (weekVal == null && extracted.field_status?.gestational_age_weeks === 'missing') {
          slotMatches++;
          falseWeeksDefaultProtected++;
        } else {
          console.error(`[FAIL Gestational Week Fabrication] ${tc.id}: Expected null weeks, got ${weekVal}`);
          caseFailed = true;
        }
      } else {
        if (weekVal === exp.gestational_age_weeks) {
          slotMatches++;
        } else {
          console.error(`[FAIL Slot Weeks] ${tc.id}: expected ${exp.gestational_age_weeks}, got ${weekVal}`);
          caseFailed = true;
        }
      }
    }

    if (exp.vaginal_bleeding !== undefined) {
      totalSlotsChecked++;
      const bleedVal = Boolean(extracted.pregnancy?.vaginal_bleeding);
      if (bleedVal === exp.vaginal_bleeding) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Bleeding] ${tc.id}: expected ${exp.vaginal_bleeding}, got ${bleedVal}`);
        caseFailed = true;
      }
    }

    if (exp.severe_headache !== undefined) {
      totalSlotsChecked++;
      const headacheVal = Boolean(extracted.pregnancy?.severe_headache);
      if (headacheVal === exp.severe_headache) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Headache] ${tc.id}: expected ${exp.severe_headache}, got ${headacheVal}`);
        caseFailed = true;
      }
    }

    if (exp.severe_abdominal_pain !== undefined) {
      totalSlotsChecked++;
      const painVal = Boolean(extracted.pregnancy?.severe_abdominal_pain);
      if (painVal === exp.severe_abdominal_pain) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot AbdPain] ${tc.id}: expected ${exp.severe_abdominal_pain}, got ${painVal}`);
        caseFailed = true;
      }
    }

    if (exp.blurred_vision !== undefined) {
      totalSlotsChecked++;
      const visionVal = Boolean(extracted.pregnancy?.blurred_vision);
      if (visionVal === exp.blurred_vision) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Vision] ${tc.id}: expected ${exp.blurred_vision}, got ${visionVal}`);
        caseFailed = true;
      }
    }

    if (exp.reduced_fetal_movement !== undefined) {
      totalSlotsChecked++;
      const movVal = Boolean(extracted.pregnancy?.reduced_fetal_movement);
      if (movVal === exp.reduced_fetal_movement) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Movement] ${tc.id}: expected ${exp.reduced_fetal_movement}, got ${movVal}`);
        caseFailed = true;
      }
    }

    if (exp.swelling !== undefined) {
      totalSlotsChecked++;
      const swellVal = Boolean(extracted.pregnancy?.swelling);
      if (swellVal === exp.swelling) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Swelling] ${tc.id}: expected ${exp.swelling}, got ${swellVal}`);
        caseFailed = true;
      }
    }

    if (exp.fever !== undefined) {
      totalSlotsChecked++;
      const feverVal = Boolean(extracted.pregnancy?.fever);
      if (feverVal === exp.fever) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Fever] ${tc.id}: expected ${exp.fever}, got ${feverVal}`);
        caseFailed = true;
      }
    }

    if (exp.tobacco_use !== undefined) {
      totalSlotsChecked++;
      const tobVal = Boolean(extracted.ncd?.tobacco_use);
      if (tobVal === exp.tobacco_use) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Tobacco] ${tc.id}: expected ${exp.tobacco_use}, got ${tobVal}`);
        caseFailed = true;
      }
    }

    if (exp.medication_adherence !== undefined) {
      totalSlotsChecked++;
      const medVal = Boolean(extracted.ncd?.medication_adherence);
      if (medVal === exp.medication_adherence) {
        slotMatches++;
      } else {
        console.error(`[FAIL Slot Adherence] ${tc.id}: expected ${exp.medication_adherence}, got ${medVal}`);
        caseFailed = true;
      }
    }

    // Evaluate Clinical Triage Agreement
    if (actualTriage === exp.expected_triage) {
      triageMatches++;
    } else {
      console.error(`[FAIL Triage] ${tc.id}: expected triage '${exp.expected_triage}', got '${actualTriage}'`);
      caseFailed = true;
    }

    const statusMark = caseFailed ? '✗' : '✓';
    console.log(`${statusMark} [${tc.category}] ${tc.id}: ${tc.description} (${durationMs.toFixed(2)}ms) -> Triage: ${actualTriage}`);
  }

  const slotAccuracy = (slotMatches / totalSlotsChecked) * 100;
  const triageAccuracy = (triageMatches / GOLDEN_TEST_CASES.length) * 100;
  const avgLatencyMs = totalExtractionDurationMs / GOLDEN_TEST_CASES.length;

  console.log('\n====================================================');
  console.log('HARNESS EVALUATION SUMMARY & METRICS');
  console.log('====================================================');
  console.log(`Total Golden Test Cases:        ${GOLDEN_TEST_CASES.length}`);
  console.log(`Total Entity Slots Checked:     ${totalSlotsChecked}`);
  console.log(`Entity Slots Matched:           ${slotMatches} / ${totalSlotsChecked} (${slotAccuracy.toFixed(2)}%)`);
  console.log(`Clinical Triage Agreement:      ${triageMatches} / ${GOLDEN_TEST_CASES.length} (${triageAccuracy.toFixed(2)}%)`);
  console.log(`Gestational Age 28w Guards:     ${falseWeeksDefaultProtected} unmentioned cases safely unassigned`);
  console.log(`Average Extraction Latency:     ${avgLatencyMs.toFixed(2)} ms (Budget: < 50ms)`);
  console.log('====================================================\n');

  // Assertions for PRD §56 gates
  assert(slotAccuracy >= 95.0, `Entity Slot Extraction accuracy (${slotAccuracy.toFixed(2)}%) fell below 95% threshold`);
  assert(triageAccuracy === 100.0, `Clinical Triage Agreement (${triageAccuracy.toFixed(2)}%) must be 100%`);
  assert(avgLatencyMs < 50.0, `Extraction latency (${avgLatencyMs.toFixed(2)}ms) exceeded 50ms budget`);

  console.log('>>> ALL 32 MULTILINGUAL MODEL HARNESS GATES PASSED! <<<\n');
}

runEvaluationHarness();
