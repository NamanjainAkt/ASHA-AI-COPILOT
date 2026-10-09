export const Colors = {
  // Brand & Primaries
  primary: '#0F766E', // Institutional grounding teal
  primaryDark: '#005C55',
  primaryBright: '#14B8A6', // Primary tactile action teal
  primaryLight: '#CCFBF1', // Soft highlight / container
  primaryMuted: '#A3FAEF',

  // Surfaces & Backgrounds
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceContainerLow: '#F1F3FF',
  surfaceContainer: '#E9EDFF',
  surfaceContainerHigh: '#E1E8FD',
  surfaceContainerHighest: '#DCE2F7',

  // Text & Neutrals
  textPrimary: '#111827', // WCAG AAA high-contrast black
  textSecondary: '#4B5563', // Bilingual subtitle / metadata
  textMuted: '#6B7280',
  border: '#E5E7EB', // 1px card hairline border
  borderLight: '#F3F4F6',
  outline: '#6E7977',
  outlineVariant: '#BDC9C6',

  // Clinical Status & Triage (Calm Urgency)
  danger: '#DC2626', // Emergency / Maternal danger signs / BP critical
  dangerLight: '#FEE2E2',
  warning: '#F59E0B', // Moderate anomaly / Pre-hypertension
  warningLight: '#FEF3C7',
  accent: '#F97316', // Scheduled follow-ups / tracking
  accentLight: '#FFEDD5',
  success: '#16A34A', // Synced / complete / healthy
  successLight: '#DCFCE7',
  offline: '#9CA3AF', // Passive sync / disconnected
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md2: 12, // Intermediate 12dp spacing token (ISS-314)
  md: 16,
  lg: 24,
  xl: 32,
  touchMin: 48, // Minimum touch boundary 48x48dp
  touchComfort: 56, // Preferred touch boundary
};

export const Typography = {
  fontFamily: 'Inter',
  fontFamilyHindi: 'Noto Sans Devanagari',
  headlineLg: 24,
  headlineMd: 20,
  headlineSm: 18,
  labelLg: 16,
  labelMd: 14,
  labelSm: 12,
  bodyLg: 16,
  bodyMd: 14,
  bodySm: 12,
};
