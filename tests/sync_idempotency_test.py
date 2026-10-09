import sys
import os
import tempfile
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import uuid
_test_db_dir = tempfile.TemporaryDirectory(prefix="asha-sync-idempotency-test-")
os.environ["ASHA_DB_PATH"] = os.path.join(_test_db_dir.name, "asha_backend.db")
from fastapi.testclient import TestClient
from services.api.main import app

client = TestClient(app)

print("----------------------------------------------------")
print("RUNNING SYNC IDEMPOTENCY & AUTHENTICATION TESTS")
print("----------------------------------------------------")

# Step 0: Verify route protection (ISS-005)
unauth_res = client.get("/patients")
assert unauth_res.status_code == 401, f"Expected 401 without auth, got {unauth_res.status_code}"
print("[PASS] Step 0: Unauthenticated access to /patients correctly rejected (401)")

# Step 0b: Authenticate via /auth/login (ISS-004)
login_res = client.post("/auth/login", json={
    "username": "supervisor",
    "password": "password123",
    "role": "supervisor"
})
assert login_res.status_code == 200, f"Login failed: {login_res.text}"
token = login_res.json()["access_token"]
assert token, "Token must not be empty"
headers = {"Authorization": f"Bearer {token}"}
print("[PASS] Step 0b: Authentication succeeded, JWT token acquired")

test_patient_id = f"test-uuid-{uuid.uuid4()}"
test_screening_id = f"test-scr-{uuid.uuid4()}"
test_followup_id = f"test-flw-{uuid.uuid4()}"

payload = {
    "device_id": "test-device-001",
    "worker_id": "test-worker-001",
    "records": [
        {
            "client_record_id": test_patient_id,
            "entity": "patient",
            "operation": "create",
            "timestamp": "2026-10-06T12:00:00Z",
            "payload": {
                "name": "कमला देवी (Kamla Devi)",
                "age": 52,
                "sex": "female",
                "phone": "+91 9876599999",
                "village": "रामपुर (Rampur)",
                "household_id": "HH-999"
            }
        },
        {
            "client_record_id": test_screening_id,
            "entity": "screening",
            "operation": "create",
            "timestamp": "2026-10-06T12:05:00Z",
            "payload": {
                "patient_id": test_patient_id,
                "screening_type": "ncd",
                "transcript": "बीपी 130/85",
                "structured_data": {"bp_systolic": 130, "bp_diastolic": 85},
                "rule_results": [],
                "summary": "सामान्य रक्तचाप"
            }
        },
        {
            "client_record_id": test_followup_id,
            "entity": "followup",
            "operation": "create",
            "timestamp": "2026-10-06T12:10:00Z",
            "payload": {
                "patient_id": test_patient_id,
                "screening_id": test_screening_id,
                "reason": "नियमित फॉलो-अप",
                "priority": "low",
                "due_date": "2026-10-20",
                "status": "pending"
            }
        }
    ]
}

# Push 1: Multi-entity push
res1 = client.post("/sync/push", json=payload, headers=headers)
assert res1.status_code == 200, f"Push 1 failed: {res1.text}"
data1 = res1.json()
assert data1["success"] is True
assert len(data1["processed"]) == 3
assert data1["processed"][0]["status"] == "created"
print("[PASS] Step 1: Initial multi-entity sync push succeeded with status: created")

# Get counts
patients_after_push1 = len(client.get("/patients?limit=500", headers=headers).json())
screenings_after_push1 = len(client.get("/screenings?limit=500", headers=headers).json())

from services.api.database import get_db
conn = get_db()
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM sync_events WHERE device_id = 'test-device-001'")
events_after_push1 = cursor.fetchone()[0]
conn.close()

# Push 2: Exact duplicate push (idempotency check)
res2 = client.post("/sync/push", json=payload, headers=headers)
assert res2.status_code == 200, f"Push 2 failed: {res2.text}"
data2 = res2.json()
assert data2["success"] is True

patients_after_push2 = len(client.get("/patients?limit=500", headers=headers).json())
screenings_after_push2 = len(client.get("/screenings?limit=500", headers=headers).json())
assert patients_after_push1 == patients_after_push2, "Duplicate replay must not duplicate patients"
assert screenings_after_push1 == screenings_after_push2, "Duplicate replay must not duplicate screenings"

conn = get_db()
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM sync_events WHERE device_id = 'test-device-001'")
events_after_push2 = cursor.fetchone()[0]
conn.close()

