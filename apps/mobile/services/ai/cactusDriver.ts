import { NativeModules, Platform } from 'react-native';
import {
  AIEngineDriver,
  SummaryPromptPayload
} from './types';
import { ScreeningType, StructuredScreeningData, extractMultilingualScreeningData } from '@asha/shared';
import { modelManager } from './modelManager';
import { aiOrchestrator } from './aiOrchestrator';
import type { FieldState } from './needle3Schemas';

/**
 * Cactus Native Engine Driver (Cactus runtime v2.2.2).
 * Pipeline: Whisper Hindi STT → Needle 3 extraction → deterministic
 * validation/rules → Qwen summary → worker confirm.
 * Every neural stage fails closed into the deterministic offline path.
 */
export class CactusNativeDriver implements AIEngineDriver {
  get name(): string {
    const parts: string[] = [];
    const stt = modelManager.getActiveSttModel();
    if (stt === 'whisper-base') parts.push('Whisper.cpp Base Hindi');
    else if (stt === 'whisper-hindi') parts.push('Whisper.cpp Tiny Hindi');
    if (modelManager.isModelReady('needle3')) parts.push('Needle 3');
    const qwen = modelManager.getActiveSummaryModel();
    if (qwen === 'qwen3-0.6b') parts.push('Qwen 0.6B');
    if (qwen === 'qwen3-1.7b') parts.push('Qwen 1.7B');
    if (parts.length === 0) return 'ASHA Multilingual NLP Engine (Offline Rule Driver)';
    return `Cactus Neural Engine (${parts.join(' + ')})`;
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
      return Boolean((NativeModules as any)?.Cactus);
    } catch {
      return false;
    }
  }

  async transcribe(audioUri: string): Promise<string> {
    if (!audioUri || audioUri.trim().length === 0 || audioUri === 'live_voice_session.m4a') {
      throw new Error('No recorded audio file to transcribe. Record on-device audio first.');
    }
    const text = await aiOrchestrator.transcribeAudio(audioUri);
    if (!text) {
      throw new Error('Whisper produced no transcript (silent audio or decode failure). Type symptoms manually.');
    }
    return text;
  }

  async extractScreeningData(transcript: string, type: ScreeningType): Promise<StructuredScreeningData> {
    if (modelManager.isModelReady('needle3') && (type === 'ncd' || type === 'pregnancy')) {
      try {
        const needle = await aiOrchestrator.extractPatientData(transcript, { screeningType: type });
        return needleToStructured(needle, type, transcript);
      } catch {
        // Fall through to deterministic extractor
      }
    }
    return extractMultilingualScreeningData(transcript, type);
  }

  async generateSummary(payload: SummaryPromptPayload): Promise<string> {
    const activeSummaryModel = modelManager.getActiveSummaryModel();
    if (activeSummaryModel !== null) {
      try {
        const structuredJson = JSON.stringify(payload.data);
        const ruleFlagsJson = JSON.stringify(
          payload.rules.filter((r) => r.triggered).map((r) => ({
            flag: r.ruleName,
            priority: r.priority,
            action: r.nextWorkflow,
          }))
        );
        const summary = await aiOrchestrator.generateSummary(structuredJson, ruleFlagsJson);
        if (summary && summary.trim().length > 0) return summary.trim();
      } catch {
        // Fall through to deterministic template
      }
    }
    return deterministicSummary(payload);
  }
}

interface NeedleField {
  value: any;
  state: FieldState;
}

function numValue(f: NeedleField | undefined): number | null {
  if (!f) return null;
  if ((f.state === 'known' || f.state === 'uncertain') && typeof f.value === 'number') return f.value;
  return null;
}

function numStatus(f: NeedleField | undefined): 'present' | 'missing' | 'uncertain' {
  if (!f) return 'missing';
  if (f.state === 'known' && typeof f.value === 'number') return 'present';
  if (f.state === 'uncertain') return 'uncertain';
  return 'missing';
}

function boolValue(f: NeedleField | undefined): boolean | undefined {
  if (!f) return undefined;
  if ((f.state === 'known' || f.state === 'uncertain') && typeof f.value === 'boolean') return f.value;
  return undefined;
}

