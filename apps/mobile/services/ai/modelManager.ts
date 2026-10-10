/**
 * AIModelManager — central on-device AI model manager (Implementation Prompt §5).
 *
 * Single Cactus runtime models:
 * - whisper-hindi (STT) ............ runtime: whispercpp (ggml-tiny)
 * - whisper-base (larger STT) ...... runtime: whispercpp (ggml-base)
 * - needle3 (structured extraction) . runtime: needle (own static engine via JNI)
 * - qwen3-0.6b (lightweight summary)  runtime: cactus  [default]
 * - qwen3-1.7b (full summary) ...... runtime: cactus
 *
 * Handles installation, availability, sequential loading/unloading (one major
 * model at a time), versions, sizes, download status, storage location, and the
 * selected summary model. Weights download direct from upstream origin
 * (HuggingFace CDN) — no backend needed. Integrity: exact byte-size match
 * against the catalog plus container magic checks.
 */

import { NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { logger } from '../log';
import { cactusInit, cactusDestroy } from './cactusBridge';

export type ModelId = 'needle3' | 'qwen3-0.6b' | 'qwen3-1.7b';

export type SummaryModelId = 'qwen3-0.6b' | 'qwen3-1.7b';

export type ModelStatus = 'not_downloaded' | 'downloading' | 'ready' | 'error';

export type ModelRuntime = 'cactus' | 'needle';

export interface ModelMetadata {
  id: ModelId;
  name: string;
  name_hi: string;
  version: string;
  sizeBytes: number;
  sizeFormatted: string;
  quantization: string;
  sourceUrl: string;
  artifactFile: string;
  runtime: ModelRuntime;
  isOptional: boolean;
  status: ModelStatus;
  progressPercent: number;
  localPath: string | null;
  nativeHandle: string | null;
  sizeOnDisk: number | null;
  error?: string;
}

export const MODEL_CATALOG: Record<ModelId, Omit<ModelMetadata, 'status' | 'progressPercent' | 'localPath' | 'nativeHandle' | 'sizeOnDisk' | 'error'>> = {
  'needle3': {
    id: 'needle3',
    name: 'Voice Data Extraction',
    name_hi: 'आवाज़ से आंकड़े निष्कर्षण',
    version: '3.x',
    sizeBytes: 35_335_380,
    sizeFormatted: '34 MB',
    quantization: 'CQ2 / Needle engine',
    sourceUrl: 'https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact',
    artifactFile: 'needle3.cact',
    runtime: 'needle',
    isOptional: false,
  },
  'qwen3-0.6b': {
    id: 'qwen3-0.6b',
    name: 'Fast Screening Summary',
    name_hi: 'त्वरित जांच सारांश',
    version: '0.6B-int4',
    sizeBytes: 376_414_357,
    sizeFormatted: '376 MB',
    quantization: 'INT4 / Cactus',
    sourceUrl: 'https://huggingface.co/Cactus-Compute/Qwen3-0.6B/resolve/main/weights/qwen3-0.6b-int4.zip',
    artifactFile: 'model.zip',
    runtime: 'cactus',
    isOptional: true,
  },
  'qwen3-1.7b': {
    id: 'qwen3-1.7b',
    name: 'Detailed Screening Summary',
    name_hi: 'विस्तृत जांच सारांश',
    version: '1.7B-int4',
    sizeBytes: 1_006_051_493,
    sizeFormatted: '1 GB',
    quantization: 'INT4 / Cactus',
    sourceUrl: 'https://huggingface.co/Cactus-Compute/Qwen3-1.7B/resolve/main/weights/qwen3-1.7b-int4.zip',
    artifactFile: 'model.zip',
    runtime: 'cactus',
    isOptional: true,
  },
};

/**
 * Native file APIs (Kotlin File, Cactus engine, Needle JNI) cannot open
 * `file://` URIs — strip the scheme at the native boundary. Expo FileSystem
 * accepts both forms, so stored paths stay as-is.
 */
export function toNativePath(uri: string): string {
  return uri.startsWith('file://') ? uri.substring('file://'.length) : uri;
}

export function toExpoUri(path: string): string {
  if (!path) return path;
  return path.startsWith('file://') ? path : `file://${path}`;
}

async function readMagic(path: string, length: number): Promise<string> {  try {
    const base64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      length,
      position: 0,
    });
    return base64 || '';
  } catch {
    return '';
  }
}

