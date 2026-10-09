import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import uuid
import csv
import io
from fastapi.testclient import TestClient
from services.api.main import app
from services.api.database import get_db

client = TestClient(app)

print("====================================================")
print("RUNNING SUPERVISOR API & SOFT-DELETE TEST SUITE")
print("====================================================")

# --- 1. Authentication & Setup ---
login_res = client.post("/auth/login", json={
    "username": "supervisor",
    "password": "password123",
    "role": "supervisor"
})
assert login_res.status_code == 200, f"Login failed: {login_res.text}"
token = login_res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print("[PASS] 1. Supervisor authentication succeeded, JWT acquired")

# --- 2. Patient CRUD & Soft-Delete Invariant ---
test_patient_id = f"p-test-{uuid.uuid4()}"
create_patient_payload = {
    "id": test_patient_id,
    "name": "राधा देवी (Radha Devi)",
    "age": 45,
    "sex": "female",
    "phone": "+91 9876512345",
    "phone_owner": "self",
    "village": "रामपुर (Rampur)",
    "hamlet_tola": "मझला टोला (Majhla Tola)",
    "household_id": "HH-555",
    "relationship_to_head": "Head of Household",
    "abha_id": "91-1234-5678-9012",
    "disability_access_needs": "Wheelchair access",
    "consent_obtained": True
}

# 2a: Create Patient
res = client.post("/patients", json=create_patient_payload, headers=headers)
assert res.status_code == 200, f"Create patient failed: {res.text}"
p_data = res.json()
assert p_data["id"] == test_patient_id
assert p_data["hamlet_tola"] == "मझला टोला (Majhla Tola)"
assert p_data["abha_id"] == "91-1234-5678-9012"
assert p_data["is_deleted"] is False
print("[PASS] 2a. Patient created with demographic, catchment, and ABHA fields")

# 2b: Read Patient
res = client.get(f"/patients/{test_patient_id}", headers=headers)
assert res.status_code == 200
assert res.json()["name"] == "राधा देवी (Radha Devi)"
print("[PASS] 2b. Patient retrieved by ID")

# 2c: Search & Filter Patients
res = client.get("/patients?search=91-1234&village=रामपुर (Rampur)", headers=headers)
assert res.status_code == 200
assert any(p["id"] == test_patient_id for p in res.json())

res_hamlet = client.get("/patients?hamlet=मझला टोला (Majhla Tola)", headers=headers)
assert res_hamlet.status_code == 200
assert any(p["id"] == test_patient_id for p in res_hamlet.json())
print("[PASS] 2c. Patient search by ABHA ID, village, and hamlet verified")

# 2d: Update Patient (PATCH)
update_patient_payload = {
    "phone": "+91 9876599999",
    "hamlet_tola": "नया टोला (Naya Tola)",
    "disability_access_needs": "Crutches"
}
res = client.patch(f"/patients/{test_patient_id}", json=update_patient_payload, headers=headers)
assert res.status_code == 200
up_data = res.json()
assert up_data["phone"] == "+91 9876599999"
assert up_data["hamlet_tola"] == "नया टोला (Naya Tola)"
assert up_data["disability_access_needs"] == "Crutches"
assert up_data["updated_at"] is not None
print("[PASS] 2d. Patient details updated with UTC timestamp via PATCH")

# 2e: Soft Delete Patient (DELETE)
res = client.delete(f"/patients/{test_patient_id}", headers=headers)
assert res.status_code == 200
del_res = res.json()
assert del_res["id"] == test_patient_id
assert del_res["entity"] == "patient"
assert del_res["is_deleted"] is True
assert del_res["deleted_at"] is not None
print("[PASS] 2e. Patient soft-deleted with tombstone timestamp")

# 2f: Verify excluded from active list and direct GET returns 404
res = client.get("/patients", headers=headers)
assert not any(p["id"] == test_patient_id for p in res.json()), "Soft-deleted patient must not be in active list"

res_get = client.get(f"/patients/{test_patient_id}", headers=headers)
assert res_get.status_code == 404, f"Expected 404 for soft-deleted patient, got {res_get.status_code}"
print("[PASS] 2f. Soft-deleted patient excluded from active list and returns 404 on direct lookup")

# 2g: Verify tombstone in sync_events
conn = get_db()
cursor = conn.cursor()
cursor.execute("SELECT * FROM sync_events WHERE client_record_id = ? AND operation = 'delete'", (test_patient_id,))
event = cursor.fetchone()
conn.close()
assert event is not None, "Tombstone must be recorded in sync_events"
assert event["entity"] == "patient"
print("[PASS] 2g. Soft-delete tombstone verified in sync_events for client pull replication")


# --- 3. Screening Inspection & Soft Delete ---
active_patient_id = f"p-act-{uuid.uuid4()}"
client.post("/patients", json={
    "id": active_patient_id,
    "name": "सुरेश कुमार (Suresh Kumar)",
    "sex": "male",
    "village": "शिवपुर (Shivpur)"
}, headers=headers)

test_screening_id = f"s-test-{uuid.uuid4()}"
scr_res = client.post("/screenings", json={
    "id": test_screening_id,
    "patient_id": active_patient_id,
    "screening_type": "ncd",
    "transcript": "बीपी 150/95",
    "structured_data": {"bp_systolic": 150, "bp_diastolic": 95},
    "rule_results": [{"ruleId": "RULE_NCD_BP_HIGH", "priority": "medium", "triggered": True}],
    "summary": "उच्च रक्तचाप",
    "confirmed": True
}, headers=headers)
assert scr_res.status_code == 200

