---
type: source
created: 2026-10-07
updated: 2026-10-07
sources: [sources/monorepo-overview.md, entities/screening-orchestrator.md, flows/onboarding-and-auth.md]
tags: [mobile, ui, navigation, react-native]
---

# Mobile App — UI & Navigation

17 route files under `apps/mobile/app/`. No `app/index.tsx` and no `+not-found.tsx`, so the
initial URL resolves to `/splash` ([[analyses/navigation-crash-2026-10-06]]).

## Route tree and root stack

```text
app/
├── _layout.tsx            SafeAreaProvider + LanguageProvider + Stack, DB priming
├── splash.tsx             auth gate
├── login.tsx              PIN
├── onboarding/index.tsx   4-step wizard
├── (tabs)/                _layout + index | followups | sync | profile
├── patients/              index | new | [id] | high-risk
├── screening/             voice-capture | summary | manual-entry
└── village/index.tsx
```

`app/_layout.tsx:22-26` — `headerShown: false`, `contentStyle.backgroundColor = Colors.background`,
`animation: 'slide_from_right'`. No React Navigation `theme` prop; light-only by `app.json:9`.

Registered screens, in declaration order (`app/_layout.tsx:28-76`):

| # | name | options |
| :--- | :--- | :--- |
| 1 | `splash` | — (`:28`) |
| 2 | `login` | — (`:29`) |
| 3 | `onboarding/index` | — (`:30`) |
| 4 | `(tabs)` | — (`:31`) |
| 5 | **`patients/[id]`** | — (`:32`) |
| 6 | **`screening/voice-capture`** | `presentation: 'modal'` (`:33-39`) |
| 7 | `screening/summary` | — (`:40-45`) |
| 8 | `screening/manual-entry` | — (`:46-51`) |
| 9 | **`patients/index`** | — (`:52-57`) |
| 10 | **`patients/new`** | `presentation: 'modal'` (`:58-64`) |
| 11 | `patients/high-risk` | — (`:65-70`) |
| 12 | `village/index` | — (`:71-76`) |

Two ordering facts matter for the crash: **`patients/[id]` is declared before its static
siblings** (`:32` vs `:52`, `:58`, `:65`), and the two crashing transitions are exactly the two
`push`es out of a nested Tabs navigator into a root-Stack route — `/(tabs)` → `/patients`
(`(tabs)/index.tsx:209`) and `/(tabs)` → `/screening/voice-capture` (`(tabs)/index.tsx:100-103`).

DB priming is fire-and-forget at the root: `useEffect(() => { getDatabase().catch(err => console.warn(...)) }, [])`
(`app/_layout.tsx:10-15`). The awaited gate is `splash.tsx:17`.

## Tabs

Default `BottomTabBar` (no custom `tabBar`), `app/(tabs)/_layout.tsx:12-28`.
Order: `index` (home) → `followups` → `sync` → `profile` (`:30-81`), Ionicons with a hard-coded
`size={22}` in all four.

## Splash — the auth gate

`app/splash.tsx:13-41`: `await getDatabase()` → read `has_onboarded` (`:20`) → read
`session_active` (`:21`) → 1200 ms → route.

| Condition | Action |
| :--- | :--- |
| `!hasOnboarded` | `replace('/onboarding')` (`:25`) |
| `session_active === 'true'` | `replace('/(tabs)')` (`:27`) |
| else | `replace('/login')` (`:29`) |
| **any throw** | **`replace('/(tabs)')`** (`:34-36`) — fails **open** |

Strings here are hard-coded Hindi, not from the translation context (`:56-63`).
`styles.subEnglish` (`:120-124`) is dead code.

## Onboarding

4 steps (`onboarding/index.tsx`): language (`:125-176`), profile (`:179-244`), PIN (`:247-283`),
confirm (`:286-315`). Every field is pre-filled (`name 'सुनीता देवी'` `:27`, `workerId 'ASHA-UP-402'` `:28`,
`pin '1234'` `:34-35`).

Validation is partial: step 1 has no guard; `village` is labelled required (`:213`) but never
checked, and neither are `subCenter` or `phone`.

