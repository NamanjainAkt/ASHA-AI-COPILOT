import { NativeModules } from 'react-native';
import { logger } from '../log';
import { modelManager } from './modelManager';
import { cactusComplete } from './cactusBridge';
import { buildNeedleTools, validateNeedleOutput, NEEDLE_SYSTEM_PROMPT } from './needle3Schemas';

function needleNative(): any | null {
  const m = (NativeModules as any)?.NeedleModule;
  if (!m || typeof m.complete !== 'function') return null;
  return m;
}

export interface ExtractOptions {
  screeningType: 'ncd' | 'pregnancy';
  maxTokens?: number;
}

export interface SummaryOptions {
  systemPrompt?: string;
  maxTokens?: number;
}

export const QWEN_SUMMARY_SYSTEM_PROMPT =
  'You are an ASHA field assistant writing a short Hindi summary for a community health worker. ' +
  'Input is validated structured screening data plus deterministic rule flags. ' +
  'Rules: describe ONLY the given data and flags in plain Hindi. NEVER diagnose, NEVER set risk, ' +
  'NEVER change numbers, NEVER recommend medication, NEVER invent missing facts. ' +
  'If fields are missing, say what to measure next. Keep it under 120 words. Output Hindi prose only.';

/**
 * AIOrchestrator — JS entry point to on-device inference for Needle 3 & Qwen.
 * Sequential discipline: load → run → release per stage; one major model
 * resident at a time. Clinical authority stays with evaluateRules() + worker.
 */
class AIOrchestrator {
  async extractPatientData(transcript: string, options: ExtractOptions): Promise<any> {
    const needle = needleNative();
    if (!needle) throw new Error('Needle 3 native module not linked in this build.');
    const ok = await modelManager.acquireModel('needle3');
    if (!ok) throw new Error('Needle 3 file is ready but failed to load into memory (' + (modelManager.getLastLoadError() || 'unknown') + ').');
    try {
      const toolsJson = buildNeedleTools(options.screeningType);
      const raw: string = await needle.complete(transcript, toolsJson, options.maxTokens || 512);
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('Needle 3 returned non-JSON output.');
      }
      const data = parsed.arguments || parsed;
      const check = validateNeedleOutput(data, options.screeningType);
      if (!check.ok) {
        logger.warn('AIOrchestrator', 'Needle output failed schema validation', { errors: check.errors });
        throw new Error(`Needle 3 output invalid: ${check.errors.slice(0, 3).join('; ')}`);
      }
      void NEEDLE_SYSTEM_PROMPT;
      return data;
    } finally {
      await modelManager.releaseModel('needle3');
    }
  }

  async generateSummary(structuredJson: string, ruleFlagsJson: string, options: SummaryOptions = {}): Promise<string> {
    const selected = modelManager.getActiveSummaryModel();
    if (!selected) {
      throw new Error('No summary model ready. Download Qwen3-0.6B on Wi-Fi from Profile → AI Models.');
    }
    const ok = await modelManager.acquireModel(selected);
    if (!ok) throw new Error(`${selected} failed to load into memory.`);
    const handle = modelManager.getModel(selected)?.nativeHandle;
    if (!handle) {
      await modelManager.releaseModel(selected);
      throw new Error(`${selected} produced no session handle.`);
    }
    try {
      const messages = JSON.stringify([
        { role: 'system', content: options.systemPrompt || QWEN_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `STRUCTURED_DATA:\n${structuredJson}\nRULE_FLAGS:\n${ruleFlagsJson}` },
      ]);
      const out = await cactusComplete(
        handle,
        messages,
        JSON.stringify({ temperature: 0, max_tokens: options.maxTokens || 256 })
      );
      return out.trim();
    } finally {
      await modelManager.releaseModel(selected);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
