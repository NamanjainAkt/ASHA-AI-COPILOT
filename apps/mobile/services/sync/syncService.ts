import { syncQueueRepository } from '../db/syncQueueRepo';
import { patientRepository } from '../db/patientRepo';
import { screeningRepository } from '../db/screeningRepo';
import { followupRepository } from '../db/followupRepo';
import { getDatabase, getAppState, setAppState } from '../db/database';
import { logger } from '../log';
import { SyncPushPayload, SyncRecord, safeJsonParse } from '@asha/shared';

export interface SyncStatusReport {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
}

class SyncService {
  private backendUrl = 'http://127.0.0.1:8000'; // Default local FastAPI endpoint
  private deviceId = 'device-android-asha-001';
  private workerId = 'worker-001';
  private isSyncing = false;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;

  private authToken: string | null = null;

  setBackendUrl(url: string) {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    if (cleanUrl.startsWith('http://') && !cleanUrl.includes('127.0.0.1') && !cleanUrl.includes('localhost')) {
      logger.warn('SyncService', 'Using unencrypted HTTP for remote sync endpoint', { url: cleanUrl });
    }
    this.backendUrl = cleanUrl;
    this.authToken = null;
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  async ensureAuthToken(): Promise<string | null> {
    if (this.authToken) return this.authToken;
    try {
      const res = await fetch(`${this.backendUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'asha',
          password: 'password123',
          role: 'asha'
        })
      });
      if (res.ok) {
        const data = await res.json();
        this.authToken = data.access_token;
        return this.authToken;
      }
    } catch (err) {
      logger.warn('SyncService', 'Auto login failed', { err });
    }
    return null;
  }

  getBackendUrl(): string {
    return this.backendUrl;
  }

  async getStatus(): Promise<SyncStatusReport> {
    const pendingCount = await syncQueueRepository.getQueueCount();
    if (this.lastSyncTime === null) {
      try {
        this.lastSyncTime = await getAppState('last_sync_time');
      } catch {}
    }
    return {
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError
    };
  }

  async triggerSync(): Promise<{ success: boolean; processedCount: number; note?: string; error?: string }> {
    if (this.isSyncing) {
      return { success: false, processedCount: 0, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    this.lastError = null;

    try {
      const pendingItems = await syncQueueRepository.getPending();
      // ISS-153: Do not touch lastSyncTime on empty queue
      if (pendingItems.length === 0) {
        this.isSyncing = false;
        return { success: true, processedCount: 0, note: 'queue-empty' };
      }

      // ISS-136: Parse payloads individually so one corrupt row does not fail the batch
      const records: SyncRecord[] = [];
      const validItems: typeof pendingItems = [];

      for (const item of pendingItems) {
        try {
          const parsedPayload = safeJsonParse<Record<string, unknown> | null>(item.payload, null);
          if (!parsedPayload) {
            throw new Error('Unparseable payload JSON');
          }
          records.push({
            client_record_id: item.id, // ISS-157: transmit unique queue UUID
            entity: item.entity_type,
            operation: item.operation,
            timestamp: item.created_at,
            payload: {
              ...parsedPayload,
              id: item.entity_id // guarantee entity primary key
            }
          });
          validItems.push(item);
        } catch (parseErr: any) {
          logger.error('SyncService', `Corrupt sync queue payload for item ${item.id}`, parseErr);
          await syncQueueRepository.markFailed(item.id, `Invalid JSON payload: ${parseErr?.message || parseErr}`);
        }
      }

      if (validItems.length === 0) {
        this.isSyncing = false;
        return { success: false, processedCount: 0, error: 'All pending items had corrupt payloads' };
      }

      const payload: SyncPushPayload = {
        device_id: this.deviceId,
        worker_id: this.workerId,
        records
      };

      await this.ensureAuthToken();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      // Perform HTTP Push to FastAPI /sync/push
      let response = await fetch(`${this.backendUrl}/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        // Retry once with new token
        this.authToken = null;
        await this.ensureAuthToken();
        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
          response = await fetch(`${this.backendUrl}/sync/push`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
        }
      }

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();

      // Correlate acks by client_record_id (queue item UUID)
      const ackMap = new Map<string, string>((data.processed || []).map((p: any) => [p.client_record_id, p.status]));
      const failMap = new Map<string, string>((data.failed || []).map((f: any) => [f.client_record_id, f.error || '']));

      let processedCount = 0;
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        for (const item of validItems) {
          if (ackMap.has(item.id)) {
            processedCount++;
            await syncQueueRepository.markSuccess(item.id, db);

            if (item.entity_type === 'patient') {
              await patientRepository.updateSyncStatus(item.entity_id, 'synced', db);
            } else if (item.entity_type === 'screening') {
              await screeningRepository.updateSyncStatus(item.entity_id, 'synced', db);
            } else if (item.entity_type === 'followup') {
              await followupRepository.updateSyncStatus(item.entity_id, 'synced', db);
            }
          } else if (failMap.has(item.id)) {
            const errMsg = failMap.get(item.id) || 'Server rejected';
            await syncQueueRepository.markFailed(item.id, errMsg, db);
          }
        }
      });

      if (processedCount > 0) {
        this.lastSyncTime = new Date().toISOString();
        try {
          await setAppState('last_sync_time', this.lastSyncTime);
        } catch {}
      }
      this.isSyncing = false;

      return {
        success: true,
        processedCount
      };
    } catch (err: any) {
      logger.error('SyncService', 'Sync push request failed', err);
      this.lastError = err.message || 'Sync failed';
      this.isSyncing = false;
      return {
        success: false,
        processedCount: 0,
        error: this.lastError || undefined
      };
    }
  }
}

export const syncService = new SyncService();
