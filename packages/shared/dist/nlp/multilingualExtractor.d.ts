/**
 * Multilingual Clinical NLP Extractor (Hindi, Hinglish, English)
 *
 * Extracts structured NCD and Pregnancy screening entities from conversational,
 * code-mixed transcripts spoken by frontline ASHA community workers.
 */
import { ScreeningType, StructuredScreeningData } from '../types';
export interface ExtractorOptions {
    referenceDate?: string;
}
/**
 * Main Multilingual Entity Extraction Function.
 */
export declare function extractMultilingualScreeningData(rawTranscript: string, schemaType: ScreeningType, options?: ExtractorOptions): StructuredScreeningData;
