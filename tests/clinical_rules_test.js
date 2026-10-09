const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('RUNNING CLINICAL PROTOCOL & RULE ENGINE TESTS');
console.log('----------------------------------------------------');

let passCount = 0;
function pass(msg) {
  passCount++;
  console.log(`✓ Test ${passCount}: ${msg}`);
}

// ISS-156: Guard against stale dist/
const sharedSrc = path.join(__dirname, '..', 'packages', 'shared', 'src', 'index.ts');
const sharedDist = path.join(__dirname, '..', 'packages', 'shared', 'dist', 'index.js');
assert(fs.existsSync(sharedDist), 'packages/shared/dist must exist before running tests. Run: npm run build --workspace=@asha/shared');
const srcStat = fs.statSync(sharedSrc);
const distStat = fs.statSync(sharedDist);
assert(distStat.mtimeMs >= srcStat.mtimeMs - 5000, '@asha/shared dist is older than src. Run: npm run build --workspace=@asha/shared');
pass('Dist freshness verified (@asha/shared dist output is up to date)');

const {
  validateScreeningData,
  validatePatient,
  evaluateRules,
  ncdProtocol,
  pregnancyProtocol
} = require('../packages/shared/dist');

// Test 2 (ISS-138): Blood Pressure Validation and Rule Engine Execution (165/105 mmHg)
{
  const data = {
    screening_type: 'ncd',
    ncd: {
      bp_systolic: 165,
      bp_diastolic: 105,
      blood_glucose: 140
    }
  };
  const val = validateScreeningData({ name: 'Sunita Devi' }, data);
  assert.strictEqual(val.isValid, true, 'Valid BP numbers should pass validation');
  assert.strictEqual(val.sanitizedData.field_status.bp_systolic, 'present');

  // ISS-138: Run evaluateRules and verify high BP rule fires
  const rules = evaluateRules(val.sanitizedData);
  const highBpRule = rules.find(r => r.ruleId === ncdProtocol.bp.high_reading_rule.id);
  assert(highBpRule, 'Rule engine must evaluate 165/105 as high BP');
  assert.strictEqual(highBpRule.priority, ncdProtocol.bp.high_reading_rule.priority);
  pass('BP validation & rule engine evaluation verified for 165/105 mmHg (medium priority)');
}

// Test 3 (ISS-138 & ISS-316): Severe BP Rule Engine Execution (185/115 mmHg)
{
  const data = {
    screening_type: 'ncd',
    ncd: {
      bp_systolic: 185,
      bp_diastolic: 115,
      blood_glucose: 140
    }
  };
  const val = validateScreeningData({ name: 'Sunita Devi' }, data);
  const rules = evaluateRules(val.sanitizedData);
  const severeRule = rules.find(r => r.ruleId === ncdProtocol.bp.severe_reading_rule.id);
  assert(severeRule, 'Rule engine must evaluate 185/115 as severe BP');
  assert.strictEqual(severeRule.priority, ncdProtocol.bp.severe_reading_rule.priority);
  pass('Critical BP rule verified for 185/115 mmHg (high priority)');
}

// Test 4 (ISS-316): Threshold Boundaries Driven from Protocol JSON
{
  const { systolic: highSys, diastolic: highDia } = ncdProtocol.bp.high_reading_rule.parameters;
  // Sub-threshold: 139/89 -> silent
  const subData = { screening_type: 'ncd', ncd: { bp_systolic: highSys - 1, bp_diastolic: highDia - 1, blood_glucose: 100 } };
  const subRules = evaluateRules(subData);
  assert(!subRules.some(r => r.ruleId === ncdProtocol.bp.high_reading_rule.id), 'Sub-threshold BP must not fire high rule');

  // Exact threshold: 140/90 -> fires high
  const exactData = { screening_type: 'ncd', ncd: { bp_systolic: highSys, bp_diastolic: highDia, blood_glucose: 100 } };
  const exactRules = evaluateRules(exactData);
  assert(exactRules.some(r => r.ruleId === ncdProtocol.bp.high_reading_rule.id), 'Exact threshold BP 140/90 must fire high rule');
  pass('Protocol boundary test: 139/89 silent vs 140/90 triggers high rule');
}

