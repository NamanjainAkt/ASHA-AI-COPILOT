import sqlite3
import json
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from .auth import hash_password

DB_PATH = os.path.join(os.path.dirname(__file__), "asha_backend.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        village TEXT,
        created_at TEXT NOT NULL
    );

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
        age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
        sex TEXT NOT NULL CHECK (sex IN ('female', 'male', 'other')),
        phone TEXT,
        village TEXT NOT NULL,
        household_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'failed'))
    );

    CREATE TABLE IF NOT EXISTS screenings (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        screening_type TEXT NOT NULL,
        transcript TEXT,
        structured_data TEXT NOT NULL,
        rule_results TEXT NOT NULL,
        summary TEXT,
        confirmed INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'failed')),
        FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS followups (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        screening_id TEXT,
        reason TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'failed')),
        FOREIGN KEY (patient_id) REFERENCES patients(id),
        FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        last_sync_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        client_record_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL
    );
    """)

    # Deduplicate sync_events before adding unique index if table exists
    cursor.execute("""
        DELETE FROM sync_events WHERE id NOT IN (
            SELECT MIN(id) FROM sync_events GROUP BY device_id, client_record_id, operation
        );
    """)

    cursor.executescript("""
    CREATE UNIQUE INDEX IF NOT EXISTS ux_sync ON sync_events(device_id, client_record_id, operation);
    CREATE INDEX IF NOT EXISTS idx_screenings_patient ON screenings(patient_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_screenings_updated ON screenings(updated_at);
    CREATE INDEX IF NOT EXISTS idx_followups_priority ON followups(status, priority, due_date);
    CREATE INDEX IF NOT EXISTS idx_followups_updated ON followups(updated_at);
    CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at);
    CREATE INDEX IF NOT EXISTS idx_patients_village ON patients(village);
    CREATE INDEX IF NOT EXISTS idx_sync_events_timestamp ON sync_events(timestamp);
    """)

    # Check for sub_center column in workers table for schema drift migration
    try:
        cursor.execute("SELECT sub_center FROM workers LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE workers ADD COLUMN sub_center TEXT")

    # Check for notes column in followups table
    try:
        cursor.execute("SELECT notes FROM followups LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE followups ADD COLUMN notes TEXT")

    # Seed default users
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO users (id, username, password_hash, role, name, village, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("user-sup-001", "supervisor", hash_password("password123"), "supervisor", "डॉ. राजेश वर्मा (Dr. Rajesh Verma)", "पीएचसी रामपुर (PHC Rampur)", now)
        )
        cursor.execute(
            "INSERT INTO users (id, username, password_hash, role, name, village, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("user-asha-001", "asha", hash_password("password123"), "asha", "सुनीता दीदी (Sunita Devi)", "रामपुर (Rampur)", now)
        )

    # Seed default worker if none exists
    cursor.execute("SELECT COUNT(*) FROM workers")
    if cursor.fetchone()[0] == 0:
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO workers (id, name, role, phone, village, sub_center, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("worker-001", "सुनीता दीदी (Sunita Devi)", "asha", "+91 9876543210", "रामपुर (Rampur)", "सब-सेंटर रामपुर", now)
        )
        cursor.execute(
            "INSERT INTO workers (id, name, role, phone, village, sub_center, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("supervisor-001", "डॉ. राजेश वर्मा (Dr. Rajesh Verma)", "supervisor", "+91 9876500000", "पीएचसी रामपुर (PHC Rampur)", "पीएचसी रामपुर", now)
        )

    conn.commit()
    conn.close()

def seed_demo_data(force: bool = False):
    # Guard: env var gate (ISS-150)
    if not force and os.environ.get("ASHA_SEED_DEMO", "1") == "0":
        return

    conn = get_db()
    cursor = conn.cursor()

    # Guard: only seed if patients table is empty (ISS-150 / ISS-008)
    if not force:
        cursor.execute("SELECT COUNT(*) FROM patients")
        if cursor.fetchone()[0] > 0:
            conn.close()
            return

    now = datetime.utcnow().isoformat()
    due_today = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    due_3d = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d")

    demo_patients = [
        ("p-001", "सुनीता देवी (Sunita Devi)", 48, "female", "+91 9876500001", "रामपुर (Rampur)", "HH-101", now, now),
        ("p-002", "मीना कुमारी (Meena Kumari)", 24, "female", "+91 9876500002", "रामपुर (Rampur)", "HH-104", now, now),
        ("p-003", "रमेश कुमार (Ramesh Kumar)", 56, "male", "+91 9876500003", "शिवपुर (Shivpur)", "HH-202", now, now),
        ("p-004", "आशा शर्मा (Asha Sharma)", 32, "female", "+91 9876500004", "रामपुर (Rampur)", "HH-108", now, now),
        ("p-005", "मनोज वर्मा (Manoj Verma)", 62, "male", "+91 9876500005", "कासिमपुर (Qasimpur)", "HH-305", now, now),
    ]

    for p in demo_patients:
        cursor.execute("""
            INSERT OR IGNORE INTO patients (id, name, age, sex, phone, village, household_id, created_at, updated_at, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
        """, p)

    # Demo screening for Sunita Devi (Hypertension high risk)
    ncd_data = {
        "screening_type": "ncd",
        "ncd": {
            "bp_systolic": 165,
            "bp_diastolic": 105,
            "blood_glucose": 142,
            "tobacco_use": False,
            "alcohol_use": False,
            "known_hypertension": True,
            "medication_adherence": False,
            "symptoms": ["सिरदर्द (headache)", "चक्कर आना (dizziness)"]
        }
    }
    rules_data = [
        {
            "ruleId": "RULE_NCD_BP_HIGH",
            "ruleName": "Elevated Blood Pressure",
            "triggered": True,
            "priority": "medium",
            "reason": "Blood pressure 165/105 mmHg exceeds protocol threshold (140/90).",
            "reason_hi": "रक्तचाप (165/105 mmHg) मानक सीमा से अधिक है।",
            "nextWorkflow": "Schedule follow-up check and refer to ANM/MO."
        },
        {
            "ruleId": "RULE_NCD_MED_NON_ADHERENCE",
            "ruleName": "Missed Medication",
            "triggered": True,
            "priority": "medium",
            "reason": "Known hypertension patient reported missed medication.",
            "reason_hi": "मरीज नियमित रूप से अपनी बीपी की दवा नहीं ले रहा है।",
            "nextWorkflow": "Reinforce daily adherence and verify drug supply."
        }
    ]
    summary_text = "सुनीता देवी का रक्तचाप 165/105 mmHg दर्ज किया गया जो मानक सीमा से अधिक है। उन्होंने बताया कि उनकी दवा खत्म हो चुकी है। 7 दिनों में फॉलो-अप एवं पीएचसी रेफरल आवश्यक है।"

    cursor.execute("""
        INSERT OR IGNORE INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    """, (
        "s-001",
        "p-001",
        "ncd",
        "सुनीता देवी उम्र 48 साल, बीपी 165 बटा 105 आया है, शुगर 142 है। दो हफ्ते से बीपी की गोली नहीं खा रही हैं और सिर में भारीपन है।",
        json.dumps(ncd_data),
        json.dumps(rules_data),
        summary_text,
        1,
        now,
        now
    ))

    cursor.execute("""
        INSERT OR IGNORE INTO followups (id, patient_id, screening_id, reason, priority, due_date, status, notes, created_at, updated_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    """, (
        "f-001",
        "p-001",
        "s-001",
        "रक्तचाप पुनः जांच एवं दवा परामर्श (BP Re-check & adherence)",
        "high",
        due_today,
        "pending",
        "Adherence reinforcement scheduled",
        now,
        now
    ))

    # Meena Kumari (Pregnancy danger sign demo)
    preg_data = {
        "screening_type": "pregnancy",
        "pregnancy": {
            "pregnancy_status": "pregnant",
            "gestational_age_weeks": 28,
            "vaginal_bleeding": True,
            "severe_headache": True,
            "blurred_vision": False,
            "severe_abdominal_pain": True,
            "reduced_fetal_movement": False,
            "swelling": True,
            "fever": False
        }
    }
    preg_rules = [
        {
            "ruleId": "RULE_MATERNAL_BLEEDING",
            "ruleName": "Vaginal Bleeding in Pregnancy",
            "triggered": True,
            "priority": "high",
            "reason": "Maternal danger sign: Vaginal bleeding reported at 28 weeks gestation.",
            "reason_hi": "गर्भावस्था में रक्तस्राव (Vaginal Bleeding) खतरे का लक्षण है। तत्काल अस्पताल ले जाएं।",
            "nextWorkflow": "Immediate emergency referral to CHC/FRU via 108 ambulance."
        }
    ]
    preg_summary = "मीना कुमारी (28 सप्ताह गर्भवती) को पेट में दर्द और रक्तस्राव की शिकायत है। यह मातृ खतरे का लक्षण है। 108 एम्बुलेंस से तत्काल सीएचसी रेफरल करें।"

    cursor.execute("""
        INSERT OR IGNORE INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    """, (
        "s-002",
        "p-002",
        "pregnancy",
        "मीना कुमारी 28 हफ्ते की गर्भवती हैं, उनको आज सुबह से हल्का खून बह रहा है और पेट के निचले हिस्से में तेज दर्द है।",
        json.dumps(preg_data),
        json.dumps(preg_rules),
        preg_summary,
        1,
        now,
        now
    ))

    cursor.execute("""
        INSERT OR IGNORE INTO followups (id, patient_id, screening_id, reason, priority, due_date, status, notes, created_at, updated_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    """, (
        "f-002",
        "p-002",
        "s-002",
        "आपातकालीन मातृ रेफरल - रक्तस्राव (Emergency Maternal Referral)",
        "high",
        due_3d,
        "pending",
        "Emergency referral initiated",
        now,
        now
    ))

    conn.commit()
    conn.close()
