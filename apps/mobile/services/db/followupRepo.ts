import * as SQLite from 'expo-sqlite';
import { getDatabase } from './database';
import { FollowUp, PriorityLevel, FollowUpStatus, SyncStatus } from '@asha/shared';

export type FollowUpWithPatient = FollowUp & {
  patient_name?: string;
  patient_phone?: string;
  patient_village?: string;
  notes?: string;
};

export const followupRepository = {
  async list(
    status?: FollowUpStatus,
    priority?: PriorityLevel,
    limit: number = 50,
    offset: number = 0
  ): Promise<FollowUpWithPatient[]> {
    const db = await getDatabase();
    let query = `
      SELECT f.*, p.name as patient_name, p.phone as patient_phone, p.village as patient_village
      FROM followups f
      LEFT JOIN patients p ON f.patient_id = p.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status) {
      query += ' AND f.status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND f.priority = ?';
      params.push(priority);
    }

    query += ' ORDER BY f.due_date ASC, f.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await db.getAllAsync<FollowUpWithPatient>(query, params);
    return rows;
  },

  async getById(id: string): Promise<FollowUp | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<FollowUp>(
      'SELECT * FROM followups WHERE id = ?',
      [id]
    );
    return row || null;
  },

  async create(
    followup: Omit<FollowUp, 'created_at' | 'updated_at' | 'sync_status'> & { sync_status?: SyncStatus },
    tx?: SQLite.SQLiteDatabase
  ): Promise<FollowUp> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    const syncStatus: SyncStatus = followup.sync_status || 'pending';

    await runner.runAsync(
      `INSERT INTO followups (id, patient_id, screening_id, reason, priority, due_date, status, destination, urgency, facility_reached, responsible_person, outcome, notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        followup.id,
        followup.patient_id,
        followup.screening_id || null,
        followup.reason,
        followup.priority,
        followup.due_date,
        followup.status,
        followup.destination || null,
        followup.urgency || null,
        followup.facility_reached ? 1 : 0,
        followup.responsible_person || null,
        followup.outcome || null,
        followup.notes || null,
        now,
        now,
        syncStatus
      ]
    );

    return {
      ...followup,
      created_at: now,
      updated_at: now,
      sync_status: syncStatus
    };
  },

  async updateStatus(id: string, status: FollowUpStatus, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    await runner.runAsync(
      'UPDATE followups SET status = ?, sync_status = ?, updated_at = ? WHERE id = ?',
      [status, 'pending', now, id]
    );
  },

  async update(id: string, updates: Partial<FollowUp>, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?', 'sync_status = ?'];
    const values: (string | number | null)[] = [now, 'pending'];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.reason !== undefined) {
      fields.push('reason = ?');
      values.push(updates.reason);
    }
    if (updates.due_date !== undefined) {
      fields.push('due_date = ?');
      values.push(updates.due_date);
    }
    if (updates.destination !== undefined) {
      fields.push('destination = ?');
      values.push(updates.destination || null);
    }
    if (updates.urgency !== undefined) {
      fields.push('urgency = ?');
      values.push(updates.urgency || null);
    }
    if (updates.facility_reached !== undefined) {
      fields.push('facility_reached = ?');
      values.push(updates.facility_reached ? 1 : 0);
    }
    if (updates.responsible_person !== undefined) {
      fields.push('responsible_person = ?');
      values.push(updates.responsible_person || null);
    }
    if (updates.outcome !== undefined) {
      fields.push('outcome = ?');
      values.push(updates.outcome || null);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes || null);
    }

    values.push(id);
    await runner.runAsync(
      `UPDATE followups SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  },

  async updateSyncStatus(id: string, status: SyncStatus, tx?: SQLite.SQLiteDatabase): Promise<void> {
    const runner = tx || (await getDatabase());
    const now = new Date().toISOString();
    await runner.runAsync(
      'UPDATE followups SET sync_status = ?, updated_at = ? WHERE id = ?',
      [status, now, id]
    );
  },

  async getCounts(): Promise<{ pending: number; completed: number }> {
    const db = await getDatabase();
    const pendingRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM followups WHERE status = 'pending'"
    );
    const completedRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM followups WHERE status = 'completed'"
    );
    return {
      pending: pendingRow?.count || 0,
      completed: completedRow?.count || 0,
    };
  }
};
