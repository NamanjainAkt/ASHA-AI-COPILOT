import {
  StructuredScreeningData,
  RuleResult,
  PriorityLevel
} from './types';
import ncdProtocol from './protocols/ncd-demo.json';
import pregnancyProtocol from './protocols/pregnancy-demo.json';

export interface HealthRule {
  id: string;
  name: string;
  protocol: string;
  enabled: boolean;
  evaluate(data: StructuredScreeningData): RuleResult | null;
}

export const ncdRules: HealthRule[] = [
  // 1. Critical BP Rule (180/110)
  {
    id: ncdProtocol.bp.severe_reading_rule.id,
    name: 'Severe Blood Pressure Elevation (उच्च रक्तचाप गंभीर सीमा)',
    protocol: ncdProtocol.name,
    enabled: ncdProtocol.bp.severe_reading_rule.enabled,
    evaluate(data) {
      const ncd = data.ncd;
      if (!ncd || ncd.bp_systolic == null || ncd.bp_diastolic == null) return null;

      const { systolic, diastolic } = ncdProtocol.bp.severe_reading_rule.parameters;
      if (ncd.bp_systolic >= systolic || ncd.bp_diastolic >= diastolic) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          priority: ncdProtocol.bp.severe_reading_rule.priority as PriorityLevel,
          reason: ncdProtocol.bp.severe_reading_rule.reason_en
            .replace('{systolic}', String(ncd.bp_systolic))
            .replace('{diastolic}', String(ncd.bp_diastolic)),
          reason_hi: ncdProtocol.bp.severe_reading_rule.reason_hi
            .replace('{systolic}', String(ncd.bp_systolic))
            .replace('{diastolic}', String(ncd.bp_diastolic)),
          nextWorkflow: ncdProtocol.bp.severe_reading_rule.next_workflow,
          protocolSource: ncdProtocol.name
        };
      }
      return null;
    }
  },

  // 2. High BP Rule (140/90)
  {
    id: ncdProtocol.bp.high_reading_rule.id,
    name: 'Elevated Blood Pressure Screening (रक्तचाप बढ़ा हुआ)',
    protocol: ncdProtocol.name,
    enabled: ncdProtocol.bp.high_reading_rule.enabled,
    evaluate(data) {
      const ncd = data.ncd;
      if (!ncd || ncd.bp_systolic == null || ncd.bp_diastolic == null) return null;

      // If already triggered severe rule, let severe take precedence (ISS-205: read from protocol)
      const { systolic: severeSys, diastolic: severeDia } = ncdProtocol.bp.severe_reading_rule.parameters;
      if (ncd.bp_systolic >= severeSys || ncd.bp_diastolic >= severeDia) return null;

      const { systolic, diastolic } = ncdProtocol.bp.high_reading_rule.parameters;
      if (ncd.bp_systolic >= systolic || ncd.bp_diastolic >= diastolic) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          priority: ncdProtocol.bp.high_reading_rule.priority as PriorityLevel,
          reason: ncdProtocol.bp.high_reading_rule.reason_en
            .replace('{systolic}', String(ncd.bp_systolic))
            .replace('{diastolic}', String(ncd.bp_diastolic)),
          reason_hi: ncdProtocol.bp.high_reading_rule.reason_hi
            .replace('{systolic}', String(ncd.bp_systolic))
            .replace('{diastolic}', String(ncd.bp_diastolic)),
          nextWorkflow: ncdProtocol.bp.high_reading_rule.next_workflow,
          protocolSource: ncdProtocol.name
        };
      }
      return null;
    }
  },

  // 3. High Blood Glucose Rule
  {
    id: ncdProtocol.glucose.high_reading_rule.id,
    name: 'Elevated Blood Glucose (ब्लड शुगर उच्च स्तर)',
    protocol: ncdProtocol.name,
    enabled: ncdProtocol.glucose.high_reading_rule.enabled,
    evaluate(data) {
      const ncd = data.ncd;
      if (!ncd || ncd.blood_glucose == null) return null;

      // ISS-205: Support both random and fasting thresholds
      const isFasting = ncd.sample_type === 'fasting';
      const threshold = isFasting
        ? ncdProtocol.glucose.high_reading_rule.parameters.fasting_threshold
        : ncdProtocol.glucose.high_reading_rule.parameters.random_threshold;

      if (ncd.blood_glucose >= threshold) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          priority: ncdProtocol.glucose.high_reading_rule.priority as PriorityLevel,
          reason: ncdProtocol.glucose.high_reading_rule.reason_en.replace(
            '{glucose}',
            String(ncd.blood_glucose)
          ),
          reason_hi: ncdProtocol.glucose.high_reading_rule.reason_hi.replace(
            '{glucose}',
            String(ncd.blood_glucose)
          ),
          nextWorkflow: ncdProtocol.glucose.high_reading_rule.next_workflow,
          protocolSource: ncdProtocol.name
        };
      }
      return null;
    }
  },

  // 4. Medication Non-Adherence
  {
    id: ncdProtocol.adherence.medication_missed_rule.id,
    name: 'Chronic Medication Interruption (दवा अनियमितता)',
    protocol: ncdProtocol.name,
    enabled: ncdProtocol.adherence.medication_missed_rule.enabled,
    evaluate(data) {
      const ncd = data.ncd;
      if (!ncd) return null;

      if ((ncd.known_hypertension || ncd.known_diabetes) && ncd.medication_adherence === false) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          priority: ncdProtocol.adherence.medication_missed_rule.priority as PriorityLevel,
          reason: ncdProtocol.adherence.medication_missed_rule.reason_en,
          reason_hi: ncdProtocol.adherence.medication_missed_rule.reason_hi,
          nextWorkflow: ncdProtocol.adherence.medication_missed_rule.next_workflow,
          protocolSource: ncdProtocol.name
        };
      }
      return null;
    }
  },

  // 5. Tobacco Use
  {
    id: ncdProtocol.lifestyle.tobacco_risk_rule.id,
    name: 'Tobacco Consumption Flag (तम्बाकू सेवन)',
    protocol: ncdProtocol.name,
    enabled: ncdProtocol.lifestyle.tobacco_risk_rule.enabled,
    evaluate(data) {
      const ncd = data.ncd;
      if (!ncd || !ncd.tobacco_use) return null;

      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        priority: ncdProtocol.lifestyle.tobacco_risk_rule.priority as PriorityLevel,
        reason: ncdProtocol.lifestyle.tobacco_risk_rule.reason_en,
        reason_hi: ncdProtocol.lifestyle.tobacco_risk_rule.reason_hi,
        nextWorkflow: ncdProtocol.lifestyle.tobacco_risk_rule.next_workflow,
        protocolSource: ncdProtocol.name
      };
    }
  },

  // 6. Missing Mandatory Information Flag
  {
    id: 'RULE_NCD_MISSING_DATA',
    name: 'Incomplete Vital Measurement (अधूरी जांच)',
    protocol: ncdProtocol.name,
    enabled: true,
    evaluate(data) {
      const ncd = data.ncd;
      if (!ncd) return null;

      const missing: string[] = [];
      if (ncd.bp_systolic == null || ncd.bp_diastolic == null) missing.push('रक्तचाप (Blood Pressure)');
      if (ncd.blood_glucose == null) missing.push('ब्लड शुगर (Blood Glucose)');

      if (missing.length > 0) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          priority: 'low',
          reason: `Missing screening parameter(s): ${missing.join(', ')}.`,
          reason_hi: `स्क्रीनिंग में निम्नलिखित पैरामीटर दर्ज नहीं हैं: ${missing.join(', ')}।`,
          nextWorkflow: 'Perform remaining tests or mark reason for deferral in field record.',
          protocolSource: ncdProtocol.name
        };
      }
      return null;
    }
  }
];

