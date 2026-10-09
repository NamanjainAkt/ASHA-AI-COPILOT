export type SyncStatus = 'synced' | 'pending' | 'failed';
export type PriorityLevel = 'low' | 'medium' | 'high';
export type Gender = 'female' | 'male' | 'other';
export type ScreeningType = 'ncd' | 'pregnancy' | 'general';
export type FollowUpStatus = 'pending' | 'completed' | 'cancelled';

export interface Worker {
  id: string;
  name: string;
  role: 'asha' | 'supervisor' | 'anm' | 'admin';
  phone?: string;
  village: string;
  created_at: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: Gender;
  phone?: string;
  village: string;
  household_id?: string;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface NCDScreeningData {
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  blood_glucose?: number | null;
  sample_type?: 'fasting' | 'random' | null;
  tobacco_use?: boolean | null;
  alcohol_use?: boolean | null;
  known_hypertension?: boolean | null;
  known_diabetes?: boolean | null;
  medication_adherence?: boolean | null;
  symptoms?: string[];
  measurement_date?: string;
}

export interface PregnancyScreeningData {
  pregnancy_status: 'pregnant' | 'not_pregnant' | 'postpartum';
  gestational_age_weeks?: number | null;
  vaginal_bleeding?: boolean;
  severe_headache?: boolean;
  blurred_vision?: boolean;
  severe_abdominal_pain?: boolean;
  reduced_fetal_movement?: boolean;
  swelling?: boolean;
  fever?: boolean;
  follow_up_required?: boolean;
}

export interface StructuredScreeningData {
  screening_type: ScreeningType;
  ncd?: NCDScreeningData;
  pregnancy?: PregnancyScreeningData;
  notes?: string;
  field_status?: Record<string, 'present' | 'missing' | 'uncertain'>;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  priority: PriorityLevel;
  reason: string;
  reason_hi?: string;
  nextWorkflow: string;
  protocolSource: string;
}

export interface Screening {
  id: string;
  patient_id: string;
  screening_type: ScreeningType;
  transcript: string;
  structured_data: StructuredScreeningData;
  rule_results: RuleResult[];
  summary: string;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface FollowUp {
  id: string;
  patient_id: string;
  screening_id?: string | null;
  reason: string;
  priority: PriorityLevel;
  due_date: string;
  status: FollowUpStatus;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface SyncQueueItem {
  id: string;
  entity_type: 'patient' | 'screening' | 'followup' | 'worker';
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: string; // JSON string
  attempts: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncRecord {
  client_record_id: string;
  entity: 'patient' | 'screening' | 'followup' | 'worker';
  operation: 'create' | 'update' | 'delete';
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SyncPushPayload {
  device_id: string;
  worker_id: string;
  records: SyncRecord[];
}

export interface SyncPushResponse {
  success: boolean;
  processed: {
    client_record_id: string;
    status: 'created' | 'updated' | 'ignored';
  }[];
  failed: {
    client_record_id: string;
    error: string;
  }[];
}

export interface DashboardSummary {
  total_patients: number;
  total_screenings: number;
  high_priority_cases: number;
  pending_followups: number;
  active_workers: number;
  sync_queue_pending: number;
}
