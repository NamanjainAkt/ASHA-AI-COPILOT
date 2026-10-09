from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal

class LoginRequest(BaseModel):
    username: str
    password: str
    role: Optional[Literal["asha", "supervisor", "anm", "admin"]] = "asha"

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    worker_id: str
    worker_name: str
    role: str
    village: str

class PatientCreate(BaseModel):
    id: str = Field(..., description="Client-generated UUID")
    name: str
    age: Optional[int] = None
    sex: Literal["female", "male", "other"]
    phone: Optional[str] = None
    phone_owner: Optional[Literal["self", "spouse", "parent", "neighbor", "other"]] = None
    village: str
    hamlet_tola: Optional[str] = None
    household_id: Optional[str] = None
    relationship_to_head: Optional[str] = None
    abha_id: Optional[str] = None
    disability_access_needs: Optional[str] = None
    consent_obtained: Optional[bool] = None
    created_at: Optional[str] = None
    sync_status: Optional[Literal["pending", "synced", "failed"]] = "synced"
    is_deleted: Optional[bool] = False
    deleted_at: Optional[str] = None

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[Literal["female", "male", "other"]] = None
    phone: Optional[str] = None
    phone_owner: Optional[Literal["self", "spouse", "parent", "neighbor", "other"]] = None
    village: Optional[str] = None
    hamlet_tola: Optional[str] = None
    household_id: Optional[str] = None
    relationship_to_head: Optional[str] = None
    abha_id: Optional[str] = None
    disability_access_needs: Optional[str] = None
    consent_obtained: Optional[bool] = None

class PatientResponse(PatientCreate):
    updated_at: str
    sync_status: Literal["pending", "synced", "failed"] = "synced"
    is_deleted: bool = False
    deleted_at: Optional[str] = None

class ScreeningCreate(BaseModel):
    id: str = Field(..., description="Client-generated UUID")
    patient_id: str
    screening_type: str = "ncd"
    visit_type: Optional[str] = None
    transcript: Optional[str] = None
    structured_data: Dict[str, Any]
    rule_results: List[Dict[str, Any]]
    summary: Optional[str] = None
    confirmed: bool = True
    created_at: Optional[str] = None
    sync_status: Optional[Literal["pending", "synced", "failed"]] = "synced"
    is_deleted: Optional[bool] = False
    deleted_at: Optional[str] = None

class ScreeningResponse(ScreeningCreate):
    updated_at: str
    sync_status: Literal["pending", "synced", "failed"] = "synced"
    is_deleted: bool = False
    deleted_at: Optional[str] = None

class FollowUpCreate(BaseModel):
    id: str = Field(..., description="Client-generated UUID")
    patient_id: str
    screening_id: Optional[str] = None
    reason: str
    priority: Literal["low", "medium", "high", "critical"]
    due_date: str
    status: Literal["pending", "completed", "cancelled"] = "pending"
    destination: Optional[Literal["sub_center", "phc", "chc", "sub_district_hospital", "district_hospital"]] = None
    urgency: Optional[Literal["immediate", "urgent", "routine"]] = None
    facility_reached: Optional[bool] = None
    responsible_person: Optional[Literal["asha", "anm", "medical_officer"]] = None
    outcome: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    sync_status: Optional[Literal["pending", "synced", "failed"]] = "synced"
    is_deleted: Optional[bool] = False
    deleted_at: Optional[str] = None

class FollowUpUpdate(BaseModel):
    status: Optional[Literal["pending", "completed", "cancelled"]] = None
    destination: Optional[Literal["sub_center", "phc", "chc", "sub_district_hospital", "district_hospital"]] = None
    urgency: Optional[Literal["immediate", "urgent", "routine"]] = None
    facility_reached: Optional[bool] = None
    responsible_person: Optional[Literal["asha", "anm", "medical_officer"]] = None
    outcome: Optional[str] = None
    notes: Optional[str] = None

class FollowUpResponse(FollowUpCreate):
    updated_at: str
    sync_status: Literal["pending", "synced", "failed"] = "synced"
    is_deleted: bool = False
    deleted_at: Optional[str] = None

class WorkerCreate(BaseModel):
    id: str = Field(..., description="Worker ID")
    name: str
    role: Literal["asha", "supervisor", "anm", "admin"] = "asha"
    phone: Optional[str] = None
    village: str
    sub_center: Optional[str] = None
    created_at: Optional[str] = None

class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["asha", "supervisor", "anm", "admin"]] = None
    phone: Optional[str] = None
    village: Optional[str] = None
    sub_center: Optional[str] = None

class WorkerResponse(WorkerCreate):
    is_deleted: bool = False
    deleted_at: Optional[str] = None
    screening_count: Optional[int] = 0
    last_sync_time: Optional[str] = None

class SyncRecordItem(BaseModel):
    client_record_id: str
    entity: Literal["patient", "screening", "followup", "worker"]
    operation: Literal["create", "update", "delete"]
    timestamp: str
    payload: Dict[str, Any]

class SyncPushRequest(BaseModel):
    device_id: str
    worker_id: str
    records: List[SyncRecordItem] = Field(default_factory=list, max_length=500)

class SyncPushResponseItem(BaseModel):
    client_record_id: str
    status: Literal["created", "updated", "ignored", "deleted", "error"]
    error: Optional[str] = None

class SyncPushResponse(BaseModel):
    success: bool = True
    processed: List[SyncPushResponseItem]
    failed: List[SyncPushResponseItem] = []

class DashboardSummary(BaseModel):
    total_patients: int
    total_screenings: int
    high_priority_cases: int
    pending_followups: int
    active_workers: int
    sync_queue_pending: int
