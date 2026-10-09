import { StructuredScreeningData, RuleResult } from './types';
export interface HealthRule {
    id: string;
    name: string;
    protocol: string;
    enabled: boolean;
    evaluate(data: StructuredScreeningData): RuleResult | null;
}
export declare const ncdRules: HealthRule[];
export declare const pregnancyRules: HealthRule[];
export declare function evaluateRules(data: StructuredScreeningData): RuleResult[];
