/**
 * Multilingual Clinical NLP Extractor (Hindi, Hinglish, English)
 * 
 * Extracts structured NCD and Pregnancy screening entities from conversational,
 * code-mixed transcripts spoken by frontline ASHA community workers.
 */

import { ScreeningType, StructuredScreeningData } from '../types';
import { normalizeClinicalNumbers } from './numberNormalizer';

export interface ExtractorOptions {
  referenceDate?: string;
}

/**
 * Checks if a phrase is negated in the immediate vicinity (e.g. "no bleeding", "खून नहीं").
 */
function isNegated(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  const termLower = term.toLowerCase();
  const idx = lower.indexOf(termLower);
  if (idx === -1) return false;

  // Window before term
  const prefix = lower.substring(Math.max(0, idx - 25), idx);
  // Window after term
  const suffix = lower.substring(idx + termLower.length, Math.min(lower.length, idx + termLower.length + 25));

  // Negation keywords in Hindi, Hinglish, English
  const negBefore = /(?:no|not|without|nahi|nahin|na|bilkul\s+nahi|koi\s+nahi|kabhi\s+nahi|नहीं|ना|बिना)\s*$/i;
  const negAfter = /^\s*(?:bilkul\s+|kabhi\s+|bhi\s+|भी\s+|बिल्कुल\s+)?(?:nahi|nahin|na|nahi\s+hai|nahin\s+hai|not|never|नहीं|नहीं\s+है|ना)/i;

  return negBefore.test(prefix.trim()) || negAfter.test(suffix.trim());
}

/**
 * Extracts Blood Pressure readings (systolic / diastolic) with code-mixing support.
 */
function extractBloodPressure(normalizedText: string): { systolic: number | null; diastolic: number | null } {
  // 1. Explicit separator: "165/105", "165 बटा 105", "165 by 105", "165 over 105", "165 aur 105"
  const explicitBpRegex = /(?:बीपी|bp|blood\s+pressure|रक्तचाप)?\s*[:\s]?\s*(\d{2,3})\s*(?:\/|बटा|by|over|-|aur|\band\b)\s*(\d{2,3})/i;
  const match = normalizedText.match(explicitBpRegex);

  if (match) {
    const sys = parseInt(match[1], 10);
    const dia = parseInt(match[2], 10);
    if (sys >= 60 && sys <= 300 && dia >= 30 && dia <= 200 && sys > dia) {
      return { systolic: sys, diastolic: dia };
    }
  }

  // 2. Space separated after BP trigger: e.g. "बीपी 165 105" or "BP 165 105"
  const spaceBpRegex = /(?:बीपी|bp|blood\s+pressure|रक्तचाप)\s*[:\s]?\s*(\d{2,3})\s+(\d{2,3})\b/i;
  const spaceMatch = normalizedText.match(spaceBpRegex);
  if (spaceMatch) {
    const sys = parseInt(spaceMatch[1], 10);
    const dia = parseInt(spaceMatch[2], 10);
    if (sys >= 60 && sys <= 300 && dia >= 30 && dia <= 200 && sys > dia) {
      return { systolic: sys, diastolic: dia };
    }
  }

  return { systolic: null, diastolic: null };
}

/**
 * Extracts Blood Glucose reading.
 */
function extractBloodGlucose(normalizedText: string): { glucose: number | null; isFasting: boolean } {
  const isFasting = /(?:फास्टिंग|खाली\s+पेट|fasting|empty\s+stomach)/i.test(normalizedText);

  // Pattern: "शुगर 142", "sugar 142", "glucose 142", "142 mg/dl", "रैंडम शुगर 245"
  const glucoseRegexes = [
    /(?:शुगर|sugar|glucose|रक्त\s+शर्करा|आरबीएस|rbs|fbs)\s*(?:स्तर|level|है|hai|was)?\s*[:\s]?\s*(\d{2,3})/i,
    /(\d{2,3})\s*(?:शुगर|sugar|glucose|mg\s*\/?\s*dl)/i
  ];

  for (const reg of glucoseRegexes) {
    const match = normalizedText.match(reg);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= 20 && val <= 700) {
        return { glucose: val, isFasting };
      }
    }
  }

  return { glucose: null, isFasting };
}

