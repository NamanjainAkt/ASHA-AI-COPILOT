export type FieldState = 'known' | 'unknown' | 'uncertain' | 'not_applicable';

export interface FieldResult<T = string | number | boolean | null> {
  value: T;
  state: FieldState;
}

export const NEEDLE_SYSTEM_PROMPT =
  'You extract ASHA field-screening facts from a Hindi/Hinglish transcript into JSON. ' +
  'Rules: extract ONLY information stated or clearly implied by the transcript. ' +
  'Every field is an object {value, state} where state is known, unknown, uncertain, or not_applicable. ' +
  'Use uncertain when the transcript is ambiguous. Use not_applicable only for pregnancy fields on non-pregnant patients. ' +
  'NEVER invent numbers, names, or symptoms. Copy numeric values exactly as spoken. ' +
  'Do NOT diagnose, assess risk, or recommend treatment. Output JSON only.';

function f(description: string, type = 'string'): object {
  return {
    type: 'object',
    properties: {
      value: { type: [type, 'null'], description },
      state: { type: 'string', enum: ['known', 'unknown', 'uncertain', 'not_applicable'] },
    },
    required: ['value', 'state'],
  };
}

const COMMON_PROPERTIES = {
  patient_name: f('Beneficiary full name as spoken'),
  age_years: { ...f('Age in years', 'number') },
};

const NCD_PROPERTIES = {
  ...COMMON_PROPERTIES,
  bp_systolic: { ...f('Systolic blood pressure mmHg', 'number') },
  bp_diastolic: { ...f('Diastolic blood pressure mmHg', 'number') },
  blood_glucose: { ...f('Blood glucose mg/dL', 'number') },
  glucose_context: f('fasting, random, postprandial, or unknown'),
  tobacco_use: { ...f('Whether the patient uses tobacco', 'boolean') },
  bp_medication_missed: { ...f('Whether BP medication was missed', 'boolean') },
  symptoms: f('Free-text symptoms as spoken, comma separated'),
};

const PREGNANCY_PROPERTIES = {
  ...COMMON_PROPERTIES,
  gestational_age_weeks: { ...f('Gestational age in weeks', 'number') },
  vaginal_bleeding: { ...f('Any vaginal bleeding', 'boolean') },
  severe_abdominal_pain: { ...f('Severe abdominal pain', 'boolean') },
  headache: { ...f('Headache', 'boolean') },
  swelling_feet_face: { ...f('Swelling of feet or face', 'boolean') },
  reduced_fetal_movement: { ...f('Reduced fetal movement', 'boolean') },
  symptoms: f('Free-text symptoms as spoken, comma separated'),
};

const MEDICATION_PROPERTIES = {
  medication_names: f('Medication names as spoken, comma separated'),
  medication_adherence: f('taking_regularly, missed_doses, stopped, or unknown'),
};

const FOLLOWUP_PROPERTIES = {
  followup_needed: { ...f('Whether a follow-up visit is needed', 'boolean') },
  followup_reason: f('Reason for follow-up in transcript words'),
};

function toolFor(name: string, description: string, properties: object): object {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required: Object.keys(properties) },
    },
  };
}

export function buildNeedleTools(screeningType: 'ncd' | 'pregnancy'): string {
  const props = screeningType === 'ncd' ? NCD_PROPERTIES : PREGNANCY_PROPERTIES;
  const tools = [
    toolFor(
      'extract_screening',
      'Extract ASHA screening facts. Every field {value, state}. Never invent values.',
      { ...props, ...MEDICATION_PROPERTIES, ...FOLLOWUP_PROPERTIES }
    ),
  ];
  return JSON.stringify(tools);
}

export function validateNeedleOutput(obj: any, screeningType: 'ncd' | 'pregnancy'): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['output is not an object'] };
  const props = screeningType === 'ncd' ? NCD_PROPERTIES : PREGNANCY_PROPERTIES;
  const expected = { ...props, ...MEDICATION_PROPERTIES, ...FOLLOWUP_PROPERTIES };
  for (const key of Object.keys(expected)) {
    const field = obj[key];
    if (!field || typeof field !== 'object') {
      errors.push(`missing field object: ${key}`);
      continue;
    }
    if (!['known', 'unknown', 'uncertain', 'not_applicable'].includes(field.state)) {
      errors.push(`bad state for ${key}: ${field.state}`);
    }
    if (!('value' in field)) errors.push(`missing value for ${key}`);
  }
  return { ok: errors.length === 0, errors };
}
