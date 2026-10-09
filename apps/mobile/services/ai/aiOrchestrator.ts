import { NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { logger } from '../log';
import { modelManager, toExpoUri, toNativePath } from './modelManager';
import {
  cactusInit,
  cactusDestroy,
  cactusComplete,
} from './cactusBridge';
import { buildNeedleTools, validateNeedleOutput, NEEDLE_SYSTEM_PROMPT } from './needle3Schemas';

function needleNative(): any | null {
  const m = (NativeModules as any)?.NeedleModule;
  if (!m || typeof m.complete !== 'function') return null;
  return m;
}

function whisperNative(): any | null {
  const m = (NativeModules as any)?.WhisperCppModule;
  if (!m || typeof m.transcribe !== 'function') return null;
  return m;
}

declare const atob: ((data: string) => string) | undefined;
declare const btoa: ((data: string) => string) | undefined;

/**
 * Concatenates base64 PCM chunks into one base64 payload. Chunk boundaries
 * are raw-byte aligned on the native side, but base64 padding is per-string,
 * so each chunk is decoded and re-encoded jointly.
 */
export function concatBase64Chunks(chunks: string[]): string {
  try {
    const decoder = typeof atob === 'function' ? atob : (globalThis as any)?.atob;
    const encoder = typeof btoa === 'function' ? btoa : (globalThis as any)?.btoa;
    if (!decoder || !encoder) return chunks.join('');
    const decodedChunks: string[] = [];
    for (const chunk of chunks) {
      if (!chunk) continue;
      decodedChunks.push(decoder(chunk));
    }
    if (decodedChunks.length === 0) return '';
    return encoder(decodedChunks.join(''));
  } catch {
    return '';
  }
}

export interface TranscribeOptions {
  language?: string;
  prompt?: string | null;
  onChunk?: (confirmed: string, pending: string) => void;
}

export interface WhisperFileResult {
  text: string;
  segments: number;
}

export function parseWhisperResult(raw: string): WhisperFileResult {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') {
      throw new Error(parsed.error);
    }
    return {
      text: (parsed.text || '').toString().trim(),
      segments: typeof parsed.segments === 'number' ? parsed.segments : 0,
    };
  } catch (e: any) {
    if (e?.message && !raw.trim().startsWith('{')) throw e;
    return { text: raw.trim(), segments: 0 };
  }
}

export interface ExtractOptions {
  screeningType: 'ncd' | 'pregnancy';
  maxTokens?: number;
}

export interface AbcVariantResult extends WhisperFileResult {
  label: string;
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
 * AIOrchestrator — the only JS entry point to on-device inference (Prompt §8).
 * Sequential discipline: load → run → release per stage; one major model
 * resident at a time. Clinical authority stays with evaluateRules() + worker.
 */
class AIOrchestrator {
  private liveHandle: string | null = null;
  private liveActive = false;
  private liveStt: 'whisper-hindi' | 'whisper-base' | null = null;
  private liveLanguage = 'hi';
  private liveChunks: string[] = [];
  private liveDecoding = false;
  private liveConfirmedText = '';
  private liveLastDecodeTime = 0;

  isLiveSessionActive(): boolean {
    return this.liveActive;
  }

  private resolveStt(): 'whisper-hindi' | 'whisper-base' {
    const stt = modelManager.getActiveSttModel();
    if (!stt) throw new Error('Whisper model not ready. Download it on Wi-Fi from Profile → AI Models.');
    return stt;
  }
  private whisper(): any {
    const w = whisperNative();
    if (!w) throw new Error('WhisperCpp native module not linked in this build');
    return w;
  }

  private async transcribeBuffer(
    handle: string,
    audioPath: string,
    language: string
  ): Promise<WhisperFileResult> {
    const info = await FileSystem.getInfoAsync(toExpoUri(audioPath));
    const size = (info as { size?: number }).size ?? 0;
    if (!info.exists || size < 3200) {
      throw new Error('Captured audio is empty. Speak close to the microphone and retry.');
    }
    const raw: string = await this.whisper().transcribe(
      handle,
      toNativePath(audioPath),
      language || 'hi'
    );
    return parseWhisperResult(raw);
  }