/**
 * Extracts Gestational Age in weeks without hardcoding fallback defaults.
 */
function extractGestationalWeeks(normalizedText: string): number | null {
  // Weeks pattern: "28 हफ्ते", "28 सप्ताह", "28 weeks", "28 week"
  const weeksRegex = /(\d{1,2})\s*(?:हफ्ते|सप्ताह|हफ़्ते|week|weeks|hafte|saptaah)/i;
  const match = normalizedText.match(weeksRegex);
  if (match) {
    const weeks = parseInt(match[1], 10);
    if (weeks >= 1 && weeks <= 45) {
      return weeks;
    }
  }

  // Months conversion: e.g. "7 महीने" -> ~28-30 weeks
  const monthsRegex = /(\d{1,2})\s*(?:महीने|महीना|month|months|mahine)/i;
  const monthMatch = normalizedText.match(monthsRegex);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    if (months >= 1 && months <= 9) {
      return Math.round(months * 4.3);
    }
  }

  return null;
}

/**
 * Detects presence of a clinical sign, respecting negation.
 */
function hasClinicalSign(text: string, triggers: string[]): boolean {
  for (const trigger of triggers) {
    if (text.toLowerCase().includes(trigger.toLowerCase())) {
      if (!isNegated(text, trigger)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Main Multilingual Entity Extraction Function.
 */
export function extractMultilingualScreeningData(
  rawTranscript: string,
  schemaType: ScreeningType,
  options: ExtractorOptions = {}
): StructuredScreeningData {
  const todayStr = options.referenceDate || new Date().toISOString().split('T')[0];
  const normalizedText = normalizeClinicalNumbers(rawTranscript);

  // Pregnancy determination: explicitly pregnancy type, or explicit pregnancy keywords
  const isPregnancy =
    schemaType === 'pregnancy' ||
    /(?:गर्भवती|गर्भावस्था|pregnant|pregnancy|garbhvati|pet\s+se\s+hai)/i.test(normalizedText);

  if (isPregnancy) {
    const weeks = extractGestationalWeeks(normalizedText);

    // Danger signs extraction with negation handling
    const hasBleeding = hasClinicalSign(normalizedText, [
      'खून', 'रक्तस्राव', 'bleeding', 'blood', 'khoon'
    ]);

    const hasHeadache = hasClinicalSign(normalizedText, [
      'सिरदर्द', 'सिर में तेज दर्द', 'सिर में भारीपन', 'headache', 'severe headache', 'sar dard', 'sir dard'
    ]);

    const hasAbdominalPain = hasClinicalSign(normalizedText, [
      'पेट दर्द', 'पेट में तेज दर्द', 'पेट में दर्द', 'severe abdominal pain', 'cramps', 'pet dard', 'pait me dard'
    ]);

    const hasBlurredVision = hasClinicalSign(normalizedText, [
      'धुंधला', 'धुंधला दिखना', 'blurred vision', 'dhundhla', 'aankhon ke aage andhera'
    ]);

    const hasReducedMovement = hasClinicalSign(normalizedText, [
      'हलचल कम', 'कम हलचल', 'हलचल में कमी', 'शिशु की हलचल कम', 'fetal movement', 'reduced movement', 'movement kam', 'halchal kam'
    ]);

    const hasSwelling = hasClinicalSign(normalizedText, [
      'सूजन', 'swelling', 'edema', 'pairon me sujan', 'hath pair me sujan'
    ]);

    const hasFever = hasClinicalSign(normalizedText, [
      'बुखार', 'fever', 'bukhar', 'tapman'
    ]);

    const bp = extractBloodPressure(normalizedText);

    const followUpRequired =
      hasBleeding ||
      hasHeadache ||
      hasAbdominalPain ||
      hasBlurredVision ||
      hasReducedMovement ||
      hasSwelling ||
      (bp.systolic !== null && bp.systolic >= 140);

    const ncdVitals = (bp.systolic !== null || bp.diastolic !== null) ? {
      bp_systolic: bp.systolic !== null ? bp.systolic : undefined,
      bp_diastolic: bp.diastolic !== null ? bp.diastolic : undefined,
      measurement_date: todayStr
    } : undefined;

    const missingSafetyPrompts: string[] = [];
    if (bp.systolic !== null && bp.systolic >= 140 && !hasHeadache && !hasBlurredVision) {
      missingSafetyPrompts.push('क्या मरीज को सिरदर्द, आंखों में धुंधलापन या पेट दर्द है?');
    }
    if (weeks !== null && weeks >= 24 && !hasReducedMovement && !normalizedText.includes('हलचल')) {
      missingSafetyPrompts.push('क्या शिशु की हलचल सामान्य महसूस हो रही है?');
    }

    return {
      screening_type: 'pregnancy',
      visit_type: 'pregnancy',
      common_visit: {
        visit_purpose: 'scheduled_anc',
        main_complaint: hasBleeding ? 'रक्तस्राव (Bleeding)' : hasHeadache ? 'सिरदर्द (Headache)' : undefined
      },
      pregnancy: {
        pregnancy_status: 'pregnant',
        gestational_age_weeks: weeks !== null ? weeks : undefined,
        vaginal_bleeding: hasBleeding,
        severe_headache: hasHeadache,
        blurred_vision: hasBlurredVision,
        severe_abdominal_pain: hasAbdominalPain,
        reduced_fetal_movement: hasReducedMovement,
        swelling: hasSwelling,
        fever: hasFever,
        follow_up_required: followUpRequired
      },
      ncd: ncdVitals,
      field_status: {
        pregnancy_status: 'present',
        gestational_age_weeks: weeks !== null ? 'present' : 'missing',
        vaginal_bleeding: hasBleeding ? 'present' : 'missing',
        severe_headache: hasHeadache ? 'present' : 'missing',
        blurred_vision: hasBlurredVision ? 'present' : 'missing',
        severe_abdominal_pain: hasAbdominalPain ? 'present' : 'missing',
        reduced_fetal_movement: hasReducedMovement ? 'present' : 'missing',
        swelling: hasSwelling ? 'present' : 'missing',
        fever: hasFever ? 'present' : 'missing',
        bp_systolic: bp.systolic !== null ? 'present' : 'missing',
        bp_diastolic: bp.diastolic !== null ? 'present' : 'missing'
      },
      field_provenance: {
        pregnancy_status: 'worker_spoken_input',
        gestational_age_weeks: weeks !== null ? 'worker_spoken_input' : 'not_asked',
        bp_systolic: bp.systolic !== null ? 'worker_spoken_input' : 'not_asked',
        bp_diastolic: bp.diastolic !== null ? 'worker_spoken_input' : 'not_asked'
      },
      missing_safety_prompts: missingSafetyPrompts
    };
  }

  // NCD Screening
  const bp = extractBloodPressure(normalizedText);
  const glucose = extractBloodGlucose(normalizedText);

  // Symptoms and history
  const hasHeadache = hasClinicalSign(normalizedText, [
    'सिरदर्द', 'सिर में भारीपन', 'headache', 'sar dard', 'sir dard'
  ]);
  const hasDizziness = hasClinicalSign(normalizedText, [
    'चक्कर', 'चक्कर आना', 'dizziness', 'giddiness', 'chakkar'
  ]);
  const hasChestPain = hasClinicalSign(normalizedText, [
    'सीने में दर्द', 'छाती में दर्द', 'chest pain'
  ]);

  const symptoms: string[] = [];
  if (hasHeadache) symptoms.push('सिरदर्द (headache)');
  if (hasDizziness) symptoms.push('चक्कर आना (dizziness)');
  if (hasChestPain) symptoms.push('सीने में दर्द (chest pain)');

  // Known conditions
  const hasKnownHypertension = hasClinicalSign(normalizedText, [
    'उच्च रक्तचाप', 'बीपी की बीमारी', 'hypertension', 'bp ki bimari', 'purana bp'
  ]) || (bp.systolic !== null && bp.systolic >= 140);

  const hasKnownDiabetes = hasClinicalSign(normalizedText, [
    'मधुमेह', 'शुगर की बीमारी', 'diabetes', 'sugar ki bimari'
  ]);

  // Medication adherence (default true unless stated missed/stopped)
  const hasMissedMeds = hasClinicalSign(normalizedText, [
    'दवा नहीं', 'गोली नहीं', 'दवा छूट', 'छूट गई', 'बंद कर दी',
    'missed medication', 'stopped medicines', 'dawa nahi li', 'dawa band', 'goli band',
    'dawa miss', 'goli miss', 'missed', 'chhut gayi', 'nahin le rahe'
  ]);

  // Lifestyle
  const hasTobacco = hasClinicalSign(normalizedText, [
    'तम्बाकू', 'बीड़ी', 'सिगरेट', 'गुटखा', 'खैनी', 'tobacco', 'smoking', 'bidi', 'gutkha'
  ]);
  const hasAlcohol = hasClinicalSign(normalizedText, [
    'शराब', 'दारू', 'alcohol', 'drinking'
  ]);

  const missingSafetyPrompts: string[] = [];
  if ((bp.systolic !== null && bp.systolic >= 140) || (bp.diastolic !== null && bp.diastolic >= 90)) {
    if (!hasHeadache && !hasChestPain) {
      missingSafetyPrompts.push('क्या मरीज को अभी तेज सिरदर्द, सीने में दर्द, सांस लेने में परेशानी या कोई अन्य गंभीर लक्षण है?');
    }
  }
  if (glucose.glucose !== null && glucose.glucose >= 200) {
    missingSafetyPrompts.push('क्या मरीज को अत्यधिक प्यास, बार-बार पेशाब या अत्यधिक थकान महसूस हो रही है?');
  }

  return {
    screening_type: 'ncd',
    visit_type: 'ncd',
    common_visit: {
      visit_purpose: 'ncd_screening',
      main_complaint: symptoms.length > 0 ? symptoms[0] : undefined,
      known_conditions: [
        ...(hasKnownHypertension ? ['hypertension'] : []),
        ...(hasKnownDiabetes ? ['diabetes'] : [])
      ],
      current_medications: (hasKnownHypertension || hasKnownDiabetes) ? (hasMissedMeds ? 'दवा अनियमित/छूट गई' : 'नियमित दवा') : undefined,
      missed_medication_doses: hasMissedMeds
    },
    ncd: {
      bp_systolic: bp.systolic !== null ? bp.systolic : undefined,
      bp_diastolic: bp.diastolic !== null ? bp.diastolic : undefined,
      blood_glucose: glucose.glucose !== null ? glucose.glucose : undefined,
      sample_type: glucose.isFasting ? 'fasting' : 'random',
      tobacco_use: hasTobacco,
      alcohol_use: hasAlcohol,
      known_hypertension: hasKnownHypertension,
      known_diabetes: hasKnownDiabetes,
      medication_adherence: !hasMissedMeds,
      symptoms,
      measurement_date: todayStr
    },
    field_status: {
      bp_systolic: bp.systolic !== null ? 'present' : 'missing',
      bp_diastolic: bp.diastolic !== null ? 'present' : 'missing',
      blood_glucose: glucose.glucose !== null ? 'present' : 'missing',
      known_hypertension: 'present',
      known_diabetes: 'present',
      medication_adherence: 'present'
    },
    field_provenance: {
      bp_systolic: bp.systolic !== null ? 'worker_spoken_input' : 'not_asked',
      bp_diastolic: bp.diastolic !== null ? 'worker_spoken_input' : 'not_asked',
      blood_glucose: glucose.glucose !== null ? 'worker_spoken_input' : 'not_asked',
      medication_adherence: 'worker_spoken_input'
    },
    missing_safety_prompts: missingSafetyPrompts
  };
}
