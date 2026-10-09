import {
  Patient,
  ScreeningType,
  StructuredScreeningData,
  RuleResult,
  validateScreeningData,
  ValidationIssue
} from '@asha/shared';
import { AIEngineDriver } from './types';
import { CactusNativeDriver } from './cactusDriver';
import { OfflineSimulatorDriver } from './simulatorDriver';
import { evaluateRules } from '../rules/engine';
import { logger } from '../log';

export interface ProcessedScreeningResult {
  transcript: string;
  extracted: StructuredScreeningData;
  validationIssues: ValidationIssue[];
  ruleResults: RuleResult[];
  summary: string;
  engineUsed: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, stageName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded in stage ${stageName}`)), ms)
    )
  ]);
}

export class ScreeningOrchestrator {
  private nativeDriver: CactusNativeDriver;
  private simulatorDriver: OfflineSimulatorDriver;
  private lastResult: ProcessedScreeningResult | null = null;

  constructor() {
    this.nativeDriver = new CactusNativeDriver();
    this.simulatorDriver = new OfflineSimulatorDriver();
  }

  getLastResult(): ProcessedScreeningResult | null {
    return this.lastResult;
  }

  setLastResult(result: ProcessedScreeningResult | null): void {
    this.lastResult = result;
  }

  getSimulator(): OfflineSimulatorDriver {
    return this.simulatorDriver;
  }

  async getActiveDriver(): Promise<AIEngineDriver> {
    try {
      const isNativeAvailable = await withTimeout(this.nativeDriver.isAvailable(), 5000, 'native-probe');
      if (isNativeAvailable) {
        return this.nativeDriver;
      }
    } catch (e) {
      logger.warn('ScreeningOrchestrator', 'Native Cactus driver probe failed, falling back to simulator', { error: String(e) });
    }
    return this.simulatorDriver;
  }

  /**
   * Main Pipeline execution adhering to PRD Section 79 & 106
   * Voice -> STT -> Needle 2 -> Validation -> Rules -> Qwen Summary
   */
  async processVoiceScreening(
    audioUri: string,
    screeningType: ScreeningType,
    patient: Partial<Patient>,
    customTranscript?: string
  ): Promise<ProcessedScreeningResult> {
    let driver = await this.getActiveDriver();

    // 1. Whisper Tiny Hindi STT (or live dictation/speech input) with fallback.
    // Honest path: fixture transcripts are never substituted for real audio.
    // If the caller supplied user-confirmed text, STT is skipped; otherwise a
    // primary STT failure is rethrown so the UI can ask for typed input.
    let transcript = '';
    const usedCustomTranscript = !!(customTranscript && customTranscript.trim().length > 0);
    if (usedCustomTranscript) {
      transcript = customTranscript!.trim();
    } else {
      try {
        transcript = await withTimeout(driver.transcribe(audioUri), 30000, 'STT');
      } catch (err) {
        logger.warn('ScreeningOrchestrator', 'Transcription failed on primary driver, not substituting fixture text', { error: String(err) });
        throw err;
      }
    }

    // 2. Cactus Needle 2 Structured Extraction with fallback
    let rawExtraction: StructuredScreeningData;
    try {
      rawExtraction = await withTimeout(driver.extractScreeningData(transcript, screeningType), 15000, 'extraction');
    } catch (err) {
      logger.warn('ScreeningOrchestrator', 'Structured extraction failed or timed out on primary driver, falling back to simulator', { error: String(err) });
      driver = this.simulatorDriver;
      rawExtraction = await this.simulatorDriver.extractScreeningData(transcript, screeningType);
    }

    // 3. Clinical Data Validation Layer
    const validation = validateScreeningData(patient, rawExtraction);

    // 4. Deterministic TypeScript Rule Engine
    const ruleResults = evaluateRules(validation.sanitizedData);

    // 5. Qwen3-1.7B Hindi Summary Generation with fallback
    let summary = '';
    try {
      summary = await withTimeout(driver.generateSummary({
        patient,
        data: validation.sanitizedData,
        rules: ruleResults
      }), 15000, 'summary');
    } catch (err) {
      logger.warn('ScreeningOrchestrator', 'Summary generation failed or timed out on primary driver, falling back to simulator', { error: String(err) });
      driver = this.simulatorDriver;
      summary = await this.simulatorDriver.generateSummary({
        patient,
        data: validation.sanitizedData,
        rules: ruleResults
      });
    }
    if (!validation.isValid && validation.issues.length > 0) {
      const issueDetails = validation.issues.map(i => i.message_hi || i.message).join('; ');
      summary = `[चेतावनी: डेटा विसंगति पाई गई - ${issueDetails}] ${summary}`;
    }

    const processedResult: ProcessedScreeningResult = {
      transcript,
      extracted: validation.sanitizedData,
      validationIssues: validation.issues,
      ruleResults,
      summary,
      engineUsed: driver.name
    };

    this.lastResult = processedResult;
    return processedResult;
  }
}

export const screeningOrchestrator = new ScreeningOrchestrator();
