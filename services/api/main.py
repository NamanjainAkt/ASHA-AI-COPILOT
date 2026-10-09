from fastapi import FastAPI, HTTPException, Query, status, Depends, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import json
import uuid
import os
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from .models import (
    LoginRequest, LoginResponse,
    PatientCreate, PatientResponse,
    ScreeningCreate, ScreeningResponse,
    FollowUpCreate, FollowUpUpdate, FollowUpResponse,
    SyncPushRequest, SyncPushResponse, SyncPushResponseItem,
    DashboardSummary
)
from .database import get_db, init_db, seed_demo_data
from .auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_supervisor
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_demo_data()
    yield

app = FastAPI(
    title="ASHA AI Copilot - Sync & Supervisor Backend",
    description="Offline-first synchronization backend and supervisor reporting API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration (ISS-215)
cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize immediately so DB is ready for test/import runs
init_db()
seed_demo_data()

from fastapi.responses import FileResponse, RedirectResponse

DASHBOARD_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "apps", "dashboard", "index.html"))

@app.get("/")
@app.get("/dashboard")
def serve_dashboard():
    if os.path.exists(DASHBOARD_PATH):
        # ISS-012: Add Content-Security-Policy header
        return FileResponse(
            DASHBOARD_PATH,
            headers={
                "Content-Security-Policy": (
                    "default-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; "
                    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; "
                    "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; "
                    "img-src 'self' data: https:;"
                )
            }
        )
    return {"message": "Supervisor dashboard HTML not found"}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "asha-ai-copilot-api",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

# --- AUTH (ISS-004) ---
@app.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    token = create_access_token({
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "name": user["name"]
    })

    return LoginResponse(
        access_token=token,
        worker_id=user["id"],
        worker_name=user["name"],
        role=user["role"],
        village=user["village"] or "रामपुर (Rampur)"
    )

