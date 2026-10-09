import { NativeModules } from 'react-native';
import { logger } from '../log';

export interface CactusStreamResult {
  success: boolean;
  confirmed: string;
  pending: string;
  decodeTokens: number;
  ttftMs: number;
}

function parseStreamJson(raw: string): CactusStreamResult {
  try {
    const parsed = JSON.parse(raw);
    return {
      success: parsed.success !== false,
      confirmed: parsed.confirmed || '',
      pending: parsed.pending || '',
      decodeTokens: typeof parsed.decode_tokens === 'number' ? parsed.decode_tokens : 0,
      ttftMs: typeof parsed.time_to_first_token_ms === 'number' ? parsed.time_to_first_token_ms : 0,
    };
  } catch {
    return { success: true, confirmed: '', pending: '', decodeTokens: 0, ttftMs: 0 };
  }
}

function getNative(): any | null {
  const m = (NativeModules as any)?.Cactus;
  if (!m || typeof m.init !== 'function') return null;
  return m;
}

export function isCactusBridgePresent(): boolean {
  return getNative() !== null;
}

export async function cactusInit(modelPath: string): Promise<string> {
  const cactus = getNative();
  if (!cactus) throw new Error('Cactus native module not linked in this build');
  return cactus.init(modelPath, null, false);
}

export async function cactusDestroy(handle: string): Promise<void> {
  const cactus = getNative();
  if (!cactus) return;
  try {
    await cactus.destroy(handle);
  } catch (err) {
    logger.warn('CactusBridge', 'destroy failed', { error: String(err) });
  }
}

export async function cactusTranscribePcm(
  handle: string,
  pcmBase64: string,
  optionsJson: string | null,
  prompt: string | null = null
): Promise<string> {
  const cactus = getNative();
  if (!cactus) throw new Error('Cactus native module not linked in this build');
  return cactus.transcribe(handle, null, prompt, optionsJson, pcmBase64);
}

export interface CactusFileResult {
  text: string;
  decodeTokens: number;
  confidence: number;
  segments: number;
  cloudHandoff: boolean;
}

export function parseFileResult(raw: string): CactusFileResult {
  try {
    const parsed = JSON.parse(raw);
    const segs = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segText = segs.map((s: any) => s.text || '').join(' ').trim();
    const text = (parsed.response || segText || parsed.text || parsed.confirmed || '').toString().trim();
    return {
      text,
      decodeTokens: typeof parsed.decode_tokens === 'number' ? parsed.decode_tokens : 0,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : -1,
      segments: segs.length,
      cloudHandoff: parsed.cloud_handoff === true,
    };
  } catch {
    return { text: raw.trim(), decodeTokens: 0, confidence: -1, segments: 0, cloudHandoff: false };
  }
}

export async function cactusStreamStart(handle: string, optionsJson: string | null): Promise<string> {
  const cactus = getNative();
  if (!cactus) throw new Error('Cactus native module not linked in this build');
  return cactus.streamTranscribeStart(handle, optionsJson);
}

export async function cactusStreamProcess(streamHandle: string, pcmBase64: string): Promise<CactusStreamResult> {
  const cactus = getNative();
  if (!cactus) throw new Error('Cactus native module not linked in this build');
  const raw: string = await cactus.streamTranscribeProcess(streamHandle, pcmBase64);
  return parseStreamJson(raw);
}

export async function cactusStreamStop(streamHandle: string): Promise<CactusStreamResult> {
  const cactus = getNative();
  if (!cactus) throw new Error('Cactus native module not linked in this build');
  const raw: string = await cactus.streamTranscribeStop(streamHandle);
  const parsed = parseStreamJson(raw);
  return { ...parsed, pending: '' };
}

export async function cactusComplete(handle: string, messagesJson: string, optionsJson: string | null): Promise<string> {
  const cactus = getNative();
  if (!cactus) throw new Error('Cactus native module not linked in this build');
  return cactus.complete(handle, messagesJson, optionsJson, null, null, false);
}
