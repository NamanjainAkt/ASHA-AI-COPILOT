const assert = require('assert');
const path = require('path');
const {
  extractMultilingualScreeningData,
  validatePatient,
  validateScreeningData,
  evaluateRules
} = require('../packages/shared/dist');

console.log('================================================================');
console.log('       ASHA AI COPILOT: COMPREHENSIVE EDGE CASE TEST SUITE      ');
console.log('   Auditing: Clinical Safety, Boundaries, Negations & Guards    ');
console.log('================================================================\n');

let passedCount = 0;
let totalCount = 0;

function runTest(id, name, testFn) {
  totalCount++;
  try {
    testFn();
    console.log(`✓ [PASS] ${id}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`✗ [FAIL] ${id}: ${name}`);
    console.error(`  Error: ${err.message}\n`);
  }
}

// ============================================================================
// CATEGORY 1: PHYSIOLOGICAL BOUNDARIES & IMPLAUSIBLE VITALS (FAIL-SAFE)
// ============================================================================

runTest('EDGE-01', 'Extreme Implausible Systolic BP (280/170 mmHg)', () => {
  const patient = { name: 'राम लाल (Ram Lal)', age: 60, sex: 'male' };
  const rawData = {
    screening_type: 'ncd',
    ncd: { bp_systolic: 280, bp_diastolic: 170, blood_glucose: 120 }
  };
  const val = validateScreeningData(patient, rawData);
  assert.strictEqual(val.isValid, false, 'Validation must fail for 280/170');
  assert(val.issues.some(i => i.field === 'bp_systolic' && i.code === 'OUT_OF_RANGE'), 'Systolic out of range');
  assert(val.issues.some(i => i.field === 'bp_diastolic' && i.code === 'OUT_OF_RANGE'), 'Diastolic out of range');
  
  const rules = evaluateRules(val.sanitizedData);
  // Must suppress false hypertensive crisis and require re-measurement
  assert(rules.some(r => r.ruleId === 'RULE_NCD_BP_UNCERTAIN'), 'Must trigger RULE_NCD_BP_UNCERTAIN');
  assert(!rules.some(r => r.ruleId === 'RULE_NCD_BP_CRITICAL'), 'Must NOT trigger crisis priority on uncertain reading');
});

runTest('EDGE-02', 'Physiologically Inverted BP (Systolic < Diastolic: 80/120 mmHg)', () => {
  const patient = { name: 'मीना (Meena)', age: 40, sex: 'female' };
  const rawData = {
    screening_type: 'ncd',
    ncd: { bp_systolic: 80, bp_diastolic: 120, blood_glucose: 110 }
  };
  const val = validateScreeningData(patient, rawData);
  assert.strictEqual(val.isValid, false, 'Validation must fail when systolic <= diastolic');
  assert(val.issues.some(i => i.code === 'CONTRADICTION'), 'Must catch biological BP contradiction');
  assert.strictEqual(val.sanitizedData.ncd.bp_systolic, null, 'Must nullify inverted systolic');
  assert.strictEqual(val.sanitizedData.ncd.bp_diastolic, null, 'Must nullify inverted diastolic');
  
  const rules = evaluateRules(val.sanitizedData);
  assert(rules.some(r => r.ruleId === 'RULE_NCD_BP_UNCERTAIN' || r.ruleId === 'RULE_NCD_MISSING_DATA'), 'Must flag data issue');
});

runTest('EDGE-03', 'Implausible Blood Glucose Out of Range (> 600 mg/dL)', () => {
  const patient = { name: 'सुरेश (Suresh)', age: 52, sex: 'male' };
  const rawData = {
    screening_type: 'ncd',
    ncd: { bp_systolic: 125, bp_diastolic: 82, blood_glucose: 680 }
  };
  const val = validateScreeningData(patient, rawData);
  assert.strictEqual(val.isValid, false, 'Validation must flag glucose > 600');
  assert(val.issues.some(i => i.field === 'blood_glucose' && i.code === 'OUT_OF_RANGE'));
  assert.strictEqual(val.sanitizedData.ncd.blood_glucose, null, 'Uncertain glucose must be sanitized to null');

  const rules = evaluateRules(val.sanitizedData);
  assert(rules.some(r => r.ruleId === 'RULE_NCD_GLUCOSE_UNCERTAIN'), 'Must trigger RULE_NCD_GLUCOSE_UNCERTAIN');
});

runTest('EDGE-04', 'Exact BP Threshold Boundary Transitions (139/89 vs 140/90 vs 180/110)', () => {
  // Sub-case A: 139/89 mmHg (Just below Stage 1)
  const res139 = evaluateRules({
    screening_type: 'ncd',
    ncd: { bp_systolic: 139, bp_diastolic: 89, blood_glucose: 100 }
  });
  assert(!res139.some(r => r.ruleId === 'RULE_NCD_BP_HIGH'), '139/89 must NOT trigger elevated BP rule');

  // Sub-case B: 140/90 mmHg (Exact Stage 1 boundary)
  const res140 = evaluateRules({
    screening_type: 'ncd',
    ncd: { bp_systolic: 140, bp_diastolic: 90, blood_glucose: 100 }
  });
  assert(res140.some(r => r.ruleId === 'RULE_NCD_BP_HIGH'), '140/90 must trigger elevated BP rule');

  // Sub-case C: 180/110 mmHg (Exact Hypertensive Crisis boundary)
  const res180 = evaluateRules({
    screening_type: 'ncd',
    ncd: { bp_systolic: 180, bp_diastolic: 110, blood_glucose: 100 }
  });
  const severeRule = res180.find(r => r.ruleId === 'RULE_NCD_BP_CRITICAL');
  assert(severeRule, '180/110 must trigger severe critical reading rule');
  assert.strictEqual(severeRule.priority, 'high', 'Severe BP must be high priority');
});

runTest('EDGE-05', 'Fasting vs Random Glucose Threshold Disambiguation', () => {
  // Glucose = 130 mg/dL: Normal if random (< 200), but elevated if fasting (>= 126)
  const randomRes = evaluateRules({
    screening_type: 'ncd',
    ncd: { bp_systolic: 120, bp_diastolic: 80, blood_glucose: 130, sample_type: 'random' }
  });
  assert(!randomRes.some(r => r.ruleId === 'RULE_NCD_GLUCOSE_HIGH'), 'Random 130 mg/dL must NOT trigger diabetes rule');

  const fastingRes = evaluateRules({
    screening_type: 'ncd',
    ncd: { bp_systolic: 120, bp_diastolic: 80, blood_glucose: 130, sample_type: 'fasting' }
  });
  assert(fastingRes.some(r => r.ruleId === 'RULE_NCD_GLUCOSE_HIGH'), 'Fasting 130 mg/dL MUST trigger diabetes rule');
});

// ============================================================================
// CATEGORY 2: MULTILINGUAL NLP EXTRACTION & NEGATION EDGES
// ============================================================================

runTest('EDGE-06', 'Multiple Symptom Denials & Bidirectional Negations', () => {
  const text = 'मरीज को कोई सिरदर्द नहीं है, उल्टी बिल्कुल नहीं आ रही, और चक्कर भी नहीं हैं। बीपी 130/85 है।';
  const data = extractMultilingualScreeningData(text, 'ncd');
  assert.strictEqual(data.ncd.bp_systolic, 130);
  assert.strictEqual(data.ncd.bp_diastolic, 85);
  // Symptoms must NOT contain negated symptoms
  const syms = data.ncd.symptoms || [];
  assert(!syms.some(s => s.includes('सिरदर्द')), 'Negated headache must NOT be extracted');
  assert(!syms.some(s => s.includes('चक्कर')), 'Negated dizziness must NOT be extracted');
});

runTest('EDGE-07', 'Pure Devanagari Script Numerals (१६० बटा ९५, २४० mg/dL)', () => {
  const text = 'रक्तचाप १६० बटा ९५ आया और शुगर २४० दर्ज की गई।';
  const data = extractMultilingualScreeningData(text, 'ncd');
  assert.strictEqual(data.ncd.bp_systolic, 160, 'Must parse Devanagari १६० to 160');
  assert.strictEqual(data.ncd.bp_diastolic, 95, 'Must parse Devanagari ९५ to 95');
  assert.strictEqual(data.ncd.blood_glucose, 240, 'Must parse Devanagari २४० to 240');
});

runTest('EDGE-08', 'Spoken Hindi Word Numbers ("एक सौ सत्तर बटा एक सौ पांच")', () => {
  const text = 'बीपी एक सौ सत्तर बटा एक सौ पांच है, शुगर एक सौ अस्सी है';
  const data = extractMultilingualScreeningData(text, 'ncd');
  assert.strictEqual(data.ncd.bp_systolic, 170, 'Must convert spoken "एक सौ सत्तर" to 170');
  assert.strictEqual(data.ncd.bp_diastolic, 105, 'Must convert spoken "एक सौ पांच" to 105');
  assert.strictEqual(data.ncd.blood_glucose, 180, 'Must convert spoken "एक सौ अस्सी" to 180');
});

runTest('EDGE-09', 'Hinglish Colloquial Numbers & Negated Adherence ("dawa band kar di")', () => {
  const text = 'BP 155 by 92 hai aur sugar 210 hai, patient ne 5 din se dawa band kar di hai';
  const data = extractMultilingualScreeningData(text, 'ncd');
  assert.strictEqual(data.ncd.bp_systolic, 155);
  assert.strictEqual(data.ncd.bp_diastolic, 92);
  assert.strictEqual(data.ncd.blood_glucose, 210);
  assert.strictEqual(data.ncd.medication_adherence, false, 'Must detect stopped medicine as non-adherent');
});

// ============================================================================
// CATEGORY 3: MATERNAL & OBSTETRIC CLINICAL EDGE CASES
// ============================================================================

runTest('EDGE-10', 'Biological Contradiction: Pregnancy on Male Patient', () => {
  const malePatient = { name: 'राजेश (Rajesh)', age: 34, sex: 'male' };
  const pregData = {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', gestational_age_weeks: 30 }
  };
  const val = validateScreeningData(malePatient, pregData);
  assert.strictEqual(val.isValid, false);
  assert(val.issues.some(i => i.code === 'CONTRADICTION' && i.field === 'pregnancy_status'));
});

runTest('EDGE-11', 'Early Gestational Age Fetal Movement Guard (< 24 weeks)', () => {
  // Clinically, fetal movement reduction is not tracked before 24 weeks
  const earlyPregnancy = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 16,
      reduced_fetal_movement: true
    }
  };
  const rules = evaluateRules(earlyPregnancy);
  assert(!rules.some(r => r.ruleId === 'RULE_MATERNAL_FETAL_MOVEMENT'), 'Fetal movement flag must be suppressed for 16 weeks (< 24 weeks)');

  // At 32 weeks, it MUST trigger
  const latePregnancy = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 32,
      reduced_fetal_movement: true
    }
  };
  const lateRules = evaluateRules(latePregnancy);
  assert(lateRules.some(r => r.ruleId === 'RULE_MATERNAL_FETAL_MOVEMENT'), 'Fetal movement flag must trigger at 32 weeks');
});

runTest('EDGE-12', 'Unspecified Gestational Age (No 28-Week Fabrication)', () => {
  const text = 'गर्भवती महिला को सिरदर्द की शिकायत है, बीपी 120/80 है';
  const data = extractMultilingualScreeningData(text, 'pregnancy');
  assert.strictEqual(data.pregnancy.gestational_age_weeks, undefined, 'Must NOT fabricate 28 weeks default');

  const rules = evaluateRules(data);
  assert(rules.some(r => r.ruleId === 'RULE_PREG_MISSING_DATA'), 'Must trigger advisory for missing gestational age');
});

runTest('EDGE-13', 'Maternal Edema Disambiguation with BP (Isolated vs Pre-eclampsia)', () => {
  // Case A: Swelling with NORMAL BP (115/75) -> Low priority (physiological edema)
  const normalBpEdema = {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', gestational_age_weeks: 34, swelling: true },
    ncd: { bp_systolic: 115, bp_diastolic: 75 }
  };
  const rulesA = evaluateRules(normalBpEdema);
  const edemaRuleA = rulesA.find(r => r.ruleId === 'RULE_MATERNAL_EDEMA_BP');
  assert(edemaRuleA, 'Edema rule must trigger');
  assert.strictEqual(edemaRuleA.priority, 'low', 'Isolated edema with normal BP must be low priority');

  // Case B: Swelling with ELEVATED BP (150/100) -> High priority (Pre-eclampsia suspicion)
  const highBpEdema = {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', gestational_age_weeks: 34, swelling: true },
    ncd: { bp_systolic: 150, bp_diastolic: 100 }
  };
  const rulesB = evaluateRules(highBpEdema);
  const edemaRuleB = rulesB.find(r => r.ruleId === 'RULE_MATERNAL_EDEMA_BP');
  assert(edemaRuleB, 'Edema rule must trigger');
  assert.strictEqual(edemaRuleB.priority, 'high', 'Edema with high BP must be escalated to high priority');
});

// ============================================================================
// CATEGORY 4: SAFETY, MISSING DATA & ANTI-HALLUCINATION GUARDS
// ============================================================================

runTest('EDGE-14', 'Completely Empty / Missing Vitals Handling', () => {
  const emptyData = {
    screening_type: 'ncd',
    ncd: { bp_systolic: null, bp_diastolic: null, blood_glucose: null }
  };
  const rules = evaluateRules(emptyData);
  assert(rules.some(r => r.ruleId === 'RULE_NCD_MISSING_DATA'), 'Must flag missing vitals');
  assert(!rules.some(r => r.priority === 'high'), 'Empty data must never fabricate high priority');
});

runTest('EDGE-15', 'Multiple Compounding Maternal Danger Signs (Bleeding + Pain + Fever)', () => {
  const criticalPregnancy = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 32,
      vaginal_bleeding: true,
      severe_abdominal_pain: true,
      fever: true
    }
  };
  const rules = evaluateRules(criticalPregnancy);
  const highPriorityRules = rules.filter(r => r.priority === 'high');
  assert(highPriorityRules.length >= 2, 'At least 2 danger signs (bleeding + pain) must be high priority');
  assert(rules.some(r => r.ruleId === 'RULE_MATERNAL_FEVER'), 'Fever must be triggered');
  // Top sorted priority must be high
  assert.strictEqual(rules[0].priority, 'high', 'Top sorted priority must be high');
});

console.log('\n================================================================');
console.log(`EDGE CASE TEST RESULTS: ${passedCount} / ${totalCount} PASSED (${((passedCount/totalCount)*100).toFixed(0)}%)`);
console.log('================================================================\n');

if (passedCount !== totalCount) {
  process.exit(1);
}
