import {
  AIEngineDriver,
  SummaryPromptPayload
} from './types';
import { ScreeningType, StructuredScreeningData, extractMultilingualScreeningData } from '@asha/shared';

export interface DemoVoiceScenario {
  id: string;
  title: string;
  title_hi: string;
  transcript: string;
  screeningType: ScreeningType;
  patientName: string;
}

export const DEMO_SCENARIOS: DemoVoiceScenario[] = [
  {
    id: 'scenario_ncd_hypertension',
    title: 'NCD - High BP & Missed Medication',
    title_hi: 'एनसीडी - बढ़ा हुआ बीपी एवं छूटी दवा',
    transcript: 'सुनीता देवी, उम्र 48 वर्ष, बीपी 165 बटा 105 आया है, शुगर 142 है। दो हफ्ते से बीपी की गोली नहीं खा रही हैं और सिर में भारीपन है।',
    screeningType: 'ncd',
    patientName: 'सुनीता देवी'
  },
  {
    id: 'scenario_preg_danger',
    title: 'Pregnancy - Maternal Danger Sign (Bleeding)',
    title_hi: 'गर्भावस्था खतरे के लक्षण - रक्तस्राव',
    transcript: 'मीना कुमारी 28 हफ्ते की गर्भवती हैं, उनको आज सुबह से हल्का खून बह रहा है और पेट में तेज दर्द तथा सिरदर्द है।',
    screeningType: 'pregnancy',
    patientName: 'मीना कुमारी'
  },
  {
    id: 'scenario_ncd_diabetes',
    title: 'NCD - Elevated Blood Glucose & Tobacco',
    title_hi: 'एनसीडी - बढ़ा हुआ शुगर एवं तम्बाकू सेवन',
    transcript: 'रमेश कुमार, उम्र 56 साल, शुगर 245 आई है रैंडम, बीपी 130 बटा 85 है, तम्बाकू खाते हैं।',
    screeningType: 'ncd',
    patientName: 'रमेश कुमार'
  },
  {
    id: 'scenario_ncd_normal',
    title: 'NCD - Routine Healthy Checkup',
    title_hi: 'एनसीडी - सामान्य स्वास्थ्य जांच',
    transcript: 'आशा शर्मा, उम्र 32 वर्ष, बीपी 120 बटा 80 है, शुगर 98 है, कोई अन्य लक्षण नहीं है।',
    screeningType: 'ncd',
    patientName: 'आशा शर्मा'
  }
];

export class OfflineSimulatorDriver implements AIEngineDriver {
  name = 'ASHA Multilingual NLP Engine (Offline Rule Driver)';

  private activeScenarioIndex = 0;

  setActiveScenario(id: string) {
    const idx = DEMO_SCENARIOS.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.activeScenarioIndex = idx;
    }
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available offline
  }

  async transcribe(audioUri: string): Promise<string> {
    // Simulate real speech-to-text latency (600ms)
    await new Promise(res => setTimeout(res, 600));

    // If an explicit audio fixture was selected, return it; otherwise cycle through realistic scenarios
    const scenario = DEMO_SCENARIOS[this.activeScenarioIndex % DEMO_SCENARIOS.length];
    return scenario.transcript;
  }

  async extractScreeningData(transcript: string, type: ScreeningType): Promise<StructuredScreeningData> {
    // Simulate lightweight extraction latency (50ms)
    await new Promise(res => setTimeout(res, 50));

    // Delegate to shared Multilingual Clinical NLP Extractor (Hindi, Hinglish, English)
    return extractMultilingualScreeningData(transcript, type);
  }

  async generateSummary(payload: SummaryPromptPayload): Promise<string> {
    // Simulate Qwen 3-1.7B summary generation latency (400ms)
    await new Promise(res => setTimeout(res, 400));

    const pName = payload.patient.name || 'लाभार्थी (Beneficiary)';
    const triggeredRules = payload.rules.filter(r => r.triggered);

    if (payload.data.screening_type === 'pregnancy' && payload.data.pregnancy) {
      const preg = payload.data.pregnancy;
      if (preg.vaginal_bleeding) {
        // ISS-201: Only mention abdominal pain if observed
        const painText = preg.severe_abdominal_pain ? ' एवं पेट दर्द' : '';
        return `${pName} (${preg.gestational_age_weeks || ''} सप्ताह गर्भवती) को रक्तस्राव${painText} की शिकायत है। यह उच्च जोखिम (Maternal Danger Sign) स्थिति है। तत्काल 108 एम्बुलेंस के माध्यम से सीएचसी/अस्पताल रेफरल करें।`;
      }
      return `${pName} का नियमित प्रसव पूर्व स्वास्थ्य परीक्षण संपन्न हुआ। कोई आपातकालीन खतरे का लक्षण नहीं पाया गया।`;
    }

    if (payload.data.ncd) {
      const ncd = payload.data.ncd;
      const bpStr = ncd.bp_systolic && ncd.bp_diastolic ? `${ncd.bp_systolic}/${ncd.bp_diastolic} mmHg` : 'दर्ज नहीं';
      const glucoseStr = ncd.blood_glucose ? `${ncd.blood_glucose} mg/dL` : 'जांच शेष';

      if (triggeredRules.some(r => r.priority === 'high' || r.priority === 'medium')) {
        const issues = triggeredRules.map(r => r.reason_hi || r.reason).join(' ');
        return `${pName} का रक्तचाप ${bpStr} एवं शुगर ${glucoseStr} दर्ज किया गया। ${issues} 7 दिनों में फॉलो-अप एवं पीएचसी रेफरल की अनुशंसा है।`;
      }

      return `${pName} की एनसीडी जांच पूर्ण हुई। रक्तचाप ${bpStr} और शुगर ${glucoseStr} सामान्य सीमा में हैं।`;
    }

    return `${pName} की सामान्य जांच रिकॉर्ड की गई और स्थानीय डेटाबेस में सुरक्षित सहेज ली गई।`;
  }
}
