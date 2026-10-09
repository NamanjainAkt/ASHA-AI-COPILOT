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
    if (preg.gestational_age_weeks && preg.reduced_fetal_movement) {
      return `${pName} (${preg.gestational_age_weeks} सप्ताह) में गर्भस्थ शिशु की हलचल में कमी दर्ज की गई है। तत्काल निकटतम स्वास्थ्य केंद्र पर जांच कराएं।`;
    }
    return `${pName} का नियमित प्रसव पूर्व स्वास्थ्य परीक्षण संपन्न हुआ। कोई आपातकालीन खतरे का लक्षण नहीं पाया गया।`;
  }

  if (data.ncd) {
    const ncd = data.ncd;
    const bpStr = ncd.bp_systolic && ncd.bp_diastolic ? `${ncd.bp_systolic}/${ncd.bp_diastolic} mmHg` : 'दर्ज नहीं';
    const glucoseStr = ncd.blood_glucose ? `${ncd.blood_glucose} mg/dL` : 'जांच शेष';

    if (triggeredRules.some(r => r.priority === 'high' || r.priority === 'medium')) {
      const issues = triggeredRules.map(r => r.reason_hi || r.reason).join(' ');
      return `${pName} का रक्तचाप ${bpStr} एवं शुगर ${glucoseStr} दर्ज किया गया। ${issues} 7 दिनों में फॉलो-अप एवं पीएचसी रेफरल की अनुशंसा है।`;
    }

    return `${pName} की एनसीडी जांच पूर्ण हुई। रक्तचाप ${bpStr} और शुगर ${glucoseStr} सामान्य सीमा में हैं।`;
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
  const inputText = args.join(' ');
  const type = inputText.toLowerCase().includes('pregnant') || inputText.includes('गर्भवती') || inputText.includes('सप्ताह') ? 'pregnancy' : 'ncd';
  processTranscript(inputText, type);
  process.exit(0);
}

// Interactive REPL if no argument
console.log('====================================================');
console.log('ASHA AI COPILOT: INTERACTIVE QWEN TERMINAL TESTER');
console.log('Type any Hindi / Hinglish / English screening sentence.');
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