export const pregnancyRules: HealthRule[] = [
  // 1. Vaginal Bleeding
  {
    id: pregnancyProtocol.rules.vaginal_bleeding.id,
    name: 'Maternal Vaginal Bleeding (गर्भावस्था में रक्तस्राव)',
    protocol: pregnancyProtocol.name,
    enabled: pregnancyProtocol.rules.vaginal_bleeding.enabled,
    evaluate(data) {
      const preg = data.pregnancy;
      if (!preg || !preg.vaginal_bleeding) return null;

      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        priority: pregnancyProtocol.rules.vaginal_bleeding.priority as PriorityLevel,
        reason: pregnancyProtocol.rules.vaginal_bleeding.reason_en,
        reason_hi: pregnancyProtocol.rules.vaginal_bleeding.reason_hi,
        nextWorkflow: pregnancyProtocol.rules.vaginal_bleeding.next_workflow,
        protocolSource: pregnancyProtocol.name
      };
    }
  },

  // 2. Severe Headache / Blurred Vision
  {
    id: pregnancyProtocol.rules.severe_headache_blurred_vision.id,
    name: 'Suspected Pre-eclampsia Signs (गंभीर सिरदर्द / धुंधली दृष्टि)',
    protocol: pregnancyProtocol.name,
    enabled: pregnancyProtocol.rules.severe_headache_blurred_vision.enabled,
    evaluate(data) {
      const preg = data.pregnancy;
      if (!preg) return null;
      if (preg.severe_headache || preg.blurred_vision) {
        return {
          ruleId: this.id,
          ruleName: this.name,
          triggered: true,
          priority: pregnancyProtocol.rules.severe_headache_blurred_vision.priority as PriorityLevel,
          reason: pregnancyProtocol.rules.severe_headache_blurred_vision.reason_en,
          reason_hi: pregnancyProtocol.rules.severe_headache_blurred_vision.reason_hi,
          nextWorkflow: pregnancyProtocol.rules.severe_headache_blurred_vision.next_workflow,
          protocolSource: pregnancyProtocol.name
        };
      }
      return null;
    }
  },

  // 3. Severe Abdominal Pain
  {
    id: pregnancyProtocol.rules.severe_abdominal_pain.id,
    name: 'Severe Abdominal Pain (असहनीय पेट दर्द)',
    protocol: pregnancyProtocol.name,
    enabled: pregnancyProtocol.rules.severe_abdominal_pain.enabled,
    evaluate(data) {
      const preg = data.pregnancy;
      if (!preg || !preg.severe_abdominal_pain) return null;

      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        priority: pregnancyProtocol.rules.severe_abdominal_pain.priority as PriorityLevel,
        reason: pregnancyProtocol.rules.severe_abdominal_pain.reason_en,
        reason_hi: pregnancyProtocol.rules.severe_abdominal_pain.reason_hi,
        nextWorkflow: pregnancyProtocol.rules.severe_abdominal_pain.next_workflow,
        protocolSource: pregnancyProtocol.name
      };
    }
  },

  // 4. Reduced Fetal Movement (ISS-111: gate on gestational age >= 24 weeks)
  {
    id: pregnancyProtocol.rules.reduced_fetal_movement.id,
    name: 'Reduced Fetal Movement (शिशु की हलचल में कमी)',
    protocol: pregnancyProtocol.name,
    enabled: pregnancyProtocol.rules.reduced_fetal_movement.enabled,
    evaluate(data) {
      const preg = data.pregnancy;
      if (!preg || !preg.reduced_fetal_movement) return null;
      if (preg.gestational_age_weeks != null && preg.gestational_age_weeks < 24) return null;

      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        priority: pregnancyProtocol.rules.reduced_fetal_movement.priority as PriorityLevel,
        reason: pregnancyProtocol.rules.reduced_fetal_movement.reason_en,
        reason_hi: pregnancyProtocol.rules.reduced_fetal_movement.reason_hi,
        nextWorkflow: pregnancyProtocol.rules.reduced_fetal_movement.next_workflow,
        protocolSource: pregnancyProtocol.name
      };
    }
  },

  // 5. Swelling / Edema (ISS-110: qualify with blood pressure)
  {
    id: pregnancyProtocol.rules.swelling_with_hypertension.id,
    name: 'Maternal Edema & Swelling (हाथ/मुंह पर सूजन)',
    protocol: pregnancyProtocol.name,
    enabled: pregnancyProtocol.rules.swelling_with_hypertension.enabled,
    evaluate(data) {
      const preg = data.pregnancy;
      if (!preg || !preg.swelling) return null;

      const { systolic: highSys, diastolic: highDia } = ncdProtocol.bp.high_reading_rule.parameters;
      const hasElevatedBp = Boolean(
        data.ncd &&
        ((data.ncd.bp_systolic != null && data.ncd.bp_systolic >= highSys) ||
         (data.ncd.bp_diastolic != null && data.ncd.bp_diastolic >= highDia))
      );

      const bpMeasured = Boolean(
        data.ncd && data.ncd.bp_systolic != null && data.ncd.bp_diastolic != null
      );

      if (!hasElevatedBp && bpMeasured) {
        return {
          ruleId: this.id,
          ruleName: 'Maternal Edema (सूजन - सामान्य रक्तचाप)',
          triggered: true,
          priority: 'low' as PriorityLevel,
          reason: 'Swelling observed with normal blood pressure. Advise rest and foot elevation.',
          reason_hi: 'सामान्य रक्तचाप के साथ हल्की सूजन। आराम करने की सलाह दें।',
          nextWorkflow: 'Routine maternal follow-up.',
          protocolSource: pregnancyProtocol.name
        };
      }

      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        priority: (hasElevatedBp ? 'high' : 'medium') as PriorityLevel,
        reason: hasElevatedBp
          ? pregnancyProtocol.rules.swelling_with_hypertension.reason_en
          : 'Maternal swelling noted; blood pressure measurement required to rule out pre-eclampsia.',
        reason_hi: hasElevatedBp
          ? pregnancyProtocol.rules.swelling_with_hypertension.reason_hi
          : 'गर्भावस्था में सूजन दर्ज की गई; प्री-एक्लेमप्सिया की जांच हेतु तुरंत बीपी मापें।',
        nextWorkflow: hasElevatedBp
          ? pregnancyProtocol.rules.swelling_with_hypertension.next_workflow
          : 'Check blood pressure immediately.',
        protocolSource: pregnancyProtocol.name
      };
    }
  },

  // 6. High Fever
  {
    id: pregnancyProtocol.rules.high_fever.id,
    name: 'Persistent High Fever in Pregnancy (गर्भावस्था में तेज बुखार)',
    protocol: pregnancyProtocol.name,
    enabled: pregnancyProtocol.rules.high_fever.enabled,
    evaluate(data) {
      const preg = data.pregnancy;
      if (!preg || !preg.fever) return null;

      return {
        ruleId: this.id,
        ruleName: this.name,
        triggered: true,
        priority: pregnancyProtocol.rules.high_fever.priority as PriorityLevel,
        reason: pregnancyProtocol.rules.high_fever.reason_en,
        reason_hi: pregnancyProtocol.rules.high_fever.reason_hi,
        nextWorkflow: pregnancyProtocol.rules.high_fever.next_workflow,
        protocolSource: pregnancyProtocol.name
      };
    }
  }
];