function needleToStructured(data: any, type: ScreeningType, transcript: string): StructuredScreeningData {
  const fieldStatus: Record<string, 'present' | 'missing' | 'uncertain'> = {};
  const symptomsRaw: string = typeof data.symptoms?.value === 'string' ? data.symptoms.value : '';
  const symptoms = symptomsRaw ? symptomsRaw.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [];

  if (type === 'ncd') {
    fieldStatus.bp_systolic = numStatus(data.bp_systolic);
    fieldStatus.bp_diastolic = numStatus(data.bp_diastolic);
    fieldStatus.blood_glucose = numStatus(data.blood_glucose);
    const glucoseCtx = typeof data.glucose_context?.value === 'string' ? data.glucose_context.value : '';
    const sampleType = glucoseCtx === 'fasting' ? 'fasting' : glucoseCtx === 'random' ? 'random' : null;
    const adherence = typeof data.medication_adherence?.value === 'string' ? data.medication_adherence.value : '';
    return {
      screening_type: 'ncd',
      ncd: {
        bp_systolic: numValue(data.bp_systolic),
        bp_diastolic: numValue(data.bp_diastolic),
        blood_glucose: numValue(data.blood_glucose),
        sample_type: sampleType,
        tobacco_use: boolValue(data.tobacco_use) ?? null,
        medication_adherence:
          adherence === 'taking_regularly' ? true : adherence === 'missed_doses' || adherence === 'stopped' ? false : null,
        symptoms,
      },
      notes: typeof data.followup_reason?.value === 'string' && data.followup_reason.value
        ? `फॉलो-अप: ${data.followup_reason.value}`
        : transcript,
      field_status: fieldStatus,
    };
  }

  fieldStatus.gestational_age_weeks = numStatus(data.gestational_age_weeks);
  return {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: numValue(data.gestational_age_weeks),
      vaginal_bleeding: boolValue(data.vaginal_bleeding),
      severe_abdominal_pain: boolValue(data.severe_abdominal_pain),
      reduced_fetal_movement: boolValue(data.reduced_fetal_movement),
      swelling: boolValue(data.swelling_feet_face),
    },
    notes: typeof data.followup_reason?.value === 'string' && data.followup_reason.value
      ? `फॉलो-अप: ${data.followup_reason.value}`
      : transcript,
    field_status: fieldStatus,
  };
}

function deterministicSummary(payload: SummaryPromptPayload): string {
  const pName = payload.patient.name || 'लाभार्थी (Beneficiary)';
  const triggeredRules = payload.rules.filter((r) => r.triggered);

  if (payload.data.screening_type === 'pregnancy' && payload.data.pregnancy) {
    const preg = payload.data.pregnancy;
    if (preg.vaginal_bleeding) {
      const painText = preg.severe_abdominal_pain ? ' एवं पेट दर्द' : '';
      const weekText = preg.gestational_age_weeks ? ` (${preg.gestational_age_weeks} सप्ताह गर्भवती)` : '';
      return `${pName}${weekText} को रक्तस्राव${painText} की शिकायत है। यह उच्च जोखिम (Maternal Danger Sign) स्थिति है। तत्काल 108 एम्बुलेंस के माध्यम से सीएचसी/अस्पताल रेफरल करें।`;
    }
    return `${pName} का नियमित प्रसव पूर्व स्वास्थ्य परीक्षण संपन्न हुआ। कोई आपातकालीन खतरे का लक्षण नहीं पाया गया।`;
  }

  if (payload.data.ncd) {
    const ncd = payload.data.ncd;
    const bpStr = ncd.bp_systolic && ncd.bp_diastolic ? `${ncd.bp_systolic}/${ncd.bp_diastolic} mmHg` : 'दर्ज नहीं';
    const glucoseStr = ncd.blood_glucose ? `${ncd.blood_glucose} mg/dL` : 'जांच शेष';

    if (triggeredRules.some((r) => r.priority === 'high' || r.priority === 'medium')) {
      const issues = triggeredRules.map((r) => r.reason_hi || r.reason).join(' ');
      return `${pName} का रक्तचाप ${bpStr} एवं शुगर ${glucoseStr} दर्ज किया गया। ${issues} 7 दिनों में फॉलो-अप एवं पीएचसी रेफरल की अनुशंसा है।`;
    }

    return `${pName} की एनसीडी जांच पूर्ण हुई। रक्तचाप ${bpStr} और शुगर ${glucoseStr} सामान्य सीमा में हैं।`;
  }

  return `${pName} की सामान्य जांच रिकॉर्ड की गई और स्थानीय डेटाबेस में सुरक्षित सहेज ली गई।`;
}
