export type Gender = 'female' | 'male' | 'other';
export type SyncStatus = 'synced' | 'pending' | 'failed';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export type ScreeningType = 'ncd' | 'pregnancy' | 'general';
export type FollowUpStatus = 'pending' | 'completed' | 'cancelled';

export interface Patient {
  id: string;
  name: string;
  age?: number | null;
  sex: Gender;
  phone?: string | null;
  phone_owner?: 'self' | 'spouse' | 'parent' | 'neighbor' | 'other' | string | null;
  village: string;
  hamlet_tola?: string | null;
  household_id?: string | null;
  relationship_head?: string | null;
  abha_id?: string | null;
  disability_notes?: string | null;
  created_at: string;
  updated_at: string;
  sync_status?: SyncStatus;
  is_deleted?: number;
  deleted_at?: string | null;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  priority: PriorityLevel;
  reason: string;
  reason_hi?: string;
  nextWorkflow: string;
  protocolSource?: string;
}

export interface StructuredScreeningData {
  screening_type?: ScreeningType;
  ncd?: {
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
  };
  pregnancy?: {
    pregnancy_status?: 'pregnant' | 'not_pregnant' | 'postpartum';
    gestational_age_weeks?: number | null;
    vaginal_bleeding?: boolean;
    severe_headache?: boolean;
    blurred_vision?: boolean;
    severe_abdominal_pain?: boolean;
    reduced_fetal_movement?: boolean;
    swelling?: boolean;
    fever?: boolean;
    follow_up_required?: boolean;
  };
  notes?: string;
  [key: string]: any;
}

export interface Screening {
  id: string;
  patient_id: string;
  patient_name?: string;
  screening_type: ScreeningType;
  transcript?: string;
  structured_data: StructuredScreeningData;
  rule_results: RuleResult[];
  summary?: string;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface FollowUp {
  id: string;
  patient_id: string;
  patient_name?: string;
  patient_village?: string;
  patient_phone?: string;
  screening_id?: string | null;
  screening_type?: string;
  screening_summary?: string;
  reason: string;
  priority: PriorityLevel;
  due_date: string;
  status: FollowUpStatus;
  notes?: string | null;
  destination_facility?: 'sub_center' | 'phc' | 'chc' | 'district_hospital' | string | null;
  urgency?: 'immediate' | 'urgent' | 'routine' | string | null;
  assigned_to?: string | null;
  facility_reached?: boolean | null;
  outcome?: string | null;
  created_at: string;
  updated_at: string;
  sync_status?: SyncStatus;
}

export interface Worker {
  id: string;
  name: string;
  role: 'asha' | 'supervisor' | 'anm' | 'admin' | string;
  phone?: string | null;
  village: string;
  sub_center?: string | null;
  screening_count?: number;
  last_sync_time?: string | null;
  created_at: string;
}

export interface DashboardSummary {
  total_patients: number;
  total_screenings: number;
  high_priority_cases: number;
  pending_followups: number;
  active_workers: number;
  sync_queue_pending: number;
}

export type TabType = 'triage' | 'patients' | 'screenings' | 'followups' | 'workers';
