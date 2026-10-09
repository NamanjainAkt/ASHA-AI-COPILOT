/**
 * Shared utility functions
 */
export declare function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T;
export declare function hashPin(pin: string, salt?: string): Promise<string>;
