import * as SQLite from 'expo-sqlite';
import { getDatabase } from './database';
import { Screening, SyncStatus, safeJsonParse } from '@asha/shared';

export const screeningRepository = {
  async create(
    screening: Omit<Screening, 'created_at' | 'updated_at' | 'sync_status'> & { sync_status?: SyncStatus },
    tx?: SQLite.SQLiteDatabase
  ): Promise<Screening> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    const syncStatus: SyncStatus = screening.sync_status || 'pending';

    await runner.runAsync(
      `INSERT INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        screening.id,
        screening.patient_id,
        screening.screening_type,
        screening.transcript || null,
        JSON.stringify(screening.structured_data || {}),
        JSON.stringify(screening.rule_results || []),
        screening.summary || null,
        screening.confirmed ? 1 : 0,
        now,
        now,
        syncStatus
      ]
    );

    return {
      ...screening,
      created_at: now,
      updated_at: now,
      sync_status: syncStatus
    };
  },

  async getById(id: string): Promise<Screening | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      patient_id: string;
      screening_type: string;
      transcript: string | null;
      structured_data: string;
      rule_results: string;
      summary: string | null;
      confirmed: number;
      created_at: string;
      updated_at: string;
      sync_status: string;
    }>('SELECT * FROM screenings WHERE id = ?', [id]);

    if (!row) return null;

    return {
      id: row.id,
      patient_id: row.patient_id,
      screening_type: row.screening_type as any,
      transcript: row.transcript || '',
      structured_data: safeJsonParse(row.structured_data, {} as any),
      rule_results: safeJsonParse(row.rule_results, []),
      summary: row.summary || '',
      confirmed: Boolean(row.confirmed),
      created_at: row.created_at,
      updated_at: row.updated_at,
      sync_status: row.sync_status as SyncStatus
    };
  },

  async list(patientId?: string, limit: number = 50, offset: number = 0): Promise<Screening[]> {
    const db = await getDatabase();
    let query = patientId
      ? 'SELECT * FROM screenings WHERE patient_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM screenings ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const params = patientId ? [patientId, limit, offset] : [limit, offset];

    const rows = await db.getAllAsync<{
      id: string;
      patient_id: string;
      screening_type: string;
      transcript: string | null;
      structured_data: string;
      rule_results: string;
      summary: string | null;
      confirmed: number;
      created_at: string;
      updated_at: string;
      sync_status: string;
    }>(query, params);

    return rows.map(row => ({
      id: row.id,
      patient_id: row.patient_id,
      screening_type: row.screening_type as any,
      transcript: row.transcript || '',
      structured_data: safeJsonParse(row.structured_data, {} as any),
      rule_results: safeJsonParse(row.rule_results, []),
      summary: row.summary || '',
      confirmed: Boolean(row.confirmed),
      created_at: row.created_at,
      updated_at: row.updated_at,
      sync_status: row.sync_status as SyncStatus
    }));
  },

  async updateSyncStatus(id: string, status: SyncStatus, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    await runner.runAsync(
      'UPDATE screenings SET sync_status = ?, updated_at = ? WHERE id = ?',
      [status, now, id]
    );
  },

  async getMetrics(): Promise<{
    total: number;
    highRisk: number;
    ncd: number;
    pregnancy: number;
    today: number;
  }> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      total: number;
      highRisk: number;
      ncd: number;
      pregnancy: number;
      today: number;
    }>(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN json_valid(rule_results) AND EXISTS (
          SELECT 1 FROM json_each(rule_results)
          WHERE json_extract(value, '$.priority') = 'high'
            AND (json_extract(value, '$.triggered') = 1 OR json_extract(value, '$.triggered') = true)
        ) THEN 1 ELSE 0 END), 0) as highRisk,
        COALESCE(SUM(CASE WHEN screening_type = 'ncd' THEN 1 ELSE 0 END), 0) as ncd,
        COALESCE(SUM(CASE WHEN screening_type = 'pregnancy' THEN 1 ELSE 0 END), 0) as pregnancy,
        COALESCE(SUM(CASE WHEN DATE(created_at, 'localtime') = DATE('now', 'localtime') THEN 1 ELSE 0 END), 0) as today
      FROM screenings
    `);

    return {
      total: row?.total ?? 0,
      highRisk: row?.highRisk ?? 0,
      ncd: row?.ncd ?? 0,
      pregnancy: row?.pregnancy ?? 0,
      today: row?.today ?? 0,
    };
  }
};
