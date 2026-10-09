import * as SQLite from 'expo-sqlite';
import { getDatabase } from './database';
import { SyncQueueItem } from '@asha/shared';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const syncQueueRepository = {
  async enqueue(
    entityType: 'patient' | 'screening' | 'followup' | 'worker',
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
    tx?: SQLite.SQLiteDatabase
  ): Promise<SyncQueueItem> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    const id = generateUUID();
    const payloadStr = JSON.stringify(payload);

    await runner.runAsync(
      `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(entity_type, entity_id, operation) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      [id, entityType, entityId, operation, payloadStr, now, now]
    );

    return {
      id,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      payload: payloadStr,
      attempts: 0,
      last_error: null,
      created_at: now,
      updated_at: now
    };
  },

  async getPending(): Promise<SyncQueueItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SyncQueueItem>(
      'SELECT * FROM sync_queue ORDER BY created_at ASC'
    );
    return rows;
  },

  async markSuccess(id: string, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    await runner.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  },

  async markFailed(id: string, error: string, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    await runner.runAsync(
      `UPDATE sync_queue 
       SET attempts = attempts + 1, last_error = ?, updated_at = ?
       WHERE id = ?`,
      [error, now, id]
    );
  },

  async getQueueCount(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue'
    );
    return row?.count || 0;
  },

  async clearAll(tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    await runner.runAsync('DELETE FROM sync_queue');
  }
};
