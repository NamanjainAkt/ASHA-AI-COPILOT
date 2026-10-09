#!/usr/bin/env node

const path = require('path');
const readline = require('readline');
const {
  extractMultilingualScreeningData,
  validateScreeningData,
  evaluateRules
} = require('../packages/shared/dist');

function formatSummary(patient, data, rules) {
  const pName = patient.name || 'लाभार्थी (Beneficiary)';
  const triggeredRules = (rules || []).filter(r => r.triggered);

  if (data.screening_type === 'pregnancy' && data.pregnancy) {
    const preg = data.pregnancy;
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

  if (data.ncd) {
    const ncd = data.ncd;
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

  return `${pName} की सामान्य जांच रिकॉर्ड की गई।`;
}

function processTranscript(text, type = 'ncd', patientName = 'सुनीता देवी (Sunita Devi)', age = 45, sex = 'female') {
  console.log('\n------------------------------------------------------------');
  console.log(`[INPUT TEXT]       : "${text}"`);
  console.log(`[PATIENT]          : ${patientName}, ${age} yrs, ${sex}`);
  console.log(`[SCREENING TYPE]   : ${type.toUpperCase()}`);
  console.log('------------------------------------------------------------');

  // 1. Structured extraction
  const rawExtraction = extractMultilingualScreeningData(text, type);
  console.log('\n1. [EXTRACTED JSON]:');
  console.log(JSON.stringify(rawExtraction, null, 2));

  // 2. Validation
  const patient = { name: patientName, age, sex };
  const validation = validateScreeningData(patient, rawExtraction);
  console.log('\n2. [VALIDATION STATUS]:', validation.isValid ? 'VALID' : 'ISSUES DETECTED');
  if (validation.issues.length > 0) {
    console.log('   Issues:', validation.issues);
  }

  // 3. Deterministic Rules
  const rules = evaluateRules(validation.sanitizedData);
  const triggered = rules.filter(r => r.triggered);
  console.log(`\n3. [RULE ENGINE EVALUATION] (${triggered.length} triggered):`);
  triggered.forEach(r => {
    console.log(`   • [${r.priority.toUpperCase()}] ${r.ruleName}: ${r.reason_hi || r.reason}`);
    console.log(`     Next Workflow: ${r.nextWorkflow}`);
  });

  // 4. Qwen Summary
  const summary = formatSummary(patient, validation.sanitizedData, rules);
  console.log('\n4. [QWEN GENERATED HINDI SUMMARY]:');
  console.log(`   "${summary}"`);
  console.log('------------------------------------------------------------\n');
}

// Check if CLI argument was provided
const args = process.argv.slice(2);
if (args.length > 0) {
  if (args[0] === '--edge-cases' || args[0] === '--test-all') {
    const edgeCases = [
      { text: "बीपी 280 बटा 170 है, शुगर 120", type: "ncd", patient: "राम लाल", age: 60, sex: "male" },
      { text: "बीपी 80 बटा 120 है, शुगर 110", type: "ncd", patient: "मीना", age: 40, sex: "female" },
      { text: "बीपी 125 बटा 82 है, शुगर 680 दर्ज हुआ", type: "ncd", patient: "सुरेश", age: 52, sex: "male" },
      { text: "बीपी 140 बटा 90 है", type: "ncd", patient: "कमलेश", age: 49, sex: "male" },
      { text: "फास्टिंग शुगर 130 है, बीपी 120/80", type: "ncd", patient: "दिनेश", age: 45, sex: "male" },
      { text: "मरीज को कोई सिरदर्द नहीं है, उल्टी बिल्कुल नहीं आ रही, चक्कर भी नहीं। बीपी 130/85", type: "ncd", patient: "शांति", age: 50, sex: "female" },
      { text: "रक्तचाप १६० बटा ९५ आया और शुगर २४० दर्ज की गई", type: "ncd", patient: "मदन", age: 55, sex: "male" },
      { text: "बीपी एक सौ सत्तर बटा एक सौ पांच है, शुगर एक सौ अस्सी है", type: "ncd", patient: "लीला", age: 62, sex: "female" },
      { text: "BP 155 by 92 hai aur sugar 210 hai, patient ne 5 din se dawa band kar di hai", type: "ncd", patient: "राजेश", age: 48, sex: "male" },
      { text: "गर्भवती महिला को सिरदर्द है, बीपी 120/80", type: "pregnancy", patient: "पूजा", age: 24, sex: "female" },
      { text: "32 सप्ताह गर्भवती, रक्तस्राव और पेट में दर्द है", type: "pregnancy", patient: "सुमन बाई", age: 26, sex: "female" },
      { text: "30 सप्ताह गर्भवती, शिशु की हलचल में कमी महसूस हो रही है", type: "pregnancy", patient: "रेखा", age: 28, sex: "female" }
    ];
    console.log(`\n>>> RUNNING ${edgeCases.length} CLINICAL EDGE CASES THROUGH QWEN CLI <<<\n`);
    edgeCases.forEach((c, idx) => {
      console.log(`\n================ CASE ${idx + 1}/${edgeCases.length} ================`);
      processTranscript(c.text, c.type, c.patient, c.age, c.sex);
    });
    console.log(`\n>>> COMPLETED ${edgeCases.length} EDGE CASES IN QWEN CLI <<<\n`);
    process.exit(0);
  }
  const inputText = args.join(' ');
  const type = inputText.toLowerCase().includes('pregnant') || inputText.includes('गर्भवती') || inputText.includes('सप्ताह') ? 'pregnancy' : 'ncd';
  processTranscript(inputText, type);
  process.exit(0);
}

// Interactive REPL if no argument
console.log('====================================================');
console.log('ASHA AI COPILOT: INTERACTIVE QWEN TERMINAL TESTER');
console.log('Type any Hindi / Hinglish / English screening sentence.');
console.log('Or run: node tests/qwen_cli.js --edge-cases');
console.log('Type "exit" or press Ctrl+C to quit.');
console.log('====================================================\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptUser() {
  rl.question('Enter screening text > ', (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === 'exit') {
      console.log('Exiting tester.');
      rl.close();
      return;
    }
    const type = trimmed.toLowerCase().includes('pregnant') || trimmed.includes('गर्भवती') || trimmed.includes('सप्ताह') ? 'pregnancy' : 'ncd';
    processTranscript(trimmed, type);
    promptUser();
  });
}

promptUser();
