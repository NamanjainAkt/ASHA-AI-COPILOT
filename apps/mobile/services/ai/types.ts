import {
  Patient,
  ScreeningType,
  StructuredScreeningData,
  RuleResult
} from '@asha/shared';

export interface SummaryPromptPayload {
  patient: Partial<Patient>;
  data: StructuredScreeningData;
  rules: RuleResult[];
}

export interface AIEngineDriver {
  name: string;
  isAvailable(): Promise<boolean>;
  transcribe(audioUri: string): Promise<string>;
  extractScreeningData(transcript: string, type: ScreeningType): Promise<StructuredScreeningData>;
  generateSummary(payload: SummaryPromptPayload): Promise<string>;
}