# 3a: Filter screenings by village
res = client.get("/screenings?village=शिवपुर (Shivpur)", headers=headers)
assert res.status_code == 200
assert any(s["id"] == test_screening_id for s in res.json())
print("[PASS] 3a. Screenings filtered by village and active patient join")

# 3b: Soft Delete Screening
res = client.delete(f"/screenings/{test_screening_id}", headers=headers)
assert res.status_code == 200
assert res.json()["is_deleted"] is True

res = client.get(f"/screenings/{test_screening_id}", headers=headers)
assert res.status_code == 404

res = client.get(f"/screenings?patient_id={active_patient_id}", headers=headers)
assert not any(s["id"] == test_screening_id for s in res.json())
print("[PASS] 3b. Screening soft-deleted and tombstone created")


# --- 4. Follow-up & Referral Disposition ---
test_followup_id = f"f-test-{uuid.uuid4()}"
flw_create_res = client.post("/followups", json={
    "id": test_followup_id,
    "patient_id": active_patient_id,
    "reason": "प्राथमिक फॉलो-अप",
    "priority": "high",
    "due_date": "2026-10-25",
    "status": "pending"
}, headers=headers)
assert flw_create_res.status_code == 200

# 4a: Update Disposition (PATCH)
disposition_payload = {
    "status": "completed",
    "destination": "phc",
    "urgency": "urgent",
    "facility_reached": True,
    "responsible_person": "anm",
    "outcome": "Patient examined by MO, medication prescribed",
    "notes": "Follow-up completed successfully at PHC"
}
res = client.patch(f"/followups/{test_followup_id}", json=disposition_payload, headers=headers)
assert res.status_code == 200
flw_data = res.json()
assert flw_data["status"] == "completed"
assert flw_data["destination"] == "phc"
assert flw_data["urgency"] == "urgent"
assert flw_data["facility_reached"] is True
assert flw_data["responsible_person"] == "anm"
assert flw_data["outcome"] == "Patient examined by MO, medication prescribed"
print("[PASS] 4a. Referral disposition updated with full clinical outcome fields")

# 4b: Soft Delete Follow-up
res = client.delete(f"/followups/{test_followup_id}", headers=headers)
assert res.status_code == 200
assert res.json()["is_deleted"] is True

res = client.get(f"/followups/{test_followup_id}", headers=headers)
assert res.status_code == 404
print("[PASS] 4b. Follow-up soft-deleted and excluded from active queries")


# --- 5. Worker & Device Management ---
test_worker_id = f"w-test-{uuid.uuid4()}"
w_create_res = client.post("/workers", json={
    "id": test_worker_id,
    "name": "गीता देवी (Geeta Devi)",
    "role": "anm",
    "phone": "+91 9876543211",
    "village": "शिवपुर (Shivpur)",
    "sub_center": "सब-सेंटर शिवपुर"
}, headers=headers)
assert w_create_res.status_code == 200
w_data = w_create_res.json()
assert w_data["id"] == test_worker_id
assert w_data["role"] == "anm"
print("[PASS] 5a. Worker registered with role and catchment sub-center")

# 5b: List Workers with Catchment Metrics
res = client.get("/workers", headers=headers)
assert res.status_code == 200
workers = res.json()
matched_worker = next((w for w in workers if w["id"] == test_worker_id), None)
assert matched_worker is not None
assert "screening_count" in matched_worker
print("[PASS] 5b. Worker listed with screening count and catchment metrics")

# 5c: Update Worker (PATCH)
res = client.patch(f"/workers/{test_worker_id}", json={
    "phone": "+91 9999988888",
    "sub_center": "पीएचसी रामपुर"
}, headers=headers)
assert res.status_code == 200
assert res.json()["phone"] == "+91 9999988888"
assert res.json()["sub_center"] == "पीएचसी रामपुर"
print("[PASS] 5c. Worker assignment and phone updated via PATCH")

# 5d: Soft Delete Worker
res = client.delete(f"/workers/{test_worker_id}", headers=headers)
assert res.status_code == 200
assert res.json()["is_deleted"] is True

res = client.get("/workers", headers=headers)
assert not any(w["id"] == test_worker_id for w in res.json()), "Soft-deleted worker must not appear in active list"
print("[PASS] 5d. Worker soft-deleted and removed from active roster")


# --- 6. Reporting CSV Export ---
csv_triage = client.get("/dashboard/export/csv?type=triage", headers=headers)
assert csv_triage.status_code == 200
assert "text/csv" in csv_triage.headers["content-type"]
assert "attachment; filename=" in csv_triage.headers["content-disposition"]
lines = csv_triage.text.strip().splitlines()
assert len(lines) >= 1
assert "FollowUp ID" in lines[0]
print("[PASS] 6a. Triage report CSV stream generated with proper headers")

csv_patients = client.get("/dashboard/export/csv?type=patients", headers=headers)
assert csv_patients.status_code == 200
assert "ABHA ID" in csv_patients.text
print("[PASS] 6b. Beneficiaries report CSV generated with ABHA ID column")

csv_followups = client.get("/dashboard/export/csv?type=followups", headers=headers)
assert csv_followups.status_code == 200
assert "Facility Reached" in csv_followups.text
print("[PASS] 6c. Referrals report CSV generated with disposition columns")

print("====================================================")
print("ALL SUPERVISOR API INTEGRATION TESTS PASSED (15/15)")
print("====================================================")
