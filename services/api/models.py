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
    village: str
    household_id: Optional[str] = None
    created_at: Optional[str] = None
    sync_status: Optional[Literal["pending", "synced", "failed"]] = "synced"

class PatientResponse(PatientCreate):
    updated_at: str
    sync_status: Literal["pending", "synced", "failed"] = "synced"

class ScreeningCreate(BaseModel):
    id: str = Field(..., description="Client-generated UUID")
    patient_id: str
    screening_type: Literal["ncd", "pregnancy", "general"]
    transcript: Optional[str] = None
    structured_data: Dict[str, Any]
    rule_results: List[Dict[str, Any]]
    summary: Optional[str] = None
    confirmed: bool = True
    created_at: Optional[str] = None
    sync_status: Optional[Literal["pending", "synced", "failed"]] = "synced"

class ScreeningResponse(ScreeningCreate):
    updated_at: str
    sync_status: Literal["pending", "synced", "failed"] = "synced"

class FollowUpCreate(BaseModel):
    id: str = Field(..., description="Client-generated UUID")
    patient_id: str
    screening_id: Optional[str] = None
    reason: str
    priority: Literal["low", "medium", "high", "critical"]
    due_date: str
    status: Literal["pending", "completed", "cancelled"] = "pending"
    notes: Optional[str] = None
    created_at: Optional[str] = None
    sync_status: Optional[Literal["pending", "synced", "failed"]] = "synced"

class FollowUpUpdate(BaseModel):
    status: Literal["pending", "completed", "cancelled"]
    notes: Optional[str] = None

class FollowUpResponse(FollowUpCreate):
    updated_at: str
    sync_status: Literal["pending", "synced", "failed"] = "synced"

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
