export type SyncStatus = 'synced' | 'pending' | 'failed';
export type PriorityLevel = 'low' | 'medium' | 'high';
export type Gender = 'female' | 'male' | 'other';
export type ScreeningType = 'ncd' | 'pregnancy' | 'general';
export type VisitType = 'ncd' | 'pregnancy' | 'anc' | 'pnc' | 'child_hbnc' | 'general' | 'family_planning' | 'followup';
export type FollowUpStatus = 'pending' | 'completed' | 'cancelled';
export type FieldStatus = 'present' | 'missing' | 'uncertain' | 'not_asked' | 'confirmed' | 'explicit_denial' | 'unknown' | 'declined' | 'not_applicable';
export type FieldProvenance = 'worker_spoken_input' | 'worker_manual_entry' | 'device_measurement' | 'not_asked';
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
    phone_owner?: 'self' | 'spouse' | 'parent' | 'neighbor' | 'other';
    village: string;
    hamlet_tola?: string;
    household_id?: string;
    relationship_to_head?: string;
    abha_id?: string;
    disability_access_needs?: string;
    consent_obtained?: boolean;
    created_at: string;
    updated_at: string;
    sync_status: SyncStatus;
}
/**
 * Module B: Common Visit Questionnaire (Start Every Visit)
 */
export interface CommonVisitData {
    visit_purpose?: string;
    main_complaint?: string;
    complaint_onset?: string;
    complaint_course?: 'worsening' | 'improving' | 'unchanged' | 'fluctuating';
    associated_symptoms_description?: string;
    known_conditions?: string[];
    current_medications?: string;
    missed_medication_doses?: boolean;
    missed_medication_reason?: string;
    previous_care_facility?: string;
    previous_care_advice?: string;
}
/**
 * Priority 1: NCD & CBAC (Community Based Assessment Checklist for Adults 30+)
 */
export interface CBACScreeningData {
    tobacco_use_type?: 'smokeless' | 'smoking' | 'both' | 'none';
    tobacco_frequency?: 'daily' | 'occasional' | 'past' | 'never';
    alcohol_consumption?: 'daily' | 'occasional' | 'never';
    physical_activity_adequate?: boolean;
    waist_circumference_cm?: number | null;
    family_history_ncd?: boolean;
    oral_cancer_symptoms?: {
        non_healing_ulcer?: boolean;
        white_red_patch?: boolean;
        difficulty_opening_mouth?: boolean;
    };
    breast_cancer_symptoms?: {
        lump_in_breast?: boolean;
        nipple_discharge?: boolean;
        shape_change?: boolean;
    };
    cervical_cancer_symptoms?: {
        bleeding_between_periods?: boolean;
        bleeding_after_intercourse?: boolean;
        foul_discharge?: boolean;
    };
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
/**
 * Priority 2: Pregnancy & Antenatal Care (ANC)
 */
export interface PregnancyScreeningData {
    pregnancy_status: 'pregnant' | 'not_pregnant' | 'postpartum';
    lmp_date?: string;
    edd_date?: string;
    gestational_age_weeks?: number | null;
    anc_registered?: boolean;
    anc_visit_number?: number;
    last_anc_checkup_date?: string;
    vaginal_bleeding?: boolean;
    severe_headache?: boolean;
    blurred_vision?: boolean;
    severe_abdominal_pain?: boolean;
    reduced_fetal_movement?: boolean;
    swelling?: boolean;
    fever?: boolean;
    convulsions?: boolean;
    leaking_fluid?: boolean;
    ifa_tablets_consumed?: boolean;
    calcium_tablets_consumed?: boolean;
    birth_preparedness_facility?: string;
    follow_up_required?: boolean;
}
/**
 * Priority 3: Postnatal Care (PNC) & Newborn/Child Health (HBNC/HBYC)
 */
export interface PNCChildScreeningData {
    delivery_date?: string;
    delivery_place?: 'institutional' | 'home';
    delivery_complications?: string[];
    baby_dob?: string;
    birth_weight_kg?: number | null;
    preterm_birth?: boolean;
    breastfeeding_within_first_hour?: boolean;
    exclusive_breastfeeding?: boolean;
    poor_feeding_or_sucking?: boolean;
    newborn_fever_or_hypothermia?: boolean;
    fast_breathing_or_indrawing?: boolean;
    reduced_activity_or_lethargy?: boolean;
    convulsions?: boolean;
    jaundice_yellow_palms_soles?: boolean;
    umbilical_cord_infection?: boolean;
    immunization_doses_received?: string[];
    immunization_doses_due?: string[];
}
/**
 * Referral & Action Tracking
 */
export interface ReferralActionData {
    referral_recommended: boolean;
    destination?: 'sub_center' | 'phc' | 'chc' | 'sub_district_hospital' | 'district_hospital';
    urgency?: 'immediate' | 'urgent' | 'routine';
    reason?: string;
    referral_slip_issued?: boolean;
    facility_reached?: boolean;
    responsible_person?: 'asha' | 'anm' | 'medical_officer';
    action_due_date?: string;
    notes?: string;
}
export interface StructuredScreeningData {
    screening_type: ScreeningType | VisitType;
    visit_type?: VisitType;
    common_visit?: CommonVisitData;
    ncd?: NCDScreeningData;
    cbac?: CBACScreeningData;
    pregnancy?: PregnancyScreeningData;
    pnc_child?: PNCChildScreeningData;
    referral_action?: ReferralActionData;
    notes?: string;
    field_status?: Record<string, FieldStatus | 'present' | 'missing' | 'uncertain'>;
    field_provenance?: Record<string, FieldProvenance>;
    missing_safety_prompts?: string[];
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
    destination?: 'sub_center' | 'phc' | 'chc' | 'sub_district_hospital' | 'district_hospital';
    urgency?: 'immediate' | 'urgent' | 'routine';
    facility_reached?: boolean;
    responsible_person?: 'asha' | 'anm' | 'medical_officer';
    outcome?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
    sync_status: SyncStatus;
}
export interface SyncQueueItem {
    id: string;
    entity_type: 'patient' | 'screening' | 'followup' | 'worker';
    entity_id: string;
    operation: 'create' | 'update' | 'delete';
    payload: string;
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