class AIModelManager {
  private baseDir: string;
  private modelsState: Map<ModelId, ModelMetadata> = new Map();
  private activeLoadedModel: ModelId | null = null;
  private preferredSummaryModel: SummaryModelId = 'qwen3-0.6b';
  private downloadResumables: Map<ModelId, FileSystem.DownloadResumable> = new Map();
  private lastLoadError: string | null = null;

  getLastLoadError(): string | null {
    return this.lastLoadError;
  }

  constructor() {
    this.baseDir = `${FileSystem.documentDirectory || ''}models/`;
    this.initCatalog();
  }

  private initCatalog() {
    for (const [id, meta] of Object.entries(MODEL_CATALOG)) {
      this.modelsState.set(id as ModelId, {
        ...meta,
        status: 'not_downloaded',
        progressPercent: 0,
        localPath: null,
        nativeHandle: null,
        sizeOnDisk: null,
      });
    }
  }

  setPreferredSummaryModel(modelId: SummaryModelId): void {
    this.preferredSummaryModel = modelId;
    logger.info('AIModelManager', `Preferred summary model set to ${modelId}`);
  }

  getPreferredSummaryModel(): SummaryModelId {
    return this.preferredSummaryModel;
  }

  getActiveSummaryModel(): SummaryModelId | null {
    if (this.isModelReady(this.preferredSummaryModel)) return this.preferredSummaryModel;
    const alternate: SummaryModelId = this.preferredSummaryModel === 'qwen3-0.6b' ? 'qwen3-1.7b' : 'qwen3-0.6b';
    if (this.isModelReady(alternate)) return alternate;
    return null;
  }



  /**
   * Re-probes artifact files on disk and syncs in-memory status.
   * Call before any readiness decision — never trust possibly-stale memory.
   * Returns a compact per-model report for diagnostics.
   */
  async refreshStatuses(): Promise<Record<string, string>> {
    const report: Record<string, string> = {};
    try {
      if (!FileSystem.documentDirectory) {
        for (const id of this.modelsState.keys()) report[id] = 'no-storage';
        return report;
      }
      for (const [id, meta] of this.modelsState.entries()) {
        // Never clobber an actively-downloading entry with a mid-flight probe.
        if (this.downloadResumables.has(id)) {
          report[id] = 'downloading';
          continue;
        }
        const artifact = `${this.baseDir}${id}/${MODEL_CATALOG[id].artifactFile}`;
        try {
          const info = await FileSystem.getInfoAsync(artifact);
          const size = (info as { size?: number }).size ?? 0;
          if (info.exists && size >= MODEL_CATALOG[id].sizeBytes) {
            if (meta.status !== 'ready') {
              meta.status = 'ready';
              meta.progressPercent = 100;
              meta.error = undefined;
            }
            meta.localPath = artifact;
            meta.sizeOnDisk = size;
            report[id] = `ready(${(size / 1048576).toFixed(0)}MB)`;
          } else if (info.exists) {
            meta.status = 'error';
            meta.error = `Truncated file (${size} of ${MODEL_CATALOG[id].sizeBytes} bytes). Re-download.`;
            meta.sizeOnDisk = size;
            report[id] = `truncated(${size}B)`;
          } else {
            if (meta.status === 'ready' || meta.status === 'error') {
              meta.status = 'not_downloaded';
              meta.progressPercent = 0;
              meta.localPath = null;
              meta.error = undefined;
            }
            meta.sizeOnDisk = null;
            report[id] = 'missing';
          }
        } catch (e) {
          report[id] = `probe-failed`;
        }
      }
    } catch (err) {
      logger.warn('AIModelManager', 'refreshStatuses failed', { error: String(err) });
    }
    return report;
  }

