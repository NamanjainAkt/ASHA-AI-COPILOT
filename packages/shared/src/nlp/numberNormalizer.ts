/**
 * Multilingual Number Normalizer for Hindi, Hinglish & English clinical text.
 * Converts Devanagari numerals, spoken Hindi/Hinglish number words, and English
 * number words into standard Arabic digits (0-9).
 */

const DEVANAGARI_DIGIT_MAP: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

// Hindi words map for standalone numbers and compounds
const HINDI_NUMBER_WORDS: Record<string, number> = {
  // 0 - 10
  'शून्य': 0, 'जीरो': 0, 'zero': 0,
  'एक': 1, 'ek': 1, 'one': 1,
  'दो': 2, 'do': 2, 'two': 2,
  'तीन': 3, 'teen': 3, 'three': 3,
  'चार': 4, 'chaar': 4, 'four': 4,
  'पांच': 5, 'पाँच': 5, 'panch': 5, 'paanch': 5, 'five': 5,
  'छह': 6, 'छः': 6, 'chhah': 6, 'cheh': 6, 'six': 6,
  'सात': 7, 'saat': 7, 'seven': 7,
  'आठ': 8, 'aath': 8, 'eight': 8,
  'नौ': 9, 'nau': 9, 'nine': 9,
  'दस': 10, 'das': 10, 'ten': 10,

  // 11 - 20
  'ग्यारह': 11, 'gyarah': 11, 'eleven': 11,
  'बारह': 12, 'barah': 12, 'twelve': 12,
  'तेरह': 13, 'terah': 13, 'thirteen': 13,
  'चौदह': 14, 'chaudah': 14, 'fourteen': 14,
  'पंद्रह': 15, 'pandrah': 15, 'fifteen': 15,
  'सोलह': 16, 'solah': 16, 'sixteen': 16,
  'सत्रह': 17, 'satrah': 17, 'seventeen': 17,
  'अठारह': 18, 'atharah': 18, 'eighteen': 18,
  'उन्नीस': 19, 'unnis': 19, 'nineteen': 19,
  'बीस': 20, 'bees': 20, 'twenty': 20,

  // 21 - 30
  'इक्कीस': 21, 'बाईस': 22, 'तेईस': 23, 'चौबीस': 24,
  'पच्चीस': 25, 'pachis': 25, 'छब्बीस': 26, 'सत्ताईस': 27,
  'अट्ठाईस': 28, 'atthais': 28, 'उनतीस': 29,
  'तीस': 30, 'tees': 30, 'thirty': 30,

  // 31 - 40
  'इकत्तीस': 31, 'बत्तीस': 32, 'battis': 32, 'तैंतीस': 33, 'चौंतीस': 34,
  'पैंतीस': 35, 'छत्तीस': 36, 'सैंतीस': 37, 'अड़तीस': 38, 'उनतालीस': 39,
  'चालीस': 40, 'chalis': 40, 'chalees': 40, 'forty': 40,

  // 41 - 50
  'इकतालीस': 41, 'बयालीस': 42, 'तैंतालीस': 43, 'चवालीस': 44,
  'पैंतालीस': 45, 'paintalis': 45, 'छियालीस': 46, 'सैंतालीस': 47, 'अड़तालीस': 48, 'उनचास': 49,
  'पचास': 50, 'pachas': 50, 'fifty': 50,

  // 51 - 60
  'इक्यावन': 51, 'बावन': 52, 'तिरपन': 53, 'चौवन': 54,
  'पचपन': 55, 'छप्पन': 56, 'सत्तावन': 57, 'अट्ठावन': 58, 'उनसठ': 59,
  'साठ': 60, 'saath': 60, 'sat': 60, 'sixty': 60,

  // 61 - 70
  'इकसठ': 61, 'बासठ': 62, 'तिरसठ': 63, 'चौंसठ': 64,
  'पैंसठ': 65, 'painsath': 65, 'सियासठ': 66, 'सड़सठ': 67, 'अड़सठ': 68, 'उनहत्तर': 69,
  'सत्तर': 70, 'sattar': 70, 'seventy': 70,

  // 71 - 80
  'इकहत्तर': 71, 'बहत्तर': 72, 'तिहत्तर': 73, 'चौहत्तर': 74,
  'पचहत्तर': 75, 'पिचहत्तर': 75, 'pachhattar': 75, 'छहत्तर': 76, 'सतहत्तर': 77, 'अठहत्तर': 78, 'उन्नासी': 79,
  'अस्सी': 80, 'assi': 80, 'assee': 80, 'eighty': 80,

  // 81 - 90
  'इक्यासी': 81, 'बयासी': 82, 'तिरासी': 83, 'चौरासी': 84,
  'पचासी': 85, 'pachasi': 85, 'छियासी': 86, 'सत्तासी': 87, 'अट्ठासी': 88, 'नवासी': 89,
  'नब्बे': 90, 'nabbe': 90, 'nabbey': 90, 'ninety': 90,

  // 91 - 100
  'इक्यानवे': 91, 'बानवे': 92, 'तिरानवे': 93, 'चौरानवे': 94,
  'पंचानवे': 95, 'पचानवे': 95, 'panchanve': 95, 'pachanve': 95,
  'छियानवे': 96, 'सत्तानवे': 97, 'अट्ठानवे': 98, 'निन्यानवे': 99,
  'सौ': 100, 'sau': 100, 'hundred': 100
};