# ISS-145: Verify sync_events table does NOT grow on duplicate replay due to ux_sync UNIQUE index
assert events_after_push1 == events_after_push2, f"sync_events grew from {events_after_push1} to {events_after_push2}; duplicate replay must be deduplicated by ux_sync (ISS-145)"
print(f"[PASS] Step 2: Idempotent duplicate replay verified! Entities & sync_events stable (Patients: {patients_after_push2}, Screenings: {screenings_after_push2}, Events: {events_after_push2})")

# Step 3: Verify /sync/pull retrieves synced records including tombstones & workers
pull_res = client.get("/sync/pull", headers=headers)
assert pull_res.status_code == 200
pull_data = pull_res.json()
matched = any(p["id"] == test_patient_id for p in pull_data["patients"])
assert matched is True, "Newly pushed patient must be retrievable in sync pull"
assert "workers" in pull_data, "Workers must be included in pull (ISS-130)"
assert "tombstones" in pull_data, "Tombstones must be included in pull (ISS-130)"
print("[PASS] Step 3: /sync/pull verified, retrieved newly synchronized records with workers and tombstones")

# Step 4: Verify delete operation (ISS-123)
delete_payload = {
    "device_id": "test-device-001",
    "worker_id": "test-worker-001",
    "records": [
        {
            "client_record_id": test_followup_id,
            "entity": "followup",
            "operation": "delete",
            "timestamp": "2026-10-06T12:20:00Z",
            "payload": {}
        }
    ]
}
del_res = client.post("/sync/push", json=delete_payload, headers=headers)
assert del_res.status_code == 200
del_data = del_res.json()
assert del_data["processed"][0]["status"] == "deleted"
print("[PASS] Step 4: Deletion via /sync/push succeeded with status: deleted")

# Step 5: Verify /seed-demo endpoint resets fixtures and updates dashboard summary (ISS-309)
seed_res = client.post("/seed-demo", headers=headers)
assert seed_res.status_code == 200, f"/seed-demo failed: {seed_res.text}"
seed_data = seed_res.json()
assert "initialized" in seed_data.get("message", "")

# Verify seed fixtures p-001, s-001, f-001 are present
p1_res = client.get("/patients?limit=500", headers=headers)
assert any(p["id"] == "p-001" for p in p1_res.json()), "Patient p-001 must exist after seed"

s1_res = client.get("/screenings?limit=500", headers=headers)
assert any(s["id"] == "s-001" for s in s1_res.json()), "Screening s-001 must exist after seed"

f1_res = client.get("/followups?limit=500", headers=headers)
assert any(f["id"] == "f-001" for f in f1_res.json()), "Followup f-001 must exist after seed"

# Verify /dashboard/summary counts match seed fixtures
dash_res = client.get("/dashboard/summary", headers=headers)
assert dash_res.status_code == 200
dash_data = dash_res.json()
assert dash_data["total_patients"] >= 5, f"Expected at least 5 patients in summary, got {dash_data['total_patients']}"
assert dash_data["total_screenings"] >= 2, f"Expected at least 2 screenings in summary, got {dash_data['total_screenings']}"
print("[PASS] Step 5: /seed-demo endpoint verified: resets fixtures p-001/s-001/f-001 and populates /dashboard/summary")

# Step 6 (ISS-139): Worker push and update operations in /sync/push
test_worker_id = f"test-worker-{uuid.uuid4()}"
worker_payload = {
    "device_id": "test-device-001",
    "worker_id": "test-worker-001",
    "records": [
        {
            "client_record_id": test_worker_id,
            "entity": "worker",
            "operation": "create",
            "timestamp": "2026-10-06T12:30:00Z",
            "payload": {
                "name": "पूजा दीदी (Pooja Didi)",
                "role": "asha",
                "phone": "+91 9876543219",
                "village": "रामपुर (Rampur)",
                "sub_center": "सब-सेंटर रामपुर"
            }
        },
        {
            "client_record_id": f"test-upd-{uuid.uuid4()}",
            "entity": "patient",
            "operation": "update",
            "timestamp": "2026-10-06T12:31:00Z",
            "payload": {
                "id": test_patient_id,
                "name": "कमला देवी (Kamla Devi - Updated)",
                "village": "रामपुर (Rampur)",
                "phone": "+91 9876599999"
            }
        }
    ]
}
w_res = client.post("/sync/push", json=worker_payload, headers=headers)
assert w_res.status_code == 200, f"Worker/Update push failed: {w_res.text}"
w_data = w_res.json()
assert w_data["success"] is True
assert w_data["processed"][0]["status"] == "created"
assert w_data["processed"][1]["status"] == "updated"
print("[PASS] Step 6: Worker push and entity update operations verified in /sync/push (ISS-139)")

