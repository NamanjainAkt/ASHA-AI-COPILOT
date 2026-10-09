/**
 * Multilingual Number Normalizer for Hindi, Hinglish & English clinical text.
 * Converts Devanagari numerals, spoken Hindi/Hinglish number words, and English
 * number words into standard Arabic digits (0-9).
 */
/**
 * Replace Devanagari digits (०-९) with Latin digits (0-9).
 */
export declare function convertDevanagariDigits(text: string): string;
/**
 * Parses spoken compound Hindi/English hundreds, e.g.:
 * "एक सौ साठ" -> 160
 * "एक सौ पैंसठ" -> 165
 * "एक सौ दस" -> 110
 * "एक सौ पांच" -> 105
 * "दो सौ पैंतालीस" -> 245
 * "एक सौ बयालीस" -> 142
 * "one sixty" -> 160
 * "one hundred twenty" -> 120
 */
export declare function normalizeSpokenCompounds(text: string): string;
/**
 * Full normalizer: Converts Devanagari digits and spoken numbers to standard numeric strings.
 */
export declare function normalizeClinicalNumbers(rawText: string): string;
