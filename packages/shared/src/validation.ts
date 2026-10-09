import { Patient, StructuredScreeningData } from './types';

export interface ValidationIssue {
  field: string;
  code: 'INVALID_VALUE' | 'OUT_OF_RANGE' | 'CONTRADICTION' | 'MISSING_REQUIRED' | 'UNCERTAIN';
  message: string;
  message_hi: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  sanitizedData: StructuredScreeningData;
}

export function validatePatient(patient: Partial<Patient>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!patient.name || patient.name.trim().length === 0) {
    issues.push({
      field: 'name',
      code: 'MISSING_REQUIRED',
      message: 'Patient name is mandatory',
      message_hi: 'मरीज का नाम अनिवार्य है'
    });
  }

  if (patient.age !== undefined && patient.age !== null) {
    if (isNaN(patient.age) || patient.age < 0 || patient.age > 120) {
      issues.push({
        field: 'age',
        code: 'OUT_OF_RANGE',
        message: 'Age must be between 0 and 120 years',
        message_hi: 'उम्र 0 से 120 वर्ष के बीच होनी चाहिए'
      });
    }
  }

  if (patient.phone && patient.phone.trim().length > 0) {
    const cleaned = patient.phone.replace(/[\s-]/g, '');
    if (!/^\+?[0-9]{10,13}$/.test(cleaned)) {
      issues.push({
        field: 'phone',
        code: 'INVALID_VALUE',
        message: 'Phone number must be a valid 10-digit number',
        message_hi: 'फ़ोन नंबर 10 अंकों का होना चाहिए'
      });
    }
  }

  return issues;
}

export function validateScreeningData(
  patient: Partial<Patient>,
  data: StructuredScreeningData
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sanitized = JSON.parse(JSON.stringify(data)) as StructuredScreeningData;
  sanitized.field_status = sanitized.field_status || {};

  // NCD Validation
  if (sanitized.ncd) {
    const ncd = sanitized.ncd;

    // Blood Pressure validation
    if (ncd.bp_systolic !== undefined && ncd.bp_systolic !== null) {
      if (isNaN(ncd.bp_systolic) || ncd.bp_systolic < 50 || ncd.bp_systolic > 260) {
        issues.push({
          field: 'bp_systolic',
          code: 'OUT_OF_RANGE',
          message: `Systolic BP (${ncd.bp_systolic}) is outside plausible clinical range (50-260 mmHg)`,
          message_hi: `सिस्टोलिक बीपी (${ncd.bp_systolic}) असामान्य सीमा में है`
        });
        sanitized.field_status['bp_systolic'] = 'uncertain';
        sanitized.ncd.bp_systolic = null;
      } else {
        sanitized.field_status['bp_systolic'] = 'present';
      }
    } else {
      sanitized.field_status['bp_systolic'] = 'missing';
    }

    if (ncd.bp_diastolic !== undefined && ncd.bp_diastolic !== null) {
      if (isNaN(ncd.bp_diastolic) || ncd.bp_diastolic < 30 || ncd.bp_diastolic > 160) {
        issues.push({
          field: 'bp_diastolic',
          code: 'OUT_OF_RANGE',
          message: `Diastolic BP (${ncd.bp_diastolic}) is outside plausible clinical range (30-160 mmHg)`,
          message_hi: `डायस्टोलिक बीपी (${ncd.bp_diastolic}) असामान्य सीमा में है`
        });
        sanitized.field_status['bp_diastolic'] = 'uncertain';
        sanitized.ncd.bp_diastolic = null;
      } else {
        sanitized.field_status['bp_diastolic'] = 'present';
      }
    } else {
      sanitized.field_status['bp_diastolic'] = 'missing';
    }

    // BP Systolic vs Diastolic relationship
    if (
      ncd.bp_systolic &&
      ncd.bp_diastolic &&
      ncd.bp_systolic <= ncd.bp_diastolic
    ) {
      issues.push({
        field: 'blood_pressure',
        code: 'CONTRADICTION',
        message: 'Systolic BP must be greater than diastolic BP',
        message_hi: 'सिस्टोलिक रक्तचाप डायस्टोलिक रक्तचाप से अधिक होना चाहिए'
      });
      sanitized.field_status['blood_pressure'] = 'uncertain';
      sanitized.ncd.bp_systolic = null;
      sanitized.ncd.bp_diastolic = null;
    }

    // Blood Glucose validation
    if (ncd.blood_glucose !== undefined && ncd.blood_glucose !== null) {
      if (isNaN(ncd.blood_glucose) || ncd.blood_glucose < 30 || ncd.blood_glucose > 600) {
        issues.push({
          field: 'blood_glucose',
          code: 'OUT_OF_RANGE',
          message: `Blood glucose (${ncd.blood_glucose} mg/dL) is outside plausible screening range (30-600 mg/dL)`,
          message_hi: `ब्लड शुगर रीडिंग (${ncd.blood_glucose} mg/dL) असामान्य है`
        });
        sanitized.field_status['blood_glucose'] = 'uncertain';
        sanitized.ncd.blood_glucose = null;
      } else {
        sanitized.field_status['blood_glucose'] = 'present';
      }
    } else {
      sanitized.field_status['blood_glucose'] = 'missing';
    }
  }

  // Pregnancy Validation
  if (sanitized.pregnancy) {
    const preg = sanitized.pregnancy;

    // Biological contradiction check
    if (patient.sex === 'male' && preg.pregnancy_status === 'pregnant') {
      issues.push({
        field: 'pregnancy_status',
        code: 'CONTRADICTION',
        message: 'Pregnancy screening recorded for male patient',
        message_hi: 'पुरुष लाभार्थी के लिए गर्भावस्था स्क्रीनिंग दर्ज नहीं की जा सकती'
      });
    }

    // Gestational age checks
    if (preg.gestational_age_weeks !== undefined && preg.gestational_age_weeks !== null) {
      if (
        isNaN(preg.gestational_age_weeks) ||
        preg.gestational_age_weeks < 1 ||
        preg.gestational_age_weeks > 44
      ) {
        issues.push({
          field: 'gestational_age_weeks',
          code: 'OUT_OF_RANGE',
          message: `Gestational age (${preg.gestational_age_weeks} weeks) is outside normal range (1-44 weeks)`,
          message_hi: `गर्भकालीन अवधि (${preg.gestational_age_weeks} सप्ताह) सामान्य सीमा से बाहर है`
        });
        sanitized.field_status['gestational_age_weeks'] = 'uncertain';
        sanitized.pregnancy.gestational_age_weeks = undefined;
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    sanitizedData: sanitized
  };
}
