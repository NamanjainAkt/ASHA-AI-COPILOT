import * as SQLite from 'expo-sqlite';
import { evaluateRules, StructuredScreeningData } from '@asha/shared';

const DB_NAME = 'asha_copilot.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DB_NAME);
        await initDatabase(db);
        return db;
      } catch (err) {
        // Reset promise on error so subsequent attempts can retry
        dbPromise = null;
        throw err;
      }
    })();
  }
  return dbPromise;
}

export async function getAppState(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setAppState(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', [key, value]);
}

export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  // Execute PRD Section 37 Tables with Hardened Constraints (ISS-228, ISS-229)
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      phone TEXT,
      village TEXT NOT NULL,
      sub_center TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER CHECK (age IS NULL OR (age BETWEEN 0 AND 130)),
      sex TEXT NOT NULL CHECK (sex IN ('female', 'male', 'other')),
      phone TEXT,
      phone_owner TEXT,
      village TEXT NOT NULL,
      hamlet_tola TEXT,
      household_id TEXT,
      relationship_to_head TEXT,
      abha_id TEXT,
      disability_access_needs TEXT,
      consent_obtained INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed'))
    );

    CREATE TABLE IF NOT EXISTS screenings (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      screening_type TEXT NOT NULL,
      transcript TEXT,
      structured_data TEXT NOT NULL CHECK (json_valid(structured_data)),
      rule_results TEXT NOT NULL CHECK (json_valid(rule_results)),
      summary TEXT,
      confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed')),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS followups (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      screening_id TEXT,
      reason TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      due_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
      destination TEXT,
      urgency TEXT,
      facility_reached INTEGER DEFAULT 0,
      responsible_person TEXT,
      outcome TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
      payload TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(entity_type, entity_id, operation)
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Indexes for high-performance queries and sync sweeps (ISS-227, ISS-157)
    CREATE UNIQUE INDEX IF NOT EXISTS ux_sync_queue_entity ON sync_queue(entity_type, entity_id, operation);
    CREATE INDEX IF NOT EXISTS idx_screenings_patient_created ON screenings(patient_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_screenings_updated ON screenings(updated_at);
    CREATE INDEX IF NOT EXISTS idx_followups_priority ON followups(status, priority, due_date);
    CREATE INDEX IF NOT EXISTS idx_followups_updated ON followups(updated_at);
    CREATE INDEX IF NOT EXISTS idx_patients_village ON patients(village);
    CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
  `);

  // PRAGMA user_version migration control with explicit switch list (ISS-231)
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;
  const TARGET_VERSION = 2;
  for (let v = currentVersion + 1; v <= TARGET_VERSION; v++) {
    switch (v) {
      case 1:
        // Migration v1: Baseline schema with sub_center, check constraints, indexes, unique constraints
        break;
      case 2:
        // Migration v2: Beneficiary profile fields and action tracking
        try {
          await db.execAsync(`
            ALTER TABLE patients ADD COLUMN phone_owner TEXT;
            ALTER TABLE patients ADD COLUMN hamlet_tola TEXT;
            ALTER TABLE patients ADD COLUMN relationship_to_head TEXT;
            ALTER TABLE patients ADD COLUMN abha_id TEXT;
            ALTER TABLE patients ADD COLUMN disability_access_needs TEXT;
            ALTER TABLE patients ADD COLUMN consent_obtained INTEGER DEFAULT 1;
            ALTER TABLE followups ADD COLUMN destination TEXT;
            ALTER TABLE followups ADD COLUMN urgency TEXT;
            ALTER TABLE followups ADD COLUMN facility_reached INTEGER DEFAULT 0;
            ALTER TABLE followups ADD COLUMN responsible_person TEXT;
            ALTER TABLE followups ADD COLUMN outcome TEXT;
          `);
        } catch (_) {}
        break;
      default:
        break;
    }
    await db.execAsync(`PRAGMA user_version = ${v};`);
  }

  // Check if seeding is needed via app_state gate (ISS-230)
  const seedInit = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_state WHERE key = 'seed_initialized';"
  );
  if (!seedInit || seedInit.value !== 'true') {
    if (seedInit?.value !== 'cleared') {
      const workerCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM workers;');
      if (!workerCount || workerCount.count === 0) {
        await seedDemoData(db);
      }
      await db.runAsync(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('seed_initialized', 'true');"
      );
    }
  }
}

/**
 * Clear all demo records (patients, screenings, follow-ups, sync queues)
 * and mark seed_initialized as 'cleared' so dummy records never reappear.
 */
export async function clearAllData(tx?: SQLite.SQLiteDatabase): Promise<void> {
  const runner = tx || (await getDatabase());
  await runner.withTransactionAsync(async () => {
    await runner.execAsync(`
      DELETE FROM followups;
      DELETE FROM screenings;
      DELETE FROM patients;
      DELETE FROM sync_queue;
      INSERT OR REPLACE INTO app_state (key, value) VALUES ('seed_initialized', 'cleared');
    `);
  });
}

export async function seedDemoData(db: SQLite.SQLiteDatabase): Promise<void> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const todayStr = now.split('T')[0];

  function addDays(d: Date, days: number): string {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res.toISOString().split('T')[0];
  }

  // Atomically seed all tables in a single transaction (Item 4 / Durability)
  await db.withTransactionAsync(async () => {
    // 1. Worker
    await db.runAsync(
      `INSERT OR REPLACE INTO workers (id, name, role, phone, village, sub_center, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['worker-001', 'सुनीता दीदी', 'asha', '+91 9876543210', 'रामपुर', 'SubCenter-1', now]
    );

  // 2. 5 Synthetic Patients (PRD Section 70) - Clean single-script names, sync_status: pending (ISS-230)
  const demoPatients = [
    {
      id: 'p-001',
      name: 'सुनीता देवी',
      age: 48,
      sex: 'female',
      phone: '+91 9876500001',
      village: 'रामपुर',
      household_id: 'HH-101'
    },
    {
      id: 'p-002',
      name: 'मीना कुमारी',
      age: 24,
      sex: 'female',
      phone: '+91 9876500002',
      village: 'रामपुर',
      household_id: 'HH-104'
    },
    {
      id: 'p-003',
      name: 'रमेश कुमार',
      age: 56,
      sex: 'male',
      phone: '+91 9876500003',
      village: 'शिवपुर',
      household_id: 'HH-202'
    },
    {
      id: 'p-004',
      name: 'आशा शर्मा',
      age: 32,
      sex: 'female',
      phone: '+91 9876500004',
      village: 'रामपुर',
      household_id: 'HH-108'
    },
    {
      id: 'p-005',
      name: 'मनोज वर्मा',
      age: 62,
      sex: 'male',
      phone: '+91 9876500005',
      village: 'कासिमपुर',
      household_id: 'HH-305'
    }
  ];

  for (const p of demoPatients) {
    await db.runAsync(
      `INSERT OR REPLACE INTO patients (id, name, age, sex, phone, village, household_id, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [p.id, p.name, p.age, p.sex, p.phone, p.village, p.household_id, now, now]
    );
  }

  // 3. Demo Screenings
  // Screening 1: Sunita Devi - Hypertension & Missed Meds
  const s1Structured: StructuredScreeningData = {
    screening_type: 'ncd',
    ncd: {
      bp_systolic: 165,
      bp_diastolic: 105,
      blood_glucose: 142,
      tobacco_use: false,
      alcohol_use: false,
      known_hypertension: true,
      known_diabetes: false,
      medication_adherence: false,
      symptoms: ['सिरदर्द (headache)', 'चक्कर आना (dizziness)'],
      measurement_date: todayStr
    },
    field_status: {
      bp_systolic: 'present',
      bp_diastolic: 'present',
      blood_glucose: 'present'
    }
  };

  // Evaluate directly via shared clinical rules engine (ISS-229)
  const s1Rules = evaluateRules(s1Structured);

  await db.runAsync(
    `INSERT OR REPLACE INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      's-001',
      'p-001',
      'ncd',
      'सुनीता देवी उम्र 48 साल, बीपी 165 बटा 105 आया है, शुगर 142 है। दो हफ्ते से बीपी की गोली नहीं खा रही हैं और सिर में भारीपन है।',
      JSON.stringify(s1Structured),
      JSON.stringify(s1Rules),
      'सुनीता देवी का रक्तचाप 165/105 mmHg दर्ज किया गया। उन्होंने बताया कि उनकी दवा खत्म हो चुकी है। 7 दिनों में फॉलो-अप एवं पीएचसी रेफरल आवश्यक है।',
      1,
      now,
      now
    ]
  );

  // Screening 2: Meena Kumari - Maternal Danger Signs (Bleeding + Headache)
  const s2Structured: StructuredScreeningData = {
    screening_type: 'pregnancy',
    pregnancy: {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: 28,
      vaginal_bleeding: true,
      severe_headache: true,
      blurred_vision: false,
      severe_abdominal_pain: true,
      reduced_fetal_movement: false,
      swelling: true,
      fever: false,
      follow_up_required: true
    },
    field_status: {
      pregnancy_status: 'present',
      vaginal_bleeding: 'present'
    }
  };

  // Evaluate directly via shared clinical rules engine (ISS-229)
  const s2Rules = evaluateRules(s2Structured);

  await db.runAsync(
    `INSERT OR REPLACE INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      's-002',
      'p-002',
      'pregnancy',
      'मीना कुमारी 28 हफ्ते की गर्भवती हैं, उनको आज सुबह से हल्का खून बह रहा है और पेट में तेज दर्द तथा सिरदर्द है।',
      JSON.stringify(s2Structured),
      JSON.stringify(s2Rules),
      'मीना कुमारी (28 सप्ताह गर्भवती) को पेट में दर्द और रक्तस्राव की शिकायत है। यह मातृ खतरे का लक्षण है। 108 एम्बुलेंस से तत्काल सीएचसी रेफरल करें।',
      1,
      now,
      now
    ]
  );

  // 4. Demo Follow-ups (PRD Section 70) with dynamic due dates (ISS-230)
  const demoFollowups = [
    {
      id: 'f-001',
      patient_id: 'p-001',
      screening_id: 's-001',
      reason: 'रक्तचाप पुनः जांच एवं दवा परामर्श (BP Re-check & adherence)',
      priority: 'high',
      due_date: todayStr,
      status: 'pending'
    },
    {
      id: 'f-002',
      patient_id: 'p-002',
      screening_id: 's-002',
      reason: 'आपातकालीन मातृ रेफरल - रक्तस्राव (Emergency Maternal Referral)',
      priority: 'high',
      due_date: todayStr,
      status: 'pending'
    },
    {
      id: 'f-003',
      patient_id: 'p-003',
      screening_id: null,
      reason: 'डायबिटीज वार्षिक जांच एवं शुगर री-चेक (Annual Diabetes Check)',
      priority: 'medium',
      due_date: addDays(nowDate, 5),
      status: 'pending'
    },
    {
      id: 'f-004',
      patient_id: 'p-004',
      screening_id: null,
      reason: 'नियमित टीकाकरण अनुवर्ती (Routine Immunization Follow-up)',
      priority: 'low',
      due_date: addDays(nowDate, 8),
      status: 'pending'
    },
    {
      id: 'f-005',
      patient_id: 'p-005',
      screening_id: null,
      reason: 'बुजुर्ग स्वास्थ्य जांच (Elderly Geriatric Assessment)',
      priority: 'low',
      due_date: addDays(nowDate, 11),
      status: 'pending'
    }
  ];

  for (const f of demoFollowups) {
    await db.runAsync(
      `INSERT OR REPLACE INTO followups (id, patient_id, screening_id, reason, priority, due_date, status, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [f.id, f.patient_id, f.screening_id, f.reason, f.priority, f.due_date, f.status, now, now]
    );
  }

  // Record seed initialization in app_state (ISS-230)
  await db.runAsync(
    `INSERT OR REPLACE INTO app_state (key, value) VALUES ('seed_initialized', 'true')`
  );
  });
}