export function evaluateRules(data: StructuredScreeningData): RuleResult[] {
  const results: RuleResult[] = [];

  // ISS-104: Check for uncertain fields
  if (data.field_status) {
    if (data.field_status['bp_systolic'] === 'uncertain' || data.field_status['bp_diastolic'] === 'uncertain') {
      results.push({
        ruleId: 'RULE_NCD_BP_UNCERTAIN',
        ruleName: 'Uncertain Blood Pressure (रक्तचाप पुनः जांच आवश्यक)',
        triggered: true,
        priority: 'medium',
        reason: 'Recorded blood pressure was outside plausible physiological range and was suppressed from critical triage. Re-measurement required.',
        reason_hi: 'रक्तचाप का मान अमान्य या अत्यधिक असामान्य पाया गया। कृपया पुनः मापें।',
        nextWorkflow: 'Verify sphygmomanometer cuff and re-measure BP.',
        protocolSource: ncdProtocol.name
      });
    }
    if (data.field_status['blood_glucose'] === 'uncertain') {
      results.push({
        ruleId: 'RULE_NCD_GLUCOSE_UNCERTAIN',
        ruleName: 'Uncertain Blood Glucose (ग्लूकोज पुनः जांच आवश्यक)',
        triggered: true,
        priority: 'medium',
        reason: 'Recorded blood glucose reading was outside plausible physiological range. Strip re-check required.',
        reason_hi: 'ब्लड शुगर का मान असामान्य सीमा में दर्ज हुआ। नई स्ट्रिप से पुनः जांचें।',
        nextWorkflow: 'Repeat glucometer test with fresh test strip.',
        protocolSource: ncdProtocol.name
      });
    }
  }

  // ISS-204: Strict gating on screening_type
  if (data.screening_type === 'ncd') {
    for (const rule of ncdRules) {
      if (rule.enabled) {
        const res = rule.evaluate(data);
        if (res) results.push(res);
      }
    }
  } else if (data.screening_type === 'pregnancy') {
    for (const rule of pregnancyRules) {
      if (rule.enabled) {
        const res = rule.evaluate(data);
        if (res) results.push(res);
      }
    }
    // Flag missing gestational age (ISS-204)
    if (data.pregnancy && data.pregnancy.gestational_age_weeks == null) {
      results.push({
        ruleId: 'RULE_PREG_MISSING_DATA',
        ruleName: 'Missing Gestational Age (गर्भकालीन अवधि अनुपलब्ध)',
        triggered: true,
        priority: 'low',
        reason: 'Gestational age is missing or unspecified in pregnancy screening.',
        reason_hi: 'गर्भावस्था जांच में गर्भकालीन सप्ताह दर्ज नहीं है। कृपया एमसीपी कार्ड से जांचें।',
        nextWorkflow: 'Verify gestational age using MCP card / LMP date.',
        protocolSource: pregnancyProtocol.name
      });
    }
  } else {
    // General or mixed screening: evaluate available subsystems
    if (data.ncd) {
      for (const rule of ncdRules) {
        if (rule.enabled) {
          const res = rule.evaluate(data);
          if (res) results.push(res);
        }
      }
    }
    if (data.pregnancy) {
      for (const rule of pregnancyRules) {
        if (rule.enabled) {
          const res = rule.evaluate(data);
          if (res) results.push(res);
        }
      }
    }
  }

  // Sort by priority (high > medium > low)
  const priorityOrder: Record<PriorityLevel, number> = { high: 3, medium: 2, low: 1 };
  return results.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
}