On completion writes five SecureStore keys (`:63-77`) — `has_onboarded`, `session_active`,
`worker_auth_pin` (**plaintext**), `user_language`, `worker_profile` (JSON) — then
`INSERT OR REPLACE INTO workers (...)` (`:85`).

Note the interaction with the seed: `services/db/database.ts:120-123` only seeds when
`SELECT COUNT(*) FROM workers` is 0, and the seeded worker is `worker-001`. A user who reaches
`/login` without onboarding keeps `worker-001`; a user who onboards gets `ASHA-UP-402` as a
**second** row.

## Login

`login.tsx:56-75`. PIN accepted if `pin === expectedPin || pin === '1234'` (`:66`) where
`expectedPin = savedPin || '1234'` (`:64`). On any SecureStore throw → `replace('/(tabs)')`
(`:73`). Full detail in [[flows/onboarding-and-auth]].

`selectedRole` (`:23`, ASHA vs Supervisor, `:99-127`) is **never persisted and never read** —
purely cosmetic.

## Screen-by-screen: data loads and mutations

| Screen | Loads on | Mutates | Notes |
| :--- | :--- | :--- | :--- |
| `(tabs)/index.tsx` | `useFocusEffect` (`:81-85`): `patientRepository.getAll/getCount`, `screeningRepository.getMetrics`, `followupRepository.getCounts`, SecureStore `worker_profile` (`:52`) | none | read-only; `isOnline={true}` hard-coded (`:119`) |
| `(tabs)/followups.tsx` | `useFocusEffect` (`:38-42`) → `followupRepository.list` | `updateStatus` + `enqueue` (`:46-47`) | `Linking.openURL('tel:…')` (`:68`), unawaited |
| `(tabs)/sync.tsx` | `useFocusEffect` (`:38-42`) → `syncQueueRepository.getPending` + `syncService.getStatus` | `setBackendUrl` + `triggerSync` (`:45,48`) | editable backend URL text field |
| `(tabs)/profile.tsx` | `useFocusEffect` (`:69-73`) | logout: `deleteItemAsync('session_active')` (`:85`) | does **not** clear `has_onboarded`/PIN/profile |
| `patients/index.tsx` | plain `useEffect` (`:33-35`) | none | **stale data on return** |
| `patients/new.tsx` | SecureStore `worker_profile` (`:34`) | `create` + `enqueue` (`:70,73`) | id `p-${Date.now()}` (`:57`) |
| `patients/[id].tsx` | `useFocusEffect` (`:63-67`) | followup complete + `enqueue` (`:71-72`) | **route-collision guard** `id === 'high-risk'` (`:33-36`) |
| `patients/high-risk.tsx` | plain `useEffect` (`:27-29`) | none | `Linking.openURL('tel:108')` (`:67`) |
| `screening/voice-capture.tsx` | `useEffect` (`:76-104`) | **nothing** — persistence is on the summary screen | audio lifecycle guard (`:110-132`) |
| `screening/summary.tsx` | `patientRepository.getById` (`:57-63`), **no `.catch`** | `screeningRepository.create` + `enqueue` + conditional followup (`:135-182`) | the only screen that persists a screening |
| `screening/manual-entry.tsx` | none | `create` + `enqueue` (`:79-101`) | **no followup enqueue** (asymmetric with summary) |
| `village/index.tsx` | `useEffect` (`:28-55`) | none | fabricated coverage stats (`:66,127,137`) |

`useEffect` instead of `useFocusEffect` in `patients/index.tsx`, `patients/high-risk.tsx`, and
`village/index.tsx` means those three screens show stale data after returning from a detail or
registration flow.

## Display-layer fabrication

Three places render invented numbers with clinical visual authority:

1. **Risk colour from array position.** `(tabs)/index.tsx:276-277` —
   `const isHighRisk = index === 0; const isMedium = index === 1;`. The first `PatientCard` is
   *always* rendered red regardless of the patient's actual rules.