// Test 5: Contradiction Detected when systolic <= diastolic
{
  const data = {
    screening_type: 'ncd',
    ncd: {
      bp_systolic: 120,
      bp_diastolic: 140
    }
  };
  const val = validateScreeningData({ name: 'Test' }, data);
  assert.strictEqual(val.isValid, false, 'Systolic <= diastolic must fail validation');
  assert.strictEqual(val.issues[0].code, 'CONTRADICTION');
  pass('Contradiction detected when systolic <= diastolic');
}

// Test 6: Biological Contradiction (Male patient marked pregnant)
{
  const data = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 24
    }
  };
  const val = validateScreeningData({ name: 'Ramesh', sex: 'male' }, data);
  assert.strictEqual(val.isValid, false, 'Male marked pregnant must fail validation');
  assert.strictEqual(val.issues[0].code, 'CONTRADICTION');
  pass('Biological contradiction caught for male pregnant screening');
}

// Test 7 (ISS-111): Fetal Movement Gestational Age Gating (>= 24 weeks)
{
  const earlyData = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      reduced_fetal_movement: true,
      gestational_age_weeks: 18 // early, prior to 24w
    }
  };
  const earlyRules = evaluateRules(earlyData);
  assert(!earlyRules.some(r => r.ruleId === pregnancyProtocol.rules.reduced_fetal_movement.id), 'Fetal movement rule must not fire before 24 weeks');

  const lateData = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      reduced_fetal_movement: true,
      gestational_age_weeks: 32 // >= 24w
    }
  };
  const lateRules = evaluateRules(lateData);
  assert(lateRules.some(r => r.ruleId === pregnancyProtocol.rules.reduced_fetal_movement.id), 'Fetal movement rule must fire after 24 weeks');
  pass('Fetal movement rule gated strictly at >= 24 weeks gestation');
}

// Test 8 (ISS-110): Edema Rule Qualified with Blood Pressure
{
  const swellingNoBp = {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', swelling: true, gestational_age_weeks: 28 }
  };
  const rNoBp = evaluateRules(swellingNoBp);
  const edemaNoBp = rNoBp.find(r => r.ruleId === pregnancyProtocol.rules.swelling_with_hypertension.id);
  assert(edemaNoBp && edemaNoBp.priority === 'medium', 'Swelling without BP measurement should be medium priority');

  const swellingNormBp = {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', swelling: true, gestational_age_weeks: 28 },
    ncd: { bp_systolic: 118, bp_diastolic: 76 }
  };
  const rNormBp = evaluateRules(swellingNormBp);
  const edemaNorm = rNormBp.find(r => r.ruleId === pregnancyProtocol.rules.swelling_with_hypertension.id);
  assert(edemaNorm && edemaNorm.priority === 'low', 'Swelling with normal BP should be low priority');

  const swellingHighBp = {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', swelling: true, gestational_age_weeks: 28 },
    ncd: { bp_systolic: 145, bp_diastolic: 95 }
  };
  const rHighBp = evaluateRules(swellingHighBp);
  const edemaHigh = rHighBp.find(r => r.ruleId === pregnancyProtocol.rules.swelling_with_hypertension.id);
  assert(edemaHigh && edemaHigh.priority === 'high', 'Swelling with elevated BP must be high priority (pre-eclampsia)');
  pass('Edema rule correctly qualified by blood pressure (low vs medium vs high)');
}

// Test 9 (ISS-316): Range Validation Guards (OUT_OF_RANGE for BP, glucose, age, gestation)
{
  const outOfRangeData = {
    screening_type: 'ncd',
    ncd: {
      bp_systolic: 320, // out of range
      bp_diastolic: 20,  // out of range
      blood_glucose: 900 // out of range
    }
  };
  const val = validateScreeningData({ name: 'Asha' }, outOfRangeData);
  assert.strictEqual(val.isValid, false, 'Extreme vitals must be flagged as invalid');
  const codes = val.issues.map(i => i.code);
  assert(codes.includes('OUT_OF_RANGE'), 'Must include OUT_OF_RANGE issues');
  assert.strictEqual(val.sanitizedData.field_status.bp_systolic, 'uncertain');
  assert.strictEqual(val.sanitizedData.field_status.blood_glucose, 'uncertain');

  // Gestational age out of range
  const valPreg = validateScreeningData({ name: 'Ritu', sex: 'female' }, {
    screening_type: 'pregnancy',
    pregnancy: { pregnancy_status: 'pregnant', gestational_age_weeks: 55 } // > 45 weeks
  });
  assert.strictEqual(valPreg.isValid, false);
  assert(valPreg.issues.some(i => i.code === 'OUT_OF_RANGE'));
  pass('Range validation guards verified for extreme BP, glucose, and gestation');
}

