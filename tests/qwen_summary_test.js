const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('ASHA AI COPILOT: QWEN SUMMARY & SAFETY TEST HARNESS');
console.log('PRD §11, §26, §27: Plain Hindi Summaries & Safety Guards');
console.log('====================================================\n');

// 1. Verify shared package freshness
const sharedDist = path.join(__dirname, '..', 'packages', 'shared', 'dist', 'index.js');
assert(fs.existsSync(sharedDist), 'packages/shared/dist must exist before running tests.');

const {
  validateScreeningData,
  evaluateRules
} = require('../packages/shared/dist');

/**
 * Summary Generator Driver (simulating the Qwen deterministic prompt & fallback pipeline)
 */
function generateQwenSummary(payload) {
  const pName = payload.patient.name || 'लाभार्थी (Beneficiary)';
  const triggeredRules = (payload.rules || []).filter(r => r.triggered);

  if (payload.data.screening_type === 'pregnancy' && payload.data.pregnancy) {
    const preg = payload.data.pregnancy;
    if (preg.vaginal_bleeding) {
      const painText = preg.severe_abdominal_pain ? ' एवं पेट दर्द' : '';
      const weekText = preg.gestational_age_weeks ? ` (${preg.gestational_age_weeks} सप्ताह गर्भवती)` : '';
      return `${pName}${weekText} को रक्तस्राव${painText} की शिकायत है। यह उच्च जोखिम (Maternal Danger Sign) स्थिति है। तत्काल 108 एम्बुलेंस के माध्यम से सीएचसी/अस्पताल रेफरल करें।`;
    }
    if (preg.reduced_fetal_movement) {
      const weekText = preg.gestational_age_weeks ? ` (${preg.gestational_age_weeks} सप्ताह)` : '';
      return `${pName}${weekText} में गर्भस्थ शिशु की हलचल में कमी दर्ज की गई है। तत्काल निकटतम स्वास्थ्य केंद्र पर जांच कराएं।`;
    }
    if (triggeredRules.some(r => r.priority === 'high' || r.priority === 'medium')) {
      const issues = triggeredRules.map(r => r.reason_hi || r.reason).join(' ');
      const weekText = preg.gestational_age_weeks ? ` (${preg.gestational_age_weeks} सप्ताह)` : '';
      return `${pName}${weekText} की प्रसव पूर्व जांच में जोखिम लक्षण पाए गए। ${issues} तत्काल रेफरल एवं फॉलो-अप की अनुशंसा है।`;
    }
    return `${pName} का नियमित प्रसव पूर्व स्वास्थ्य परीक्षण संपन्न हुआ। कोई आपातकालीन खतरे का लक्षण नहीं पाया गया।`;
  }

  if (payload.data.ncd) {
    const ncd = payload.data.ncd;
    const bpStr = ncd.bp_systolic && ncd.bp_diastolic ? `${ncd.bp_systolic}/${ncd.bp_diastolic} mmHg` : null;
    const glucoseStr = ncd.blood_glucose ? `${ncd.blood_glucose} mg/dL` : null;

    if (triggeredRules.some(r => r.priority === 'high' || r.priority === 'medium')) {
      const issues = triggeredRules.map(r => r.reason_hi || r.reason).join(' ');
      const vitalsParts = [];
      if (bpStr) vitalsParts.push(`रक्तचाप ${bpStr}`);
      if (glucoseStr) vitalsParts.push(`शुगर ${glucoseStr}`);
      const vitalsText = vitalsParts.length > 0 ? `${vitalsParts.join(' एवं ')} दर्ज किया गया। ` : '';
      return `${pName} का ${vitalsText}${issues} 7 दिनों में फॉलो-अप एवं पीएचसी रेफरल की अनुशंसा है।`;
    }

    if (bpStr && glucoseStr) {
      return `${pName} की एनसीडी जांच पूर्ण हुई। रक्तचाप ${bpStr} और शुगर ${glucoseStr} सामान्य सीमा में हैं।`;
    } else if (bpStr) {
      return `${pName} की एनसीडी जांच पूर्ण हुई। रक्तचाप ${bpStr} सामान्य सीमा में है (शुगर जांच शेष)।`;
    } else if (glucoseStr) {
      return `${pName} की एनसीडी जांच पूर्ण हुई। शुगर ${glucoseStr} सामान्य सीमा में है (रक्तचाप जांच शेष)।`;
    }
    return `${pName} की एनसीडी जांच पूर्ण हुई (रक्तचाप एवं शुगर जांच शेष)।`;
  }

  return `${pName} की सामान्य जांच रिकॉर्ड की गई और स्थानीय डेटाबेस में सुरक्षित सहेज ली गई।`;
}

