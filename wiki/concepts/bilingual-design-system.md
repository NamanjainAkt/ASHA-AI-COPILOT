---
type: concept
created: 2026-10-07
updated: 2026-10-07
sources: [sources/mobile-ui-navigation.md, sources/supervisor-dashboard.md]
tags: [design, bilingual, tokens, accessibility]
---

# Bilingual Design System

The app presents every clinical concept in Hindi and English side by side
(`docs/wiki/mobile-application.md:16`), for workers who read one, both, or neither fluently. This
page covers how that is actually implemented and where the stated design rules diverge from what
ships.

## Two vocabularies, one identity

**Clinical strings** are authored as explicit Hindi/English pairs at the protocol level —
`reason_en` / `reason_hi` and `next_workflow` in
`packages/shared/src/protocols/*.json`. Not machine-translated at render time. A clinical advisor
can review the Hindi in a JSON diff.

**UI strings** live in `constants/translations.ts` as two whole objects —
`Translations = { hi: {...}, en: {...} }` (`:1-433`), **168 keys each**, with three nested
sub-objects per language: `riskStatus` (`:200`), `gender` (`:205`), `tabs` (`:210`).

`context/LanguageContext.tsx:42` computes `const t = Translations[language]` and hands the **whole
object** through context, so call sites read `t.tabs.home` rather than calling `t('key')`. Type is
`typeof Translations['hi']` (`:11`), so a missing `en` key is a compile error. Hydrated from
SecureStore `user_language` (`:24-30`), persisted by `setLanguage` (`:32-35`).

That is a reasonable design — whole-object context gives full key checking with no runtime lookup
cost. Its cost is verbosity at every call site.

## Where the bilingual discipline breaks down

`translations.ts` is imported directly in exactly **two** places: `LanguageContext.tsx:3` and
`components/Header.tsx:5` — the latter bypassing the context entirely. No screen imports it
directly.

But several screens **ignore `t` and inline ternaries**:

| Site | Pattern |
| :--- | :--- |
| `(tabs)/index.tsx:107-109` | `toLocaleDateString('hi-IN')` / `'en-IN'` |
| `splash.tsx:56-63` | hard-coded Hindi strings |
| `onboarding/index.tsx:131-134` | inline hi/en |
| `voice-capture.tsx:478` | inline |

So the first-run experience a new worker sees is partly untranslated by construction.

`LanguageContext` is consumed by **all 17 non-layout files plus the tab layout** — every screen
except `splash.tsx`, which sits inside the provider and ignores it.

## Tokens

`constants/theme.ts` (63 lines).

**`Colors`** (`:1-39`) — clinical teal primary `#0F766E`, bright `#14B8A6`, dark `#005C55`,
danger `#DC2626`, warning `#F59E0B`, accent `#F97316`, success `#16A34A`, plus surface/border
ramps.

The docset names this the **"Purple Ban"** — violet, purple and neon gradients are forbidden, and
the palette centres on clinical teal/green, urgent amber, emergency crimson
(`docs/wiki/mobile-application.md:17`). Verified: **no purple or violet token exists** in
`theme.ts`, and the same three clinical hues reappear in the supervisor dashboard
(`apps/dashboard/index.html:15-22`), so worker and supervisor share one visual language for
severity. For a triage tool where colour carries clinical meaning across two devices, that
consistency is worth more than local aesthetic choice.

**`Spacing`** (`:41-49`) — `xs 4`, `sm 8`, `md 16`, `lg 24`, `xl 32`, **`touchMin 48`**,
**`touchComfort 56`**. The 48dp minimum is a real constraint for gloved, outdoor, low-literacy
field use, and `touchComfort 56` for primary actions (Record, Save, Dial) is the right
dedication.

But the de-facto default horizontal padding is `Spacing.sm + 4` = **12**, a value that appears in
~18 files (`(tabs)/index.tsx:316`, `patients/index.tsx:193`, `voice-capture.tsx:572`,
`village/index.tsx:200`) — because `Spacing` has **no `12` token**. A one-token omission that
bypasses the system across the whole app.

**`Typography`** (`:51-63`) — `Inter` + `Noto Sans Devanagari` at 10 sizes. **Exported and never
imported**: its only occurrence in the entire tree is its own declaration. Every screen hard-codes
its own `fontSize`/`fontWeight` (e.g. `(tabs)/index.tsx:366-368`, `patients/index.tsx:210-213`).

That matters more than it sounds: **Devanagari needs different metrics than Latin.** Without a
token system, line heights and weights are tuned per-screen by eye, and Hindi glyphs (matras,
 conjuncts, the shirorekha) clip or collide at sizes chosen for Inter. The `Noto Sans Devanagari`
family is declared and never applied.

## Accessibility gaps

- **Severity is encoded in colour alone.** `RiskCard` colours all three priorities
  (`Colors.danger` / `warning` / `success`, `:17-18`, `:46-50`) with no textual severity label.
  Red/amber/green is the classic deuteranopia failure, and this is an emergency triage surface.
- **No dynamic type.** Every font size is a hard-coded literal with no `allowFontScaling`
  consideration; there is no responsive-type token anywhere.
- **Light only.** `userInterfaceStyle: "light"` (`app.json:9`) — acceptable for this device class,
  but note the dashboard uses a dark header against a light body, so the two surfaces are not
  identical.
- No `accessibilityLabel` / `accessibilityRole` auditing was performed in this pass — an open gap,
  not a clean bill of health.

## Touch targets

`Spacing.touchMin = 48` / `touchComfort = 56` are declared and the primary CTAs honour them
(`(tabs)/index.tsx:185-202` "Start Field Visit" is an 88dp button per the docset). The tab bar
is 60dp tall with `paddingBottom: 6` (`(tabs)/_layout.tsx:16-23`) — adequate. I did not audit
every `TouchableOpacity` against the 48dp minimum; that remains unverified.

## Related

- [[sources/mobile-ui-navigation]] · [[sources/supervisor-dashboard]]
- [[concepts/explainability]] · [[concepts/deterministic-triage]]
- [[entities/clinical-rule-engine]] · [[sources/shared-package]]
- [[flows/onboarding-and-auth]]