# Step 7 (ISS-144): Direct POST /screenings endpoint with ScreeningResponse model
direct_scr_id = f"scr-direct-{uuid.uuid4()}"
scr_payload = {
    "id": direct_scr_id,
    "patient_id": "p-001",
    "screening_type": "ncd",
    "transcript": "ब्लड प्रेशर 140/90",
    "structured_data": {"bp_systolic": 140, "bp_diastolic": 90},
    "rule_results": [{"ruleId": "RULE_NCD_BP_HIGH", "triggered": True, "priority": "medium"}],
    "summary": "उच्च रक्तचाप स्क्रीनिंग",
    "confirmed": True
}
direct_scr_res = client.post("/screenings", json=scr_payload, headers=headers)
assert direct_scr_res.status_code == 200, f"Direct POST /screenings failed: {direct_scr_res.text}"
direct_scr_data = direct_scr_res.json()
assert direct_scr_data["id"] == direct_scr_id
assert direct_scr_data["sync_status"] == "synced"
assert direct_scr_data["confirmed"] is True
print("[PASS] Step 7: Direct POST /screenings endpoint verified with ScreeningResponse (ISS-144)")

# Step 8 (ISS-144, ISS-210): Direct POST /followups endpoint with FollowUpResponse model and notes
direct_flw_id = f"flw-direct-{uuid.uuid4()}"
flw_payload = {
    "id": direct_flw_id,
    "patient_id": "p-001",
    "screening_id": direct_scr_id,
    "reason": "रक्तचाप पुनः जांच",
    "priority": "medium",
    "due_date": "2026-10-25",
    "status": "pending",
    "notes": "Direct follow-up creation notes verified"
}
direct_flw_res = client.post("/followups", json=flw_payload, headers=headers)
assert direct_flw_res.status_code == 200, f"Direct POST /followups failed: {direct_flw_res.text}"
direct_flw_data = direct_flw_res.json()
assert direct_flw_data["id"] == direct_flw_id
assert direct_flw_data["notes"] == "Direct follow-up creation notes verified"
assert direct_flw_data["sync_status"] == "synced"
print("[PASS] Step 8: Direct POST /followups endpoint verified with FollowUpResponse & notes (ISS-144, ISS-210)")

# Step 9 (ISS-144, ISS-127): GET /dashboard/workers verifying metrics and status
workers_res = client.get("/dashboard/workers", headers=headers)
assert workers_res.status_code == 200, f"GET /dashboard/workers failed: {workers_res.text}"
workers_list = workers_res.json()
assert len(workers_list) > 0, "Dashboard workers list must not be empty"
assert "screening_count" in workers_list[0], "Worker item must contain screening_count"
print("[PASS] Step 9: GET /dashboard/workers verified with catchment screening metrics (ISS-127, ISS-144)")

# Step 10 (ISS-131, ISS-151, ISS-228): Foreign key enforcement and critical priority validation
fk_fail_res = client.post("/screenings", json={
    "id": f"scr-fk-fail-{uuid.uuid4()}",
    "patient_id": "non-existent-patient-999",
    "screening_type": "ncd",
    "structured_data": {"bp_systolic": 120, "bp_diastolic": 80},
    "rule_results": [],
    "summary": "Test"
}, headers=headers)
assert fk_fail_res.status_code == 404, f"Expected 404 for non-existent patient_id, got {fk_fail_res.status_code}"

sync_fk_res = client.post("/sync/push", json={
    "device_id": "test-device-001",
    "worker_id": "test-worker-001",
    "records": [{
        "client_record_id": f"rec-fk-{uuid.uuid4()}",
        "entity": "screening",
        "operation": "create",
        "timestamp": "2026-10-06T12:00:00Z",
        "payload": {
            "patient_id": "non-existent-patient-888",
            "screening_type": "ncd",
            "structured_data": {},
            "rule_results": []
        }
    }]
}, headers=headers)
assert sync_fk_res.status_code == 200
sync_fk_data = sync_fk_res.json()
assert len(sync_fk_data["failed"]) == 1, "Orphaned screening must fail FK validation"
assert "Foreign key violation" in sync_fk_data["failed"][0]["error"]