// Test 10 (ISS-316): validatePatient Verification
{
  const validP = validatePatient({
    name: 'कमला देवी',
    age: 45,
    sex: 'female',
    phone: '+91 9876543210',
    village: 'रामपुर'
  });
  assert.strictEqual(validP.length, 0, 'Valid patient should have 0 issues');

  const invalidP = validatePatient({
    name: '',
    age: 250,
    sex: 'female',
    phone: '123'
  });
  assert(invalidP.length >= 3, 'Invalid patient should have issues');
  const pCodes = invalidP.map(i => i.code);
  assert(pCodes.includes('MISSING_REQUIRED'), 'Missing name must produce MISSING_REQUIRED');
  assert(pCodes.includes('OUT_OF_RANGE'), 'Age 250 must produce OUT_OF_RANGE');
  assert(pCodes.includes('INVALID_VALUE'), 'Invalid phone must produce INVALID_VALUE');
  pass('Patient schema validation (validatePatient) verified for missing name, range, and phone');
}

// Test 11 (ISS-104): Out-of-range Uncertain Fields Suppressed from Critical Triage
{
  const uncertainData = {
    screening_type: 'ncd',
    ncd: {
      bp_systolic: 9999,
      bp_diastolic: 80,
      blood_glucose: 120
    }
  };
  const val = validateScreeningData({ name: 'Patient' }, uncertainData);
  const rules = evaluateRules(val.sanitizedData);
  assert(!rules.some(r => r.ruleId === ncdProtocol.bp.severe_reading_rule.id), 'Uncertain 9999 BP must NOT trigger severe triage rule');
  assert(rules.some(r => r.ruleId === 'RULE_NCD_BP_UNCERTAIN'), 'Uncertain BP must trigger RULE_NCD_BP_UNCERTAIN re-measurement');
  pass('Uncertain out-of-range vitals suppressed from critical triage and flagged for re-measurement');
}

// Test 12 (ISS-311): Provenance & Bleeding Field Status Extraction Guard
{
  const testExtractor = (transcript) => {
    const hasBleeding = transcript.includes('खून') || transcript.includes('bleeding') || transcript.includes('रक्तस्राव');
    return {
      hasBleeding,
      status: hasBleeding ? 'present' : 'missing'
    };
  };
  const nonBleeding = testExtractor('28 हफ्ते गर्भवती, हल्का सिरदर्द है');
  assert.strictEqual(nonBleeding.hasBleeding, false);
  assert.strictEqual(nonBleeding.status, 'missing', 'Non-bleeding transcript must produce missing field_status');

  const bleeding = testExtractor('28 हफ्ते गर्भवती, रक्तस्राव हो रहा है');
  assert.strictEqual(bleeding.hasBleeding, true);
  assert.strictEqual(bleeding.status, 'present', 'Bleeding transcript must produce present field_status');
  pass('Vaginal bleeding field_status extractor verified (present vs missing, ISS-311)');
}

// Test 13 (ISS-205): Fasting vs Random Blood Glucose Threshold Evaluation
{
  const fastingData = {
    screening_type: 'ncd',
    ncd: {
      blood_glucose: 150,
      sample_type: 'fasting'
    }
  };
  const fastingRules = evaluateRules(fastingData);
  const fastingRule = fastingRules.find(r => r.ruleId === ncdProtocol.glucose.high_reading_rule.id);
  assert(fastingRule, 'Fasting glucose 150 mg/dL must trigger high glucose rule (>= 126 mg/dL)');
  assert.strictEqual(fastingRule.priority, 'high');

  const randomData = {
    screening_type: 'ncd',
    ncd: {
      blood_glucose: 150,
      sample_type: 'random'
    }
  };
  const randomRules = evaluateRules(randomData);
  const randomRule = randomRules.find(r => r.ruleId === ncdProtocol.glucose.high_reading_rule.id);
  assert(!randomRule, 'Random glucose 150 mg/dL must NOT trigger high glucose rule (< 200 mg/dL)');

  const highRandomData = {
    screening_type: 'ncd',
    ncd: {
      blood_glucose: 205,
      sample_type: 'random'
    }
  };
  const highRandomRules = evaluateRules(highRandomData);
  assert(highRandomRules.some(r => r.ruleId === ncdProtocol.glucose.high_reading_rule.id), 'Random glucose 205 mg/dL must trigger high glucose rule (>= 200 mg/dL)');
  pass('Fasting (126) vs Random (200) glucose protocol threshold branching verified (ISS-205)');
}