  /**
   * whisper.cpp live streaming session: load once at mic start,
   * periodically decode accumulated PCM chunks during speech, and run
   * a final full decode on mic stop.
   */
  async startLiveSession(language = 'hi'): Promise<void> {
    if (this.liveActive) return;
    const stt = this.resolveStt();
    const ok = await modelManager.acquireModel(stt);
    if (!ok) throw new Error('Whisper file is ready but failed to load into memory (' + (modelManager.getLastLoadError() || 'unknown') + ').');
    const handle = modelManager.getModel(stt)?.nativeHandle;
    if (!handle) {
      await modelManager.releaseModel(stt);
      throw new Error('Whisper failed to load into memory.');
    }
    this.liveHandle = handle;
    this.liveStt = stt;
    this.liveLanguage = language;
    this.liveChunks = [];
    this.liveDecoding = false;
    this.liveConfirmedText = '';
    this.liveLastDecodeTime = 0;
    this.liveActive = true;
  }

  async pushLiveAudio(pcmBase64: string): Promise<{ confirmed: string; pending: string; decodeTokens: number }> {
    if (!this.liveActive || !this.liveHandle) {
      return { confirmed: this.liveConfirmedText, pending: '', decodeTokens: 0 };
    }
    if (pcmBase64) {
      this.liveChunks.push(pcmBase64);
    }

    // If another decode pass is in flight, return current confirmed text
    if (this.liveDecoding) {
      return { confirmed: this.liveConfirmedText, pending: '', decodeTokens: 0 };
    }

    // Periodic sliding-window decode: at least 2 chunks (~2s audio) and >= 1800ms since last pass
    const now = Date.now();
    const canDecode = this.liveChunks.length >= 2 && (now - this.liveLastDecodeTime >= 1800);

    if (!canDecode) {
      return { confirmed: this.liveConfirmedText, pending: '', decodeTokens: 0 };
    }

    this.liveDecoding = true;
    this.liveLastDecodeTime = now;

    try {
      const combined = concatBase64Chunks(this.liveChunks);
      if (combined && combined.length >= 3200) {
        const streamPath = `${FileSystem.cacheDirectory || ''}whisper_stream.pcm`;
        await FileSystem.writeAsStringAsync(toExpoUri(streamPath), combined, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const res = await this.transcribeBuffer(this.liveHandle, streamPath, this.liveLanguage);
        try {
          await FileSystem.deleteAsync(toExpoUri(streamPath), { idempotent: true });
        } catch (_) {}

        if (res && res.text && res.text.trim()) {
          this.liveConfirmedText = res.text.trim();
        }
      }
    } catch (err) {
      logger.warn('AIOrchestrator', 'Periodic live whisper decode notice', { error: String(err) });
    } finally {
      this.liveDecoding = false;
    }

    return { confirmed: this.liveConfirmedText, pending: '', decodeTokens: 0 };
  }

  async stopLiveSession(): Promise<{ text: string; decodeTokens: number }> {
    try {
      if (!this.liveActive || !this.liveHandle) {
        return { text: this.liveConfirmedText, decodeTokens: 0 };
      }

      // If a periodic decode is in-flight, wait briefly (up to 800ms) for it to complete
      let waitCount = 0;
      while (this.liveDecoding && waitCount < 8) {
        await new Promise((r) => setTimeout(r, 100));
        waitCount++;
      }

      const combined = concatBase64Chunks(this.liveChunks);
      if (!combined || combined.length < 3200) {
        return { text: this.liveConfirmedText, decodeTokens: 0 };
      }

      const clipPath = `${FileSystem.cacheDirectory || ''}whisper_live.pcm`;
      await FileSystem.writeAsStringAsync(toExpoUri(clipPath), combined, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const res = await this.transcribeBuffer(this.liveHandle, clipPath, this.liveLanguage);
      try {
        await FileSystem.deleteAsync(toExpoUri(clipPath), { idempotent: true });
      } catch (_) {}

      const finalText = (res?.text || '').trim() || this.liveConfirmedText;
      return { text: finalText, decodeTokens: res?.segments || 0 };
    } finally {
      this.liveActive = false;
      this.liveDecoding = false;
      this.liveHandle = null;
      this.liveChunks = [];
      this.liveConfirmedText = '';
      this.liveLastDecodeTime = 0;
      await modelManager.releaseModel(this.liveStt || 'whisper-hindi');
      this.liveStt = null;
    }
  }

  getLiveDecodeTokens(): number {
    return 0;
  }

  async transcribeAudio(audioPath: string, options: TranscribeOptions = {}): Promise<string> {
    const stt = this.resolveStt();
    const ok = await modelManager.acquireModel(stt);
    if (!ok) throw new Error('Whisper file is ready but failed to load into memory (' + (modelManager.getLastLoadError() || 'unknown') + ').');
    const handle = modelManager.getModel(stt)?.nativeHandle;
    if (!handle) {
      await modelManager.releaseModel(stt);
      throw new Error('Whisper failed to load into memory.');
    }
    try {
      const res = await this.transcribeBuffer(handle, audioPath, options.language || 'hi');
      if (!res.text) {
        throw new Error('Whisper produced no transcript (silent audio or decode failure). Type symptoms manually.');
      }
      return res.text;
    } finally {
      await modelManager.releaseModel(stt);
    }
  }

  async transcribeStream(
    chunks: string[],
    options: TranscribeOptions = {}
  ): Promise<{ confirmed: string; pending: string }> {
    const stt = this.resolveStt();
    const ok = await modelManager.acquireModel(stt);
    if (!ok) throw new Error('Whisper file is ready but failed to load into memory (' + (modelManager.getLastLoadError() || 'unknown') + ').');
    const handle = modelManager.getModel(stt)?.nativeHandle;
    if (!handle) {
      await modelManager.releaseModel(stt);
      throw new Error('Whisper failed to load into memory.');
    }
    try {
      const combined = concatBase64Chunks(chunks);
      if (!combined || combined.length < 3200) return { confirmed: '', pending: '' };
      const clipPath = `${FileSystem.cacheDirectory || ''}whisper_stream.pcm`;
      await FileSystem.writeAsStringAsync(toExpoUri(clipPath), combined, {
        encoding: FileSystem.EncodingType.Base64,
      });
      try {
        const res = await this.transcribeBuffer(handle, clipPath, options.language || 'hi');
        if (options.onChunk) options.onChunk(res.text, '');
        return { confirmed: res.text, pending: '' };
      } finally {
        try {
          await FileSystem.deleteAsync(toExpoUri(clipPath), { idempotent: true });
        } catch (_) {}
      }
    } finally {
      await modelManager.releaseModel(stt);
    }
  }

  /**
   * Expert A/B/C protocol on ONE Hindi clip (file mode, same audio):
   * A = language en (control), B = language hi, C = auto-detect.
   * Single acquire/release around all three; never throws (errors per variant).
   */
  async runSttAbcTest(audioPath: string): Promise<AbcVariantResult[]> {
    const out: AbcVariantResult[] = [];
    const disk = await modelManager.refreshStatuses();
    const diskLine = `disk: tiny=${disk['whisper-hindi'] || '?'} (need 78MB), base=${disk['whisper-base'] || '?'} (need 148MB)`;
    const stt = modelManager.getActiveSttModel();
    if (!stt) {
      throw new Error(`Whisper not ready. ${diskLine}. Re-download the full file on Wi-Fi from Profile → AI Models.`);
    }
    const ok = await modelManager.acquireModel(stt);
    if (!ok) {
      throw new Error(`Whisper file is ready but failed to load (${modelManager.getLastLoadError() || 'unknown'}).`);
    }
    const handle = modelManager.getModel(stt)?.nativeHandle;
    if (!handle) {
      await modelManager.releaseModel(stt);
      throw new Error('Whisper failed to load into memory.');
    }
    try {
      const variants: { label: string; language: string }[] = [
        { label: 'A (en)', language: 'en' },
        { label: 'B (hi)', language: 'hi' },
        { label: 'C (auto)', language: 'auto' },
      ];
      for (const v of variants) {
        try {
          const res = await this.transcribeBuffer(handle, audioPath, v.language);
          out.push({ label: v.label, text: res.text, segments: res.segments });
        } catch (e: any) {
          out.push({ label: v.label, text: `ERROR: ${e?.message || 'failed'}`, segments: 0 });
        }
      }
      return out;
    } finally {
      await modelManager.releaseModel(stt);
    }
  }

  async extractPatientData(transcript: string, options: ExtractOptions): Promise<any> {    const needle = needleNative();
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
