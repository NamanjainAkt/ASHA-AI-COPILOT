import { Patient, StructuredScreeningData } from './types';
export interface ValidationIssue {
    field: string;
    code: 'INVALID_VALUE' | 'OUT_OF_RANGE' | 'CONTRADICTION' | 'MISSING_REQUIRED' | 'UNCERTAIN';
    message: string;
    message_hi: string;
}
export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    sanitizedData: StructuredScreeningData;
}
export declare function validatePatient(patient: Partial<Patient>): ValidationIssue[];
export declare function validateScreeningData(patient: Partial<Patient>, data: StructuredScreeningData): ValidationResult;