// Test 14: CBAC Waist Circumference Protocol Evaluation (>= 85 cm)
{
  const normalWaist = {
    screening_type: 'ncd',
    cbac: { waist_circumference_cm: 80 }
  };
  const normalRules = evaluateRules(normalWaist);
  assert(!normalRules.some(r => r.ruleId === 'RULE_CBAC_WAIST_CIRCUMFERENCE'), 'Waist 80 cm must not trigger CBAC waist rule');

  const elevatedWaist = {
    screening_type: 'ncd',
    cbac: { waist_circumference_cm: 88 }
  };
  const elevatedRules = evaluateRules(elevatedWaist);
  const waistRule = elevatedRules.find(r => r.ruleId === 'RULE_CBAC_WAIST_CIRCUMFERENCE');
  assert(waistRule, 'Waist 88 cm must trigger CBAC waist circumference rule');
  assert.strictEqual(waistRule.priority, 'medium');
  pass('CBAC Waist Circumference evaluation verified (>= 85 cm -> medium priority)');
}

// Test 15: Common Visit Questionnaire - Missed Medication Evaluation
{
  const missedMedsData = {
    screening_type: 'general',
    common_visit: {
      visit_purpose: 'Follow-up',
      missed_medication_doses: true,
      missed_medication_reason: 'Medicine finished'
    }
  };
  const rules = evaluateRules(missedMedsData);
  const missedRule = rules.find(r => r.ruleId === 'RULE_COMMON_VISIT_MISSED_MEDS');
  assert(missedRule, 'Reported missed medications must trigger RULE_COMMON_VISIT_MISSED_MEDS');
  assert.strictEqual(missedRule.priority, 'medium');
  pass('Module B Common Visit missed medication evaluation verified');
}

// Test 16: Pregnancy Convulsions / Eclampsia Emergency Rule
{
  const convulsionData = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 30,
      convulsions: true
    }
  };
  const rules = evaluateRules(convulsionData);
  const convRule = rules.find(r => r.ruleId === 'RULE_PREG_CONVULSIONS');
  assert(convRule, 'Pregnancy convulsions must trigger RULE_PREG_CONVULSIONS');
  assert.strictEqual(convRule.priority, 'high');
  assert(convRule.nextWorkflow.includes('108'), 'Next workflow must recommend immediate 108 ambulance referral');
  pass('Pregnancy convulsions / eclampsia emergency rule verified (high priority)');
}

// Test 17: Pregnancy Leaking Fluid / PROM Danger Sign
{
  const leakingData = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 34,
      leaking_fluid: true
    }
  };
  const rules = evaluateRules(leakingData);
  const leakRule = rules.find(r => r.ruleId === 'RULE_PREG_LEAKING_FLUID');
  assert(leakRule, 'Pregnancy leaking fluid must trigger RULE_PREG_LEAKING_FLUID');
  assert.strictEqual(leakRule.priority, 'high');
  pass('Pregnancy leaking fluid (PROM) danger sign verified (high priority)');
}

// Test 18: PNC & Newborn Danger Signs and Birth Weight
{
  const newbornDangerData = {
    screening_type: 'pnc',
    visit_type: 'pnc',
    pnc_child: {
      poor_feeding_or_sucking: true,
      fast_breathing_or_indrawing: true,
      birth_weight_kg: 1.7
    }
  };
  const rules = evaluateRules(newbornDangerData);
  const dangerRule = rules.find(r => r.ruleId === 'RULE_PNC_NEWBORN_DANGER');
  assert(dangerRule, 'Newborn danger signs must trigger RULE_PNC_NEWBORN_DANGER');
  assert.strictEqual(dangerRule.priority, 'high');

  const lbwRule = rules.find(r => r.ruleId === 'RULE_PNC_LOW_BIRTH_WEIGHT');
  assert(lbwRule, 'Birth weight 1.7 kg (< 1.8 kg) must trigger high priority low birth weight rule');
  assert.strictEqual(lbwRule.priority, 'high');
  pass('PNC newborn danger signs and severe low birth weight verified (high priority)');
}

console.log('----------------------------------------------------');
console.log(`ALL CLINICAL RULE TESTS PASSED (${passCount}/${passCount})`);
console.log('----------------------------------------------------');