2. **Connectivity always online.** `(tabs)/index.tsx:119` passes `isOnline={true}` to `Header`,
   while `expo-network` is a declared dependency (`apps/mobile/package.json:19`) and is never
   imported by any screen.
3. **Synthetic village coverage.** `village/index.tsx:66` —
   `estimatedHouseholds = Math.max(1, Math.ceil(totalPatients * 0.7))`; `:127`/`:137` clamp
   screening counts into fake percentages; `Block: Sadar · District: Varanasi` is hard-coded (`:89`).

## Navigation call inventory

13 `router.push` (string form for `/patients`, `/patients/${id}`, `/village`, `/(tabs)/followups`;
**object form** for `/screening/voice-capture`, `/screening/manual-entry`, `/screening/summary`),
19 `router.replace` (string form except `voice-capture.tsx:289-296`), 9 `router.back` (all
argument-free, all guarded by `canGoBack()`).

Only two `Linking.openURL` calls exist: `followups.tsx:68` and `high-risk.tsx:67`. Neither is
awaited or `.catch`-ed. On `patients/[id].tsx:164-169` the phone number is rendered as plain text
and is **not** dialable — inconsistent with the other two screens.

## Theme and translations

`constants/theme.ts` — `Colors` (`:1-39`, primary `#0F766E`, danger `#DC2626`, warning `#F59E0B`,
success `#16A34A`), `Spacing` (`:41-49`, `touchMin: 48`, `touchComfort: 56`),
`Typography` (`:51-63`, Inter + Noto Sans Devanagari).

`Typography` is **exported and never imported** — its only occurrence in the tree is its own
declaration. Every screen hard-codes its own `fontSize`/`fontWeight`.

`constants/translations.ts` is `{ hi: {...}, en: {...} }`, 168 keys each (`:1-433`), with three
nested objects per language (`riskStatus` `:200`, `gender` `:205`, `tabs` `:210`).
`context/LanguageContext.tsx:42` computes `t = Translations[language]` and hands the **whole
object** down, so call sites read `t.tabs.home` rather than calling `t('key')`. Hydrated from
SecureStore `user_language` (`:24-30`). Imported directly in only two places:
`LanguageContext.tsx:3` and `components/Header.tsx:5` (the latter bypasses the context).

Several screens additionally inline `language === 'hi' ? '…' : '…'` ternaries instead of using
`t` — e.g. `(tabs)/index.tsx:107-109`, `splash.tsx:56-63`, `voice-capture.tsx:478`.

## Components

| Component | Props | Responsibility |
| :--- | :--- | :--- |
| `Header.tsx` | `language, onToggleLanguage, isOnline, syncedCount, villageName` (`:7-13`) | connectivity dot + synced-count strip (`:27-42`), brand + हिंदी/EN toggle + avatar (`:45-80`) |
| `VoiceDock.tsx` | `state: 'idle'\|'listening'\|'processing'`, `onPressMic`, `scenarioTitle`, `onSwitchScenario` (`:6-14`) | bottom mic bar, `Animated.loop` pulse ring while listening (`:25-46`), scenario strip (`:51-63`) |
| `PatientCard.tsx` | `patient, riskStatus, onPress, onPressAction?` (`:8-13`) | list row: risk accent bar (`:23-27`), status pill (`:52-56`), meta (`:59-71`) |
| `RiskCard.tsx` | `rule: RuleResult` (`:8-10`) | one clinical alert card: priority border + pill, reason, `protocolSource`, `nextWorkflow` (`:17-69`) |

`VoiceDock` is driven purely by its `state` prop, and `(tabs)/index.tsx:42` sets `voiceState`
once to `'idle'` and never updates it — so the dock never shows `listening` or `processing`
state on the home screen.

## Related

- [[sources/monorepo-overview]] · [[sources/mobile-services]] · [[concepts/bilingual-design-system]]
- [[flows/voice-screening-journey]] · [[flows/onboarding-and-auth]]
- [[entities/screening-orchestrator]] · [[entities/clinical-rule-engine]]
- [[analyses/navigation-crash-2026-10-06]]