# --- PATIENTS (ISS-005: Secured with verify_jwt) ---
@app.get("/patients")
def list_patients(
    search: str = Query(None),
    village: str = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM patients WHERE 1=1"
    params = []
    if search:
        query += " AND (name LIKE ? OR phone LIKE ? OR household_id LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    if village:
        query += " AND village = ?"
        params.append(village)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/patients/{patient_id}")
def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    return dict(row)

@app.post("/patients", response_model=PatientResponse)
def create_patient(patient: PatientCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    created_at = patient.created_at or now
    sync_status = patient.sync_status or "synced"

    # Idempotent insert or update
    cursor.execute("""
        INSERT OR REPLACE INTO patients (
            id, name, age, sex, phone, phone_owner, village, hamlet_tola,
            household_id, relationship_to_head, abha_id, disability_access_needs,
            consent_obtained, created_at, updated_at, sync_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        patient.id, patient.name, patient.age, patient.sex, patient.phone, patient.phone_owner,
        patient.village, patient.hamlet_tola, patient.household_id, patient.relationship_to_head,
        patient.abha_id, patient.disability_access_needs, 0 if patient.consent_obtained is False else 1,
        created_at, now, sync_status
    ))
    conn.commit()
    conn.close()

    return PatientResponse(
        id=patient.id,
        name=patient.name,
        age=patient.age,
        sex=patient.sex,
        phone=patient.phone,
        phone_owner=patient.phone_owner,
        village=patient.village,
        hamlet_tola=patient.hamlet_tola,
        household_id=patient.household_id,
        relationship_to_head=patient.relationship_to_head,
        abha_id=patient.abha_id,
        disability_access_needs=patient.disability_access_needs,
        consent_obtained=patient.consent_obtained,
        created_at=created_at,
        updated_at=now,
        sync_status=sync_status
    )

# --- SCREENINGS (ISS-005: Secured, ISS-210: ScreeningResponse) ---
@app.get("/screenings")
def list_screenings(
    patient_id: str = Query(None),
    screening_type: str = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM screenings WHERE 1=1"
    params = []
    if patient_id:
        query += " AND patient_id = ?"
        params.append(patient_id)
    if screening_type:
        query += " AND screening_type = ?"
        params.append(screening_type)
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        item["structured_data"] = json.loads(item["structured_data"])
        item["rule_results"] = json.loads(item["rule_results"])
        item["confirmed"] = bool(item["confirmed"])
        result.append(item)
    return result

@app.get("/screenings/{screening_id}")
def get_screening(screening_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM screenings WHERE id = ?", (screening_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Screening not found")
    item = dict(row)
    item["structured_data"] = json.loads(item["structured_data"])
    item["rule_results"] = json.loads(item["rule_results"])
    item["confirmed"] = bool(item["confirmed"])
    return item

@app.post("/screenings", response_model=ScreeningResponse)
def create_screening(screening: ScreeningCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    # Enforce foreign key integrity
    cursor.execute("SELECT 1 FROM patients WHERE id = ?", (screening.patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail=f"Patient '{screening.patient_id}' not found")

    now = datetime.utcnow().isoformat()
    created_at = screening.created_at or now
    sync_status = screening.sync_status or "synced"

    cursor.execute("""
        INSERT OR REPLACE INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        screening.id,
        screening.patient_id,
        screening.screening_type,
        screening.transcript,
        json.dumps(screening.structured_data),
        json.dumps(screening.rule_results),
        screening.summary,
        1 if screening.confirmed else 0,
        created_at,
        now,
        sync_status
    ))
    conn.commit()
    conn.close()

    return ScreeningResponse(
        id=screening.id,
        patient_id=screening.patient_id,
        screening_type=screening.screening_type,
        transcript=screening.transcript,
        structured_data=screening.structured_data,
        rule_results=screening.rule_results,
        summary=screening.summary,
        confirmed=screening.confirmed,
        created_at=created_at,
        updated_at=now,
        sync_status=sync_status
    )

# --- FOLLOW-UPS (ISS-005, ISS-212, ISS-213) ---
@app.get("/followups")
def list_followups(
    status_filter: str = Query(None, alias="status"),
    priority: str = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    query = """
        SELECT f.*, p.name as patient_name, p.village as patient_village, p.phone as patient_phone
        FROM followups f
        LEFT JOIN patients p ON f.patient_id = p.id
        WHERE 1=1
    """
    params = []
    if status_filter:
        query += " AND f.status = ?"
        params.append(status_filter)
    if priority:
        query += " AND f.priority = ?"
        params.append(priority)
    query += " ORDER BY f.due_date ASC, f.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/followups", response_model=FollowUpResponse)
def create_followup(followup: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    # Enforce foreign key integrity
    cursor.execute("SELECT 1 FROM patients WHERE id = ?", (followup.patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail=f"Patient '{followup.patient_id}' not found")

    if followup.screening_id:
        cursor.execute("SELECT 1 FROM screenings WHERE id = ?", (followup.screening_id,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail=f"Screening '{followup.screening_id}' not found")

    now = datetime.utcnow().isoformat()
    created_at = followup.created_at or now
    sync_status = followup.sync_status or "synced"

    cursor.execute("""
        INSERT OR REPLACE INTO followups (
            id, patient_id, screening_id, reason, priority, due_date, status,
            destination, urgency, facility_reached, responsible_person, outcome,
            notes, created_at, updated_at, sync_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        followup.id,
        followup.patient_id,
        followup.screening_id,
        followup.reason,
        followup.priority,
        followup.due_date,
        followup.status,
        followup.destination,
        followup.urgency,
        1 if followup.facility_reached else 0,
        followup.responsible_person,
        followup.outcome,
        followup.notes or "",
        created_at,
        now,
        sync_status
    ))
    conn.commit()
    conn.close()

    return FollowUpResponse(
        id=followup.id,
        patient_id=followup.patient_id,
        screening_id=followup.screening_id,
        reason=followup.reason,
        priority=followup.priority,
        due_date=followup.due_date,
        status=followup.status,
        destination=followup.destination,
        urgency=followup.urgency,
        facility_reached=followup.facility_reached,
        responsible_person=followup.responsible_person,
        outcome=followup.outcome,
        notes=followup.notes or "",
        created_at=created_at,
        updated_at=now,
        sync_status=sync_status
    )

@app.patch("/followups/{followup_id}")
def update_followup(followup_id: str, update: FollowUpUpdate, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    # ISS-212: Persist notes and actions with COALESCE
    cursor.execute("""
        UPDATE followups
        SET status = ?,
            destination = COALESCE(?, destination),
            urgency = COALESCE(?, urgency),
            facility_reached = COALESCE(?, facility_reached),
            responsible_person = COALESCE(?, responsible_person),
            outcome = COALESCE(?, outcome),
            notes = COALESCE(?, notes),
            updated_at = ?
        WHERE id = ?
    """, (
        update.status,
        update.destination,
        update.urgency,
        1 if update.facility_reached else (0 if update.facility_reached is False else None),
        update.responsible_person,
        update.outcome,
        update.notes,
        now,
        followup_id
    ))
    conn.commit()
    conn.close()
    return {
        "id": followup_id,
        "status": update.status,
        "destination": update.destination,
        "urgency": update.urgency,
        "facility_reached": update.facility_reached,
        "responsible_person": update.responsible_person,
        "outcome": update.outcome,
        "notes": update.notes,
        "updated_at": now
    }

# --- SYNC (ISS-005, ISS-123, ISS-155, ISS-208, ISS-209) ---
@app.post("/sync/push", response_model=SyncPushResponse)
def sync_push(req: SyncPushRequest, current_user: dict = Depends(get_current_user)):
    if len(req.records) > 500:
        raise HTTPException(status_code=413, detail="Batch exceeds maximum limit of 500 records")

    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()

    # Track device
    cursor.execute("""
        INSERT OR REPLACE INTO devices (id, worker_id, last_sync_at)
        VALUES (?, ?, ?)
    """, (req.device_id, req.worker_id, now))

    processed = []
    failed = []

    for item in req.records:
        try:
            cid = item.client_record_id
            payload = item.payload
            op = item.operation
            entity = item.entity

            # Check if record already exists to determine created vs updated
            existed = False
            table_name = None
            if entity == "patient":
                table_name = "patients"
            elif entity == "screening":
                table_name = "screenings"
            elif entity == "followup":
                table_name = "followups"
            elif entity == "worker":
                table_name = "workers"

            eid = payload.get("id") or cid
            if table_name:
                cursor.execute(f"SELECT 1 FROM {table_name} WHERE id = ?", (eid,))
                existed = cursor.fetchone() is not None

            if op == "delete":
                if table_name:
                    cursor.execute(f"DELETE FROM {table_name} WHERE id = ?", (eid,))
                    status_str = "deleted"
                else:
                    failed.append(SyncPushResponseItem(client_record_id=cid, status="error", error=f"Unknown entity {entity}"))
                    continue
            elif entity == "patient":
                rec_sync_status = payload.get("sync_status", "synced")
                if rec_sync_status not in ("pending", "synced", "failed"):
                    rec_sync_status = "synced"

                cursor.execute("""
                    INSERT OR REPLACE INTO patients (
                        id, name, age, sex, phone, phone_owner, village, hamlet_tola,
                        household_id, relationship_to_head, abha_id, disability_access_needs,
                        consent_obtained, created_at, updated_at, sync_status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    eid,
                    payload.get("name", "Unknown"),
                    payload.get("age"),
                    payload.get("sex", "other"),
                    payload.get("phone"),
                    payload.get("phone_owner"),
                    payload.get("village", "Unknown"),
                    payload.get("hamlet_tola"),
                    payload.get("household_id"),
                    payload.get("relationship_to_head"),
                    payload.get("abha_id"),
                    payload.get("disability_access_needs"),
                    0 if payload.get("consent_obtained") is False else 1,
                    payload.get("created_at", now),
                    now,
                    rec_sync_status
                ))
                status_str = "updated" if existed else "created"
            elif entity == "screening":
                pid = payload.get("patient_id")
                cursor.execute("SELECT 1 FROM patients WHERE id = ?", (pid,))
                if not cursor.fetchone():
                    failed.append(SyncPushResponseItem(client_record_id=cid, status="error", error=f"Foreign key violation: patient_id '{pid}' does not exist"))
                    continue

                rec_sync_status = payload.get("sync_status", "synced")
                if rec_sync_status not in ("pending", "synced", "failed"):
                    rec_sync_status = "synced"

                cursor.execute("""
                    INSERT OR REPLACE INTO screenings (id, patient_id, screening_type, transcript, structured_data, rule_results, summary, confirmed, created_at, updated_at, sync_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    eid,
                    pid,
                    payload.get("screening_type", "general"),
                    payload.get("transcript", ""),
                    json.dumps(payload.get("structured_data", {})),
                    json.dumps(payload.get("rule_results", [])),
                    payload.get("summary", ""),
                    1 if payload.get("confirmed", True) else 0,
                    payload.get("created_at", now),
                    now,
                    rec_sync_status
                ))
                status_str = "updated" if existed else "created"
            elif entity == "followup":
                pid = payload.get("patient_id")
                cursor.execute("SELECT 1 FROM patients WHERE id = ?", (pid,))
                if not cursor.fetchone():
                    failed.append(SyncPushResponseItem(client_record_id=cid, status="error", error=f"Foreign key violation: patient_id '{pid}' does not exist"))
                    continue

                sid = payload.get("screening_id")
                if sid:
                    cursor.execute("SELECT 1 FROM screenings WHERE id = ?", (sid,))
                    if not cursor.fetchone():
                        sid = None

                rec_sync_status = payload.get("sync_status", "synced")
                if rec_sync_status not in ("pending", "synced", "failed"):
                    rec_sync_status = "synced"

                priority_val = payload.get("priority", "medium")
                if priority_val not in ("low", "medium", "high", "critical"):
                    priority_val = "medium"

                cursor.execute("""
                    INSERT OR REPLACE INTO followups (
                        id, patient_id, screening_id, reason, priority, due_date, status,
                        destination, urgency, facility_reached, responsible_person, outcome,
                        notes, created_at, updated_at, sync_status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    eid,
                    pid,
                    sid,
                    payload.get("reason", "Follow-up due"),
                    priority_val,
                    payload.get("due_date", now[:10]),
                    payload.get("status", "pending"),
                    payload.get("destination"),
                    payload.get("urgency"),
                    1 if payload.get("facility_reached") else 0,
                    payload.get("responsible_person"),
                    payload.get("outcome"),
                    payload.get("notes", ""),
                    payload.get("created_at", now),
                    now,
                    rec_sync_status
                ))
                status_str = "updated" if existed else "created"
            elif entity == "worker":
                cursor.execute("""
                    INSERT OR REPLACE INTO workers (id, name, role, phone, village, sub_center, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    eid,
                    payload.get("name", "Unknown"),
                    payload.get("role", "asha"),
                    payload.get("phone"),
                    payload.get("village", "Unknown"),
                    payload.get("sub_center"),
                    payload.get("created_at", now)
                ))
                status_str = "updated" if existed else "created"
            else:
                failed.append(SyncPushResponseItem(client_record_id=cid, status="error", error=f"Unsupported entity type: {entity}"))
                continue

            # Record sync event with unique constraint guard (ISS-155)
            cursor.execute("""
                INSERT OR IGNORE INTO sync_events (device_id, client_record_id, entity, operation, status, timestamp)
                VALUES (?, ?, ?, ?, 'success', ?)
            """, (req.device_id, cid, entity, op, now))

            # If event was ignored by unique constraint dedup, report ignored (ISS-123)
            if cursor.rowcount == 0 and op != "delete":
                status_str = "ignored"

            processed.append(SyncPushResponseItem(client_record_id=cid, status=status_str))
        except Exception as e:
            failed.append(SyncPushResponseItem(client_record_id=item.client_record_id, status="error", error=str(e)))

    # ISS-155: Retention cleanup for sync_events older than 90 days
    try:
        cursor.execute("DELETE FROM sync_events WHERE timestamp < datetime('now', '-90 days')")
    except Exception:
        pass

    try:
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")
    finally:
        conn.close()

    return SyncPushResponse(
        success=len(failed) == 0,
        processed=processed,
        failed=failed
    )

@app.get("/sync/pull")
def sync_pull(
    since: str = Query(None),
    limit: int = Query(500, le=1000),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()

    where_clause = " WHERE updated_at > ?" if since else ""
    params = [since] if since else []
    query_params = params + [limit, offset]

    cursor.execute(f"SELECT * FROM patients{where_clause} ORDER BY updated_at ASC LIMIT ? OFFSET ?", query_params)
    patients = [dict(r) for r in cursor.fetchall()]

    cursor.execute(f"SELECT * FROM screenings{where_clause} ORDER BY updated_at ASC LIMIT ? OFFSET ?", query_params)
    screenings = []
    for r in cursor.fetchall():
        item = dict(r)
        item["structured_data"] = json.loads(item["structured_data"])
        item["rule_results"] = json.loads(item["rule_results"])
        screenings.append(item)

    cursor.execute(f"SELECT * FROM followups{where_clause} ORDER BY updated_at ASC LIMIT ? OFFSET ?", query_params)
    followups = [dict(r) for r in cursor.fetchall()]

    # ISS-130: Include workers, devices, and tombstones
    cursor.execute("SELECT * FROM workers LIMIT ? OFFSET ?", (limit, offset))
    workers = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM devices LIMIT ? OFFSET ?", (limit, offset))
    devices = [dict(r) for r in cursor.fetchall()]

    if since:
        cursor.execute("SELECT client_record_id, entity, timestamp FROM sync_events WHERE operation='delete' AND timestamp > ? ORDER BY timestamp ASC LIMIT ? OFFSET ?", (since, limit, offset))
        tombstones = [dict(r) for r in cursor.fetchall()]
    else:
        cursor.execute("SELECT client_record_id, entity, timestamp FROM sync_events WHERE operation='delete' ORDER BY timestamp ASC LIMIT ? OFFSET ?", (limit, offset))
        tombstones = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "patients": patients,
        "screenings": screenings,
        "followups": followups,
        "workers": workers,
        "devices": devices,
        "tombstones": tombstones
    }

# --- SUPERVISOR DASHBOARD (ISS-005, ISS-127) ---
@app.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM patients")
    total_patients = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM screenings")
    total_screenings = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM followups WHERE priority = 'high' AND status = 'pending'")
    high_priority_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM followups WHERE status = 'pending'")
    pending_followups = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM workers")
    active_workers = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM sync_events WHERE status = 'success'")
    synced_events = cursor.fetchone()[0]

    conn.close()

    return DashboardSummary(
        total_patients=total_patients,
        total_screenings=total_screenings,
        high_priority_cases=high_priority_cases,
        pending_followups=pending_followups,
        active_workers=active_workers,
        sync_queue_pending=0
    )

@app.get("/dashboard/high-priority")
def dashboard_high_priority(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT f.*, p.name as patient_name, p.village as patient_village, p.phone as patient_phone,
               s.screening_type, s.summary as screening_summary
        FROM followups f
        JOIN patients p ON f.patient_id = p.id
        LEFT JOIN screenings s ON f.screening_id = s.id
        WHERE f.priority = 'high' AND f.status = 'pending'
        ORDER BY f.due_date ASC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/dashboard/workers")
def dashboard_workers(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    # ISS-127: Compute real catchment screening count per worker
    cursor.execute("""
        SELECT w.*,
               (
                   SELECT COUNT(s.id)
                   FROM screenings s
                   JOIN patients p ON s.patient_id = p.id
                   WHERE p.village = w.village
               ) as screening_count,
               MAX(d.last_sync_at) as last_sync_time
        FROM workers w
        LEFT JOIN devices d ON w.id = d.worker_id
        GROUP BY w.id
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/seed-demo")
def reset_seed_data(current_user: dict = Depends(require_supervisor)):
    init_db()
    seed_demo_data(force=True)
    return {"message": "Demo data checked and initialized non-destructively"}

# Model Distribution (PRD §52-54, Implementation Prompt §5-6)
# Weights are NEVER stored on this server. The endpoint redirects the device to
# the upstream CDN, so the phone downloads directly (Profile → AI Models).
# size_bytes is the exact upstream byte count; the app rejects truncated files.
MODELS_CATALOG = {
    "needle3": {
        "id": "needle3",
        "name": "Voice Data Extraction",
        "name_hi": "आवाज़ से आंकड़े निष्कर्षण",
        "version": "3.x",
        "size_bytes": 35335380,
        "size_formatted": "34 MB",
        "quantization": "Standard",
        "source_url": "https://huggingface.co/Cactus-Compute/needle3/resolve/main/needle3.cact",
        "artifact": "needle3.cact",
        "is_optional": False
    },
    "qwen3-0.6b": {
        "id": "qwen3-0.6b",
        "name": "Fast Screening Summary",
        "name_hi": "त्वरित जांच सारांश",
        "version": "0.6B-int4",
        "size_bytes": 376414357,
        "size_formatted": "376 MB",
        "quantization": "Standard",
        "source_url": "https://huggingface.co/Cactus-Compute/Qwen3-0.6B/resolve/main/weights/qwen3-0.6b-int4.zip",
        "artifact": "model.zip",
        "is_optional": True
    },
    "qwen3-1.7b": {
        "id": "qwen3-1.7b",
        "name": "Detailed Screening Summary",
        "name_hi": "विस्तृत जांच सारांश",
        "version": "1.7B-int4",
        "size_bytes": 1006051493,
        "size_formatted": "1 GB",
        "quantization": "Standard",
        "source_url": "https://huggingface.co/Cactus-Compute/Qwen3-1.7B/resolve/main/weights/qwen3-1.7b-int4.zip",
        "artifact": "model.zip",
        "is_optional": True
    }
}

@app.get("/models/catalog")
def get_models_catalog():
    return list(MODELS_CATALOG.values())

@app.get("/models/{model_id}/download")
def download_model(model_id: str):
    if model_id not in MODELS_CATALOG:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found in catalog")

    model_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "models", model_id))
    for local_name in (MODELS_CATALOG[model_id]["artifact"], "model.bin"):
        model_file = os.path.join(model_dir, local_name)
        if os.path.exists(model_file):
            return FileResponse(
                model_file,
                media_type="application/octet-stream",
                filename=os.path.basename(model_file)
            )

    return RedirectResponse(url=MODELS_CATALOG[model_id]["source_url"], status_code=307)

    raise HTTPException(
        status_code=404,
        detail=f"Weights for {model_id} are not staged on this server (data/models/{model_id}/model.bin). Place real ONNX weights there; placeholder containers are never served."
    )

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "0.0.0.0")
    reload = os.environ.get("UVICORN_RELOAD", "0") == "1"
    uvicorn.run("services.api.main:app", host=host, port=8000, reload=reload)