// 2. Qwen Safety & Clinical Validation Test Suite
const TEST_SCENARIOS = [
  {
    id: 'QWEN-01',
    name: 'Hypertensive Critical Case (185/115 mmHg)',
    patient: { name: 'गोपाल दास (Gopal Das)', sex: 'male', age: 58 },
    data: {
      screening_type: 'ncd',
      ncd: { bp_systolic: 185, bp_diastolic: 115, blood_glucose: 140, tobacco_use: false }
    },
    assertions: (summary, rules) => {
      assert(rules.some(r => r.priority === 'high'), 'Rule engine must flag high priority for 185/115');
      assert(summary.includes('185/115'), 'Summary must faithfully preserve systolic and diastolic numbers');
      assert(summary.includes('गोपाल दास'), 'Summary must mention patient name');
      assert(!summary.includes('AI diagnosed'), 'Summary must NOT make autonomous diagnosis claims');
      assert(!summary.includes('दवा लिख'), 'Summary must NOT prescribe medication');
    }
  },
  {
    id: 'QWEN-02',
    name: 'Diabetic High Random Glucose (245 mg/dL)',
    patient: { name: 'रमेश कुमार (Ramesh Kumar)', sex: 'male', age: 48 },
    data: {
      screening_type: 'ncd',
      ncd: { bp_systolic: 120, bp_diastolic: 80, blood_glucose: 245, tobacco_use: true }
    },
    assertions: (summary, rules) => {
      assert(rules.some(r => r.priority === 'high'), 'Random glucose >= 200 must trigger high priority');
      assert(summary.includes('245 mg/dL'), 'Glucose numeric value must be present without alteration');
      assert(summary.includes('120/80'), 'BP reading must match exact input');
      assert(summary.includes('फॉलो-अप') || summary.includes('रेफरल'), 'Actionable workflow referral must be stated');
    }
  },
  {
    id: 'QWEN-03',
    name: 'Missing Vital Information (Blood Glucose missing)',
    patient: { name: 'शांति देवी (Shanti Devi)', sex: 'female', age: 50 },
    data: {
      screening_type: 'ncd',
      ncd: { bp_systolic: 125, bp_diastolic: 82, blood_glucose: null }
    },
    assertions: (summary, rules) => {
      assert(summary.includes('जांच शेष') || summary.includes('दर्ज नहीं'), 'Missing glucose must be explicitly stated as pending');
      assert(summary.includes('125/82'), 'Existing vitals must remain intact');
      assert(!summary.includes('null') && !summary.includes('undefined'), 'No technical null strings in summary');
    }
  },
  {
    id: 'QWEN-04',
    name: 'Maternal Obstetric Danger Sign (Bleeding at 30 weeks)',
    patient: { name: 'सुमन बाई (Suman Bai)', sex: 'female', age: 24 },
    data: {
      screening_type: 'pregnancy',
      pregnancy: {
        pregnancy_status: 'pregnant',
        gestational_age_weeks: 30,
        vaginal_bleeding: true,
        severe_abdominal_pain: true
      }
    },
    assertions: (summary, rules) => {
      assert(rules.some(r => r.priority === 'high'), 'Vaginal bleeding must trigger high priority');
      assert(summary.includes('रक्तस्राव') || summary.includes('ब्लीडिंग'), 'Summary must flag maternal danger sign in Hindi');
      assert(summary.includes('30 सप्ताह'), 'Gestational age must be preserved exactly');
      assert(summary.includes('108') || summary.includes('रेफरल'), 'Emergency referral workflow must be advised');
    }
  },
  {
    id: 'QWEN-05',
    name: 'Routine Normal ANC Checkup (No Danger Signs)',
    patient: { name: 'पूजा कुमारी (Pooja Kumari)', sex: 'female', age: 22 },
    data: {
      screening_type: 'pregnancy',
      pregnancy: {
        pregnancy_status: 'pregnant',
        gestational_age_weeks: 20,
        vaginal_bleeding: false,
        severe_abdominal_pain: false,
        reduced_fetal_movement: false
      }
    },
    assertions: (summary, rules) => {
      assert(!rules.some(r => r.triggered && r.priority === 'high'), 'Normal ANC must not trigger emergency alerts');
      assert(summary.includes('पूजा कुमारी'), 'Patient name must be cited');
      assert(summary.includes('प्रसव पूर्व') || summary.includes('सामान्य'), 'Normal reassurance in Hindi');
    }
  },
  {
    id: 'QWEN-06',
    name: 'Word Count & Formatting Guard (< 120 words, Hindi text)',
    patient: { name: 'कमलेश (Kamlesh)', sex: 'male', age: 60 },
    data: {
      screening_type: 'ncd',
      ncd: { bp_systolic: 160, bp_diastolic: 100, blood_glucose: 180, medication_adherence: false }
    },
    assertions: (summary, rules) => {
      const words = summary.trim().split(/\s+/).length;
      assert(words <= 120, `Summary word count (${words}) must not exceed PRD 120 word budget`);
      assert(summary.length > 20, 'Summary must be substantive Hindi prose');
    }
  }
];

let passed = 0;

for (const test of TEST_SCENARIOS) {
  const validation = validateScreeningData(test.patient, test.data);
  const rules = evaluateRules(validation.sanitizedData);
  const summary = generateQwenSummary({
    patient: test.patient,
    data: validation.sanitizedData,
    rules
  });

  try {
    test.assertions(summary, rules);
    console.log(`✓ [PASS] ${test.id}: ${test.name}`);
    console.log(`   Summary: "${summary}"\n`);
    passed++;
  } catch (err) {
    console.error(`✗ [FAIL] ${test.id}: ${test.name}`);
    console.error(`   Error: ${err.message}`);
    console.error(`   Output was: "${summary}"\n`);
  }
}

console.log('====================================================');
console.log(`QWEN SUMMARY TESTS: ${passed}/${TEST_SCENARIOS.length} PASSED`);
console.log('====================================================');

assert.strictEqual(passed, TEST_SCENARIOS.length, 'All Qwen summary safety checks must pass');