critical_flw_res = client.post("/followups", json={
    "id": f"flw-crit-{uuid.uuid4()}",
    "patient_id": "p-001",
    "reason": "अत्यधिक गंभीर स्थिति",
    "priority": "critical",
    "due_date": "2026-10-21",
    "status": "pending",
    "sync_status": "pending"
}, headers=headers)
assert critical_flw_res.status_code == 200, f"Critical priority follow-up failed: {critical_flw_res.text}"
assert critical_flw_res.json()["priority"] == "critical"
assert critical_flw_res.json()["sync_status"] == "pending"
print("[PASS] Step 10: Foreign key enforcement and critical priority/sync_status validated (ISS-131, ISS-151)")

# Step 11: Extended Form Fields (ABHA, Hamlet, Phone Owner, Destination, Urgency) via sync/push & sync/pull
ext_patient_id = f"test-p-ext-{uuid.uuid4()}"
ext_followup_id = f"test-f-ext-{uuid.uuid4()}"
ext_payload = {
    "device_id": "test-device-ext",
    "worker_id": "test-worker-001",
    "records": [
        {
            "client_record_id": ext_patient_id,
            "entity": "patient",
            "operation": "create",
            "timestamp": "2026-10-09T10:00:00Z",
            "payload": {
                "name": "सुषमा पटेल (Sushma Patel)",
                "age": 34,
                "sex": "female",
                "phone": "+91 9876543211",
                "phone_owner": "self",
                "village": "रामपुर (Rampur)",
                "hamlet_tola": "पटेल नगर (Patel Nagar)",
                "household_id": "HH-501",
                "relationship_to_head": "पत्नी (Wife)",
                "abha_id": "14-1234-5678-9012",
                "disability_access_needs": "दृष्टि दोष (Vision impaired)",
                "consent_obtained": True
            }
        },
        {
            "client_record_id": ext_followup_id,
            "entity": "followup",
            "operation": "create",
            "timestamp": "2026-10-09T10:05:00Z",
            "payload": {
                "patient_id": ext_patient_id,
                "reason": "मातृ स्वास्थ्य जांच (Maternal health visit)",
                "priority": "high",
                "due_date": "2026-10-15",
                "status": "pending",
                "destination": "phc",
                "urgency": "immediate",
                "facility_reached": False,
                "responsible_person": "asha",
                "outcome": "रेफरल पर्ची जारी (Referral slip issued)"
            }
        }
    ]
}
ext_res = client.post("/sync/push", json=ext_payload, headers=headers)
assert ext_res.status_code == 200, f"Extended fields push failed: {ext_res.text}"
ext_data = ext_res.json()
assert ext_data["success"] is True

# Pull and verify all fields survived roundtrip
pull_ext = client.get(f"/patients/{ext_patient_id}", headers=headers).json()
assert pull_ext["phone_owner"] == "self"
assert pull_ext["hamlet_tola"] == "पटेल नगर (Patel Nagar)"
assert pull_ext["relationship_to_head"] == "पत्नी (Wife)"
assert pull_ext["abha_id"] == "14-1234-5678-9012"
assert pull_ext["disability_access_needs"] == "दृष्टि दोष (Vision impaired)"
assert pull_ext["consent_obtained"] in (1, True)

pull_f_ext = client.get("/sync/pull", headers=headers).json()
matched_f = next((f for f in pull_f_ext["followups"] if f["id"] == ext_followup_id), None)
assert matched_f is not None, "Followup must be present in pull"
assert matched_f["destination"] == "phc"
assert matched_f["urgency"] == "immediate"
assert matched_f["responsible_person"] == "asha"
assert matched_f["outcome"] == "रेफरल पर्ची जारी (Referral slip issued)"
print("[PASS] Step 11: Extended form fields (ABHA, Hamlet, Phone Owner, Destination, Urgency) roundtrip verified")

total_checkpoints = 13  # Step 0, 0b, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 = 13 checkpoints
print("----------------------------------------------------")
print(f"ALL SYNC IDEMPOTENCY & AUTH TESTS PASSED ({total_checkpoints}/{total_checkpoints})")
print("----------------------------------------------------")