/**
 * Replace Devanagari digits (०-९) with Latin digits (0-9).
 */
export function convertDevanagariDigits(text: string): string {
  if (!text) return '';
  return text.replace(/[०-९]/g, (match) => DEVANAGARI_DIGIT_MAP[match] || match);
}

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
export function normalizeSpokenCompounds(text: string): string {
  if (!text) return '';

  let normalized = text;

  // 1. Pattern: [एक|दो|तीन]? सौ [शब्द] -> e.g. "एक सौ साठ" -> "160"
  const hundredRegex = /(?:(एक|दो|तीन|चार|ek|do|teen)\s+)?(?:सौ|sau|hundred)\s+([^\s,.]+)/gi;
  normalized = normalized.replace(hundredRegex, (match, multiplierWord, remainderWord) => {
    let multiplier = 1;
    if (multiplierWord) {
      const lowerMult = multiplierWord.toLowerCase();
      if (lowerMult === 'दो' || lowerMult === 'do') multiplier = 2;
      else if (lowerMult === 'तीन' || lowerMult === 'teen') multiplier = 3;
      else if (lowerMult === 'चार') multiplier = 4;
    }

    const lowerRem = remainderWord.toLowerCase();
    const remVal = HINDI_NUMBER_WORDS[lowerRem];
    if (remVal !== undefined && remVal < 100) {
      return String(multiplier * 100 + remVal);
    }
    // Just "एक सौ" or "सौ"
    if (lowerRem === 'है' || lowerRem === 'hai' || lowerRem === 'आया' || lowerRem === 'बटा' || lowerRem === '/') {
      return `${multiplier * 100} ${remainderWord}`;
    }
    return match;
  });

  // 2. Pattern: standalone "सौ" / "ek sau" / "one hundred"
  normalized = normalized.replace(/\b(?:एक\s+)?(?:सौ|sau|one\s+hundred)\b/gi, '100');
  normalized = normalized.replace(/\b(?:दो\s+)?(?:सौ|sau|two\s+hundred)\b/gi, '200');

  // 3. Pattern: English "one twenty", "one forty", "one sixty", "one eighty"
  const englishTeensAndTens: [RegExp, string][] = [
    [/\bone\s+(?:hundred\s+)?twenty\b/gi, '120'],
    [/\bone\s+(?:hundred\s+)?thirty\b/gi, '130'],
    [/\bone\s+(?:hundred\s+)?forty\b/gi, '140'],
    [/\bone\s+(?:hundred\s+)?fifty\b/gi, '150'],
    [/\bone\s+(?:hundred\s+)?sixty\b/gi, '160'],
    [/\bone\s+(?:hundred\s+)?seventy\b/gi, '170'],
    [/\bone\s+(?:hundred\s+)?eighty\b/gi, '180'],
    [/\bone\s+(?:hundred\s+)?ninety\b/gi, '190'],
    [/\bone\s+(?:hundred\s+)?ten\b/gi, '110'],
    [/\bone\s+(?:hundred\s+)?five\b/gi, '105'],
    [/\bone\s+(?:hundred\s+)?fifteen\b/gi, '115']
  ];
  for (const [pattern, rep] of englishTeensAndTens) {
    normalized = normalized.replace(pattern, rep);
  }

  // 4. Standalone words for 10-99 (e.g. "अस्सी", "नब्बे", "साठ", "सत्तर")
  for (const [word, val] of Object.entries(HINDI_NUMBER_WORDS)) {
    if (val >= 10 && val <= 99) {
      const reg = new RegExp(`(?<=^|\\s|,|/|बटा|by|over|\\()${word}(?=$|\\s|,|\\.|\\)|/|बटा|by|over)`, 'gi');
      normalized = normalized.replace(reg, String(val));
    }
  }

  return normalized;
}

/**
 * Full normalizer: Converts Devanagari digits and spoken numbers to standard numeric strings.
 */
export function normalizeClinicalNumbers(rawText: string): string {
  if (!rawText) return '';
  const devanagariCleaned = convertDevanagariDigits(rawText);
  return normalizeSpokenCompounds(devanagariCleaned);
}
