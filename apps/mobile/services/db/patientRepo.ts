import * as SQLite from 'expo-sqlite';
import { getDatabase } from './database';
import { Patient, SyncStatus } from '@asha/shared';

export const patientRepository = {
  async getAll(limit: number = 50, offset: number = 0): Promise<Patient[]> {
    const db = await getDatabase();
    const query = 'SELECT * FROM patients ORDER BY name ASC LIMIT ? OFFSET ?';
    const rows = await db.getAllAsync<Patient>(query, [limit, offset]);
    return rows;
  },

  async getById(id: string): Promise<Patient | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<Patient>(
      'SELECT * FROM patients WHERE id = ?',
      [id]
    );
    return row || null;
  },

  async search(query: string, limit = 50): Promise<Patient[]> {
    const db = await getDatabase();
    const clean = query.trim();
    if (!clean) return [];
    const prefixTerm = `${clean}%`;
    const rows = await db.getAllAsync<Patient>(
      `SELECT * FROM patients 
       WHERE name LIKE ? OR phone LIKE ? OR household_id LIKE ? OR village LIKE ?
       ORDER BY name ASC LIMIT ?`,
      [prefixTerm, prefixTerm, prefixTerm, prefixTerm, limit]
    );
    return rows;
  },

  async create(
    patient: Omit<Patient, 'created_at' | 'updated_at' | 'sync_status'> & { sync_status?: SyncStatus },
    tx?: SQLite.SQLiteDatabase
  ): Promise<Patient> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    const syncStatus: SyncStatus = patient.sync_status || 'pending';

    await runner.runAsync(
      `INSERT INTO patients (id, name, age, sex, phone, phone_owner, village, hamlet_tola, household_id, relationship_to_head, abha_id, disability_access_needs, consent_obtained, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient.id,
        patient.name,
        patient.age,
        patient.sex,
        patient.phone || null,
        patient.phone_owner || null,
        patient.village,
        patient.hamlet_tola || null,
        patient.household_id || null,
        patient.relationship_to_head || null,
        patient.abha_id || null,
        patient.disability_access_needs || null,
        patient.consent_obtained === false ? 0 : 1,
        now,
        now,
        syncStatus
      ]
    );

    return {
      ...patient,
      created_at: now,
      updated_at: now,
      sync_status: syncStatus
    };
  },

  async updateSyncStatus(id: string, status: SyncStatus, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    await runner.runAsync(
      'UPDATE patients SET sync_status = ?, updated_at = ? WHERE id = ?',
      [status, now, id]
    );
  },

  async getCount(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM patients');
    return row?.count || 0;
  },

  async getVillageBreakdown(): Promise<Array<{ village: string; patientCount: number; householdCount: number }>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ village: string; patientCount: number; householdCount: number }>(
      `SELECT village, COUNT(*) as patientCount, COUNT(DISTINCT household_id) as householdCount 
       FROM patients 
       GROUP BY village 
       ORDER BY patientCount DESC`
    );
    return rows;
  }
};