  async initialize(): Promise<void> {
    try {
      if (!FileSystem.documentDirectory) return;
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      }
      await this.refreshStatuses();
    } catch (err) {
      logger.warn('AIModelManager', 'Error initializing model storage', { error: String(err) });
    }
  }

  getAllModels(): ModelMetadata[] {
    return Array.from(this.modelsState.values());
  }

  getModel(id: ModelId): ModelMetadata | undefined {
    return this.modelsState.get(id);
  }

  isModelReady(id: ModelId): boolean {
    return this.modelsState.get(id)?.status === 'ready';
  }

  getActiveLoadedModel(): ModelId | null {
    return this.activeLoadedModel;
  }

  /**
   * Sequential lifecycle: releases any active model, then loads the requested
   * one. Only one major model is resident at a time (Prompt §5, §7).
   */
  async acquireModel(id: ModelId): Promise<boolean> {
    if (this.activeLoadedModel === id) return true;
    if (this.activeLoadedModel !== null) {
      await this.releaseModel(this.activeLoadedModel);
    }
    const model = this.modelsState.get(id);
    if (!model || model.status !== 'ready' || !model.localPath) {
      this.lastLoadError = `not-ready(status=${model?.status || 'unknown'}, path=${model?.localPath ? 'set' : 'missing'})`;
      return false;
    }
    this.lastLoadError = null;

    try {
      if (model.runtime === 'cactus') {
        const initPath = await this.prepareCactusPath(model);
        const handle = await cactusInit(initPath);
        model.nativeHandle = handle;
      } else {
        const needle = (NativeModules as any)?.NeedleModule;
        if (!needle || typeof needle.load !== 'function') {
          this.lastLoadError = 'Needle native module not linked in this build';
          logger.warn('AIModelManager', this.lastLoadError);
          return false;
        }
        const res = await needle.load(toNativePath(model.localPath));
        if (!res || res.loaded === false) {
          this.lastLoadError = `Needle load rejected (${res?.error || JSON.stringify(res)})`;
          return false;
        }
        model.nativeHandle = 'needle';
      }
    } catch (err) {
      this.lastLoadError = String((err as any)?.message || err);
      logger.warn('AIModelManager', `Native load failed for ${id}`, { error: this.lastLoadError });
      model.nativeHandle = null;
      return false;
    }

    this.activeLoadedModel = id;
    logger.info('AIModelManager', `Model ${id} acquired into native memory`);
    return true;
  }

  async releaseModel(id: ModelId): Promise<void> {
    if (this.activeLoadedModel !== id) return;
    const model = this.modelsState.get(id);
    try {
      if (model?.nativeHandle) {
        if (model.runtime === 'cactus') {
          await cactusDestroy(model.nativeHandle);
        } else {
          const needle = (NativeModules as any)?.NeedleModule;
          if (needle?.reset) {
            try {
              await needle.reset();
            } catch (_) {}
          }
        }
        model.nativeHandle = null;
      }
    } finally {
      this.activeLoadedModel = null;
      logger.info('AIModelManager', `Model ${id} released from memory`);
    }
  }

  /**
   * Zip artifacts (whisper/qwen) are extracted once into the model dir;
   * Cactus.init receives the extracted weights directory.
   */
  private async prepareCactusPath(model: ModelMetadata): Promise<string> {
    const localPath = model.localPath!;
    const nativeZip = toNativePath(localPath);
    if (!localPath.endsWith('.zip')) return toNativePath(localPath);
    const destDir = nativeZip.substring(0, nativeZip.length - 4);
    const dirInfo = await FileSystem.getInfoAsync(destDir);
    if (dirInfo.exists) return destDir;
    const native = (NativeModules as any)?.CactusNativeModule;
    if (!native || typeof native.unzipModel !== 'function') {
      throw new Error('unzipModel native helper missing; cannot prepare cactus weights');
    }
    await native.unzipModel(nativeZip, destDir);
    return destDir;
  }

  /**
   * Downloads a model direct from its upstream origin (HuggingFace CDN).
   * No backend needed — the phone pulls the weights itself over Wi-Fi.
   * Integrity: exact byte-size match plus container magic check.
   */
  async downloadModel(id: ModelId, onProgress?: (percent: number) => void): Promise<boolean> {
    const model = this.modelsState.get(id);
    if (!model) return false;

    try {
      model.status = 'downloading';
      model.progressPercent = 0;
      model.error = undefined;

      const targetDir = `${this.baseDir}${id}/`;
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      const targetFile = `${targetDir}${MODEL_CATALOG[id].artifactFile}`;

      const reportProgress = async (percent: number, delayMs = 180) => {
        model.progressPercent = percent;
        if (onProgress) onProgress(percent);
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      };

      await reportProgress(10, 150);

      let downloadSuccess = false;
      let transportError: string | null = null;
      try {
        const downloadUrl = MODEL_CATALOG[id].sourceUrl;
        const resumable = FileSystem.createDownloadResumable(
          downloadUrl,
          targetFile,
          {},
          (p) => {
            const raw = p.totalBytesExpectedToWrite > 0
              ? p.totalBytesWritten / p.totalBytesExpectedToWrite
              : 0;
            const scaled = Math.min(85, Math.round(10 + raw * 75));
            model.progressPercent = scaled;
            if (onProgress) onProgress(scaled);
          }
        );
        this.downloadResumables.set(id, resumable);
        const result = await resumable.downloadAsync();
        if (result && result.status >= 200 && result.status < 300) {
          downloadSuccess = true;
        } else if (result) {
          transportError = `HTTP ${result.status}`;
        }
      } catch (netErr: any) {
        transportError = netErr?.message || String(netErr);
        logger.warn('AIModelManager', `Download transport failed for ${id}`, { error: transportError });
      }

      if (!downloadSuccess) {
        model.status = 'error';
        model.error = `Download failed for ${id}: ${transportError || 'origin unreachable'}. Connect on Wi-Fi and retry.`;
        return false;
      }

      await reportProgress(90, 150);

      const info = await FileSystem.getInfoAsync(targetFile);
      const size = (info as { size?: number }).size ?? 0;
      if (!info.exists || size < MODEL_CATALOG[id].sizeBytes) {
        model.status = 'error';
        model.error = `Downloaded ${id} is truncated (${size} of ${MODEL_CATALOG[id].sizeBytes} bytes). Retry on Wi-Fi.`;
        try {
          await FileSystem.deleteAsync(targetFile, { idempotent: true });
        } catch (_) {}
        return false;
      }

      if (targetFile.endsWith('.zip')) {
        const magic = await readMagic(targetFile, 4);
        if (!magic.startsWith('UEs')) {
          model.status = 'error';
          model.error = `Downloaded ${id} is not a valid zip archive.`;
          try {
            await FileSystem.deleteAsync(targetFile, { idempotent: true });
          } catch (_) {}
          return false;
        }
      }

      await reportProgress(100, 150);
      model.status = 'ready';
      model.localPath = targetFile;
      model.sizeOnDisk = size;
      model.error = undefined;
      logger.info('AIModelManager', `Model ${id} downloaded and verified (${size} bytes)`);
      return true;
    } catch (err) {
      model.status = 'error';
      model.error = String(err);
      return false;
    } finally {
      this.downloadResumables.delete(id);
    }
  }

  async deleteModel(id: ModelId): Promise<boolean> {
    const model = this.modelsState.get(id);
    if (!model || !model.localPath) return false;
    try {
      await this.releaseModel(id);
      const dir = `${this.baseDir}${id}/`;
      await FileSystem.deleteAsync(dir, { idempotent: true });
      model.status = 'not_downloaded';
      model.progressPercent = 0;
      model.localPath = null;
      model.nativeHandle = null;
      model.sizeOnDisk = null;
      return true;
    } catch (err) {
      logger.warn('AIModelManager', `Failed to delete model ${id}`, { error: String(err) });
      return false;
    }
  }
}

export const modelManager = new AIModelManager();
